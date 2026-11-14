import { decimalCents } from './financial-math';
import { parse } from 'csv-parse/sync';
import { csvCell, MAX_CSV_BYTES, MAX_IMPORT_ROWS } from './expense-csv';
import { dateValue } from './expenses';
import { displayDate, parseMoneyInput, type DailyRevenue } from './expense-shared';
import { normalizeCatalogName } from './catalog-shared';
import { InputError } from './validation';
import { revenueCount } from './revenue-counts';

const headers = ['Data', 'Faturamento (R$)', 'Refeições/marmitex vendidos', 'Número de pedidos', 'Marmitex delivery', 'Refeições no restaurante'];
export function revenueCsv(rows: DailyRevenue[]) {
  return '\uFEFF' + [headers, ...rows.map(row => [displayDate(row.date), decimalCents(row.totalCents), row.mealsSold ?? '', row.orderCount ?? '', row.deliveryMeals ?? '', row.dineInMeals ?? ''])]
    .map(row => row.map(value => csvCell(String(value))).join(';')).join('\r\n');
}

export function parseRevenueCsv(value: unknown): DailyRevenue[] {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_CSV_BYTES) {
    throw new InputError('Selecione um CSV de até 2 MB.');
  }
  for (const delimiter of [';', ',', '\t']) {
    let records: string[][];
    try {
      records = parse(value.replace(/^\uFEFF/, '').replace(/^sep=[;,\t]\r?\n/i, ''),
        { delimiter, bom: true, skip_empty_lines: true, max_record_size: 65536, to: MAX_IMPORT_ROWS + 2 });
    } catch { continue; }
    const columns = records[0]?.map(normalizeCatalogName) ?? [];
    const dateIndex = columns.indexOf('data');
    const amountIndex = columns.findIndex(name => name === 'faturamento' || name === 'faturamento (r$)');
    if (dateIndex < 0 || amountIndex < 0) continue;
    const mealsIndex = columns.indexOf(normalizeCatalogName(headers[2]));
    const ordersIndex = columns.indexOf(normalizeCatalogName(headers[3]));
    for (const name of headers.slice(2).map(normalizeCatalogName)) {
      if (columns.filter(column => column === name).length > 1) throw new InputError('O CSV possui colunas repetidas.');
    }
    if (columns.filter(name => name === 'data').length !== 1 || columns.filter(name => name === 'faturamento' || name === 'faturamento (r$)').length !== 1) throw new InputError('O CSV possui colunas repetidas. Use uma coluna Data e uma Faturamento.');
    if (records.length < 2 || records.length > MAX_IMPORT_ROWS + 1) {
      throw new InputError(`O CSV deve conter entre 1 e ${MAX_IMPORT_ROWS} dias de faturamento.`);
    }
    const dates = new Set<string>();
    return records.slice(1).map((row, index) => {
      try {
        const rawDate = row[dateIndex].trim();
        const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(rawDate);
        const date = dateValue(br ? `${br[3]}-${br[2]}-${br[1]}` : rawDate);
        const rawAmount = row[amountIndex].trim().replace(/^R\$\s*/, '');
        const totalCents = parseMoneyInput(rawAmount.replace(/^(\d+)\.(\d{1,2})$/, '$1,$2'), true);
        if (totalCents === null) throw new InputError('Informe um valor de faturamento válido, como 125,90 ou 0,00.');
        if (dates.has(date)) throw new InputError('Informe apenas um total por dia.');
        dates.add(date);
        const counts: Pick<DailyRevenue, 'mealsSold' | 'orderCount' | 'deliveryMeals' | 'dineInMeals'> = {};
        for (const [column, key, label] of [[mealsIndex, 'mealsSold', headers[2]], [ordersIndex, 'orderCount', headers[3]],
          [columns.indexOf(normalizeCatalogName(headers[4])), 'deliveryMeals', headers[4]],
          [columns.indexOf(normalizeCatalogName(headers[5])), 'dineInMeals', headers[5]]] as const) {
          const raw = column < 0 ? '' : row[column].trim();
          if (raw !== '') {
            if (!/^\d+$/.test(raw)) throw new InputError(`${label}: informe um número inteiro maior ou igual a zero.`);
            counts[key] = revenueCount(Number(raw), label);
          }
        }
        return { date, totalCents, ...counts };
      } catch (error) {
        if (!(error instanceof InputError)) throw error;
        throw new InputError(`Registro ${index + 1}: ${error.message}`);
      }
    });
  }
  throw new InputError('Não foi possível ler o CSV. Use as colunas Data e Faturamento (R$).');
}
