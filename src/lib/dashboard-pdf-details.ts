import type PDFKit from 'pdfkit';
import { formatPercent, ratioPercent, subtractCents, sumCents } from './financial-math';
import { categoryInfo, displayDate, money, PAYMENT_METHODS, trendPeriodLabel, type ExpenseDashboardData } from './expense-shared';
import { displayPrice, displayQuantity, ingredientPrice, ingredientPriceSeries, priceChange } from './ingredient-analysis';
import { PRODUCT_COLORS, productSpending, productTrend } from './product-analysis';
import { moneyAxisLabel, moneyChartScale } from './chart-scale';

const ink = '#203d31', muted = '#64735a', green = '#254e3b', paper = '#f8f7f2';
type Column = { title: string; width: number };

export function appendDashboardDetails(doc: PDFKit.PDFDocument, data: ExpenseDashboardData, restaurant: string) {
  const products = data.products ?? [];
  const spending = productSpending(products);
  const detailed = sumCents(products.map(item => item.amountCents));
  const start = data.filters.start, end = data.filters.end;
  const clean = (value: string) => value.replace(/[\r\t]+/g, ' ');
  const label = (value: string, x: number, y: number, width: number, size = 9, color = ink, bold = false) => {
    doc.font(bold ? 'ReportBold' : 'Report').fontSize(size).fillColor(color).text(clean(value), x, y, { width, lineGap: 2 });
  };
  const filterText = [data.filters.category ? categoryInfo(data.filters.category, data.categoryOptions).label : 'Todas as categorias',
    `Local: ${data.filters.merchant || 'Todos'}`, data.filters.status === 'paid' ? 'Pagos' : data.filters.status === 'pending' ? 'A pagar' : 'Todas as situações',
    ...(data.filters.q ? [`Busca: ${data.filters.q}`] : [])].join(' | ');
  function newPage(title: string, subtitle: string) {
    doc.addPage(); doc.rect(0, 0, 842, 595).fill(paper);
    label('CONTROLE FINANCEIRO', 36, 23, 770, 10, green, true);
    label(title, 36, 47, 770, 19, ink, true);
    label(`${restaurant} | ${displayDate(start)} a ${displayDate(end)}`, 36, 80, 770, 9, green);
    label(filterText, 36, 100, 770, 8, muted);
    doc.font('Report').fontSize(8);
    const filterHeight = doc.heightOfString(filterText, { width: 770, lineGap: 2 });
    const subtitleY = 106 + Math.max(14, filterHeight);
    label(subtitle, 36, subtitleY, 770, 8, muted);
    doc.font('Report').fontSize(8);
    return subtitleY + Math.max(14, doc.heightOfString(subtitle, { width: 770, lineGap: 2 })) + 12;
  }
  function wrap(value: string, width: number, size = 8.5, bold = false) {
    doc.font(bold ? 'ReportBold' : 'Report').fontSize(size);
    const lines: string[] = [];
    for (const paragraph of clean(value).split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        if (line && doc.widthOfString(`${line} ${word}`) > width) { lines.push(line); line = ''; }
        if (doc.widthOfString(word) > width) {
          for (const character of word) {
            if (line && doc.widthOfString(line + character) > width) { lines.push(line); line = ''; }
            line += character;
          }
        } else line += (line ? ' ' : '') + word;
      }
      lines.push(line);
    }
    return lines;
  }
  function table(title: string, subtitle: string, columns: Column[], rows: string[][]) {
    let y = 0;
    let bodyStart = 0;
    const header = () => {
      y = newPage(title, subtitle);
      const headings = columns.map(column => wrap(column.title, column.width - 16, 8.5, true));
      const height = Math.max(...headings.map(lines => lines.length)) * 12 + 14;
      doc.rect(36, y, 770, height).fill(green);
      let x = 36;
      headings.forEach((lines, index) => {
        lines.forEach((line, position) => label(line, x + 8, y + 7 + position * 12, columns[index].width - 16, 8.5, '#ffffff', true));
        x += columns[index].width;
      });
      y += height;
      bodyStart = y;
    };
    header();
    if (!rows.length) { label('Nenhum registro neste período e filtros.', 44, y + 16, 750, 10, muted); return; }
    rows.forEach((row, index) => {
      const cells = columns.map((column, position) => wrap(row[position] ?? '', column.width - 16));
      const lineCount = Math.max(...cells.map(lines => lines.length));
      const rowHeight = lineCount * 12 + 12;
      if (y + rowHeight > 548 && rowHeight <= 548 - bodyStart) header();
      let offset = 0;
      while (offset < lineCount) {
        if (y + 26 > 548) header();
        const lines = Math.min(lineCount - offset, Math.floor((548 - y - 12) / 12));
        const height = lines * 12 + 12;
        doc.rect(36, y, 770, height).fill(index % 2 ? '#edf1e7' : '#fffefa');
        let x = 36;
        cells.forEach((cell, position) => {
          cell.slice(offset, offset + lines).forEach((line, lineIndex) => label(line, x + 8, y + 6 + lineIndex * 12, columns[position].width - 16, 8.5));
          x += columns[position].width;
        });
        y += height; offset += lines;
      }
    });
  }
  function lineChart(series: { date: string; totalCents: number | null }[], interval: 'day' | 'month' | 'year', x: number, y: number, width: number, height: number) {
    const left = x + 62, right = x + width - 16, top = y + 22, bottom = y + height - 28;
    const scale = moneyChartScale(series.map(row => row.totalCents));
    const xx = (index: number) => series.length === 1 ? (left + right) / 2 : left + index / Math.max(1, series.length - 1) * (right - left);
    const yy = (value: number) => bottom - (value - scale.min) / (scale.max - scale.min) * (bottom - top);
    label('R$', x, y + 2, 50, 8, muted);
    for (const tick of scale.ticks) {
      doc.moveTo(left, yy(tick)).lineTo(right, yy(tick)).lineWidth(.5).strokeColor('#dce3d2').stroke();
      label(moneyAxisLabel(tick), x, yy(tick) - 5, 53, 8, muted);
    }
    let previous: { x: number; y: number } | null = null;
    for (const [index, row] of series.entries()) {
      if (row.totalCents === null) { previous = null; continue; }
      const point = { x: xx(index), y: yy(row.totalCents) };
      if (previous) doc.moveTo(previous.x, previous.y).lineTo(point.x, point.y).lineWidth(1.8).strokeColor('#42694d').stroke();
      if (series.length <= 90 || !previous) doc.circle(point.x, point.y, 2).fill('#42694d');
      previous = point;
    }
    const indices = [...new Set([0, Math.floor((series.length - 1) / 4), Math.floor((series.length - 1) / 2), Math.floor((series.length - 1) * .75), series.length - 1])].filter(index => index >= 0);
    for (const index of indices) label(trendPeriodLabel(series[index].date, interval, true), xx(index) - 23, bottom + 9, 55, 7, muted);
  }

  if (products.length) {
    const top = newPage('Compras por produto', 'Compras informadas no período inteiro, independentemente da página da lista de lançamentos.');
    label(`Detalhado: ${money(detailed)} | Sem detalhamento: ${money(subtractCents(data.summary.totalCents, detailed))}`, 36, top, 770, 12, green, true);
    label('Evolução das compras detalhadas', 36, top + 35, 440, 12, ink, true);
    const trend = productTrend(data.productDaily ?? [], start, end, '');
    lineChart(trend.series, trend.seriesInterval, 36, top + 61, 440, 224);
    label('O peso de cada produto', 510, top + 35, 296, 12, ink, true);
    const slices = [...spending.slice(0, 7), ...(spending.length > 7 ? [{ id: 'remaining', name: 'Demais produtos', totalCents: sumCents(spending.slice(7).map(item => item.totalCents)) }] : [])];
    const cx = 658, cy = top + 115, radius = 50, inner = 32;
    let from = 0;
    slices.forEach((item, index) => {
      const to = from + item.totalCents / detailed, mid = (from + to) / 2;
      const point = (r: number, part: number) => `${cx + r * Math.cos((part * 360 - 90) * Math.PI / 180)} ${cy + r * Math.sin((part * 360 - 90) * Math.PI / 180)}`;
      doc.path(`M${point(radius, from)} A${radius} ${radius} 0 0 1 ${point(radius, mid)} A${radius} ${radius} 0 0 1 ${point(radius, to)} L${point(inner, to)} A${inner} ${inner} 0 0 0 ${point(inner, mid)} A${inner} ${inner} 0 0 0 ${point(inner, from)} Z`).fill(PRODUCT_COLORS[index]);
      from = to;
      const y = top + 181 + index * 19;
      doc.circle(515, y + 5, 3).fill(PRODUCT_COLORS[index]);
      // Full product names and amounts also appear in the ranking table below.
      doc.font('Report').fontSize(8).fillColor(ink).text(item.name, 526, y, { width: 190, height: 15, ellipsis: true });
      label(`${formatPercent(ratioPercent(item.totalCents, detailed) ?? '0')}%`, 734, y, 72, 8, green, true);
    });
    label(`Maior compra detalhada: ${trend.peakDay ? `${money(trend.peakDay.totalCents)} em ${displayDate(trend.peakDay.date)}` : 'Sem registro'}`, 36, top + 307, 440, 9);
    label(`${trend.daysWithExpenses} dias com compras detalhadas. Quantidades representam aquisição, não estoque ou consumo.`, 36, top + 335, 440, 8, muted);

    table('Produtos que mais pesam na conta', `Participação no valor detalhado: ${money(detailed)}. Lista completa em ordem de gasto; os oito primeiros formam o ranking da Visão geral.`,
      [{ title: 'Posição', width: 55 }, { title: 'Produto', width: 365 }, { title: 'Valor gasto', width: 190 }, { title: '% do detalhado', width: 160 }],
      spending.map((item, index) => [String(index + 1), item.name, money(item.totalCents), `${formatPercent(ratioPercent(item.totalCents, detailed) ?? '0')}%`]));

    table('Quantidades e preços dos insumos', 'Preço médio ponderado = valor gasto / quantidade. Variação entre as duas últimas compras na mesma medida. kg/g e L/ml reunidos; embalagens convertidas quando informadas.',
      [{ title: 'Insumo', width: 190 }, { title: 'Quantidade total', width: 100 }, { title: 'Compras', width: 55 }, { title: 'Valor gasto', width: 120 },
        { title: 'Preço médio', width: 105 }, { title: 'Último preço / data', width: 115 }, { title: 'Variação', width: 85 }],
      products.map(item => {
        const [last, previous] = item.recentPrices ?? [];
        const change = last && previous ? priceChange(last.priceCents, previous.priceCents) : null;
        const average = item.averagePriceCents || ingredientPrice(item.amountCents, item.quantityText || String(item.quantity)) || '0';
        return [item.name, `${displayQuantity(item.quantityText || String(item.quantity))} ${item.unit}`, String(item.purchases), money(item.amountCents),
          `${displayPrice(average)}/${item.unit}`, last ? `${displayPrice(last.priceCents)}/${item.unit}\n${displayDate(last.date)}` : 'Sem registro',
          change === null ? 'Sem comparação' : `${change.startsWith('-') || change === '0' ? '' : '+'}${formatPercent(change)}%`];
      }));

    for (let index = 0; index < products.length; index += 2) {
      const top = newPage('Evolução do preço dos insumos', 'Médias ponderadas por dia, mês ou ano. Lacunas indicam ausência de compras comparáveis; o preço é calculado por medida.');
      products.slice(index, index + 2).forEach((item, position) => {
        const y = top + position * 195;
        const title = `${item.name} | preço por ${item.unit}`;
        label(title, 36, y, 770, 11, green, true);
        doc.font('ReportBold').fontSize(11);
        const titleHeight = Math.max(16, doc.heightOfString(title, { width: 770, lineGap: 2 }));
        const trend = ingredientPriceSeries(data.ingredientDaily ?? [], item.productId || item.name, item.unit, start, end);
        lineChart(trend.series, trend.interval, 36, y + titleHeight + 6, 770, 183 - titleHeight);
      });
    }
  }

  if (data.expenses.length) {
    const latest = [...data.expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    table('Últimos lançamentos', 'Os cinco registros mais recentes da Visão geral, com produtos e observações. Consulte o total completo nas demais seções.',
      [{ title: 'Data / gasto', width: 165 }, { title: 'Categoria / local / autor', width: 175 }, { title: 'Valor / situação / pagamento', width: 130 }, { title: 'Produtos e observações', width: 300 }],
      latest.map(expense => [
        `${displayDate(expense.date)}\n${expense.description}${expense.isDemo ? '\nExemplo' : ''}`,
        `${categoryInfo(expense.category, data.categoryOptions).label}\n${expense.merchant || 'Local não informado'}\nLançado por ${expense.authorName}`,
        `${money(expense.amountCents)}\n${expense.status === 'paid' ? 'Pago' : 'A pagar'}\n${PAYMENT_METHODS.find(item => item.id === expense.paymentMethod)?.label || 'Não informado'}`,
        [...(expense.items ?? []).map(item => `${item.name}: ${displayQuantity(String(item.quantity))} ${item.unit}${item.packageContent ? ` (${displayQuantity(String(item.packageContent.quantity))} ${item.packageContent.unit} por embalagem)` : ''} | ${money(item.amountCents)}`),
          ...(!expense.items?.length ? ['Sem produtos detalhados.'] : []), ...(expense.notes ? [`Observações: ${expense.notes}`] : [])].join('\n'),
      ]));
  }
}
