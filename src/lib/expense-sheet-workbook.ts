import ExcelJS from 'exceljs';
import type { expenseSheet } from './expenses';
import { displayDate } from './expense-shared';

export async function expenseSheetWorkbook(data: Awaited<ReturnType<typeof expenseSheet>>, restaurant: string) {
  const { columns, rows, totalCents, finance, filters } = data;
  const book = new ExcelJS.Workbook();
  book.creator = 'Saldo da Casa';
  const sheet = book.addWorksheet('Planilha de gastos', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
  sheet.columns = [
    { header: 'Dia', width: 16 },
    ...columns.map(item => ({
      header: item.archived ? `${item.label} (Arquivada)` : item.label,
      width: Math.min(38, Math.max(18, item.label.length + 3)),
    })),
    { header: 'Total do dia', width: 20 },
    { header: 'Faturamento', width: 20 },
    { header: 'Resultado', width: 20 },
  ];
  const currency = (cents: number | null) => cents === null ? null : cents / 100;
  for (const row of rows) {
    sheet.addRow([
      new Date(`${row.date}T00:00:00Z`), ...row.amounts.map(amount => amount ? currency(amount) : null),
      currency(row.amounts.reduce((sum, amount) => sum + amount, 0)), currency(row.revenueCents), currency(row.profitCents),
    ]);
  }
  const total = sheet.addRow([
    'Total do período', ...columns.map(item => currency(item.totalCents)), currency(totalCents),
    finance.recordedDays ? currency(finance.revenueCents) : null, currency(finance.profitCents),
  ]);
  sheet.getColumn(1).numFmt = 'dd/mm/yyyy';
  for (let col = 2; col <= sheet.columnCount; col++) sheet.getColumn(col).numFmt = '"R$" #,##0.00';
  const header = sheet.getRow(1);
  header.height = 30;
  header.alignment = { vertical: 'middle', wrapText: true };
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF254E3B' } };
  for (let i = 2; i < total.number; i += 2) {
    sheet.getRow(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F5ED' } };
  }
  total.height = 24;
  total.font = { bold: true, color: { argb: 'FF254E3B' } };
  total.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2E5' } };

  const summary = book.addWorksheet('Resumo');
  summary.columns = [{ width: 28 }, { width: 84 }];
  summary.addRows([
    ['Saldo da Casa', restaurant],
    ['Período', `${displayDate(filters.start)} a ${displayDate(filters.end)}`],
    ['Categoria', filters.category ? columns.find(item => item.id === filters.category)?.label : 'Todas'],
    ['Local', filters.merchant || 'Todos'],
    ['Situação', filters.status === 'paid' ? 'Pagos' : filters.status === 'pending' ? 'A pagar' : 'Todas'],
    ['Busca', filters.q || 'Sem busca'],
    ['Faturamento informado', `${finance.recordedDays} de ${finance.periodDays} dias`],
    ['Resultado', 'Compara o faturamento informado com todos os gastos do restaurante. Pode ser parcial se faltar faturamento.'],
  ]);
  summary.getRow(1).font = { bold: true, color: { argb: 'FF254E3B' } };
  summary.getRow(8).height = 34;
  summary.getRow(8).alignment = { wrapText: true, vertical: 'middle' };
  return new Uint8Array(await book.xlsx.writeBuffer());
}
