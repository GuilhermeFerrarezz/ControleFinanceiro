import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { db } from '../src/lib/db';
import { expenseDashboard, expenseExportData, expenseFilters, expenseSheet, validateExpense } from '../src/lib/expenses';
import { expenseCsvParts, expenseCsvArchive } from '../src/lib/expense-csv-archive';
import { parseExpenseCsv, previewExpenseCsv } from '../src/lib/expense-csv';
import { parseRevenueCsv, revenueCsv } from '../src/lib/revenue-csv';
import { expenseWorkbook } from '../src/lib/expense-workbook';
import { expenseSheetWorkbook } from '../src/lib/expense-sheet-workbook';
import { REVENUE_METRICS, revenueCountSeries } from '../src/lib/revenue-series';
import { sumCents } from '../src/lib/financial-math';
import { listProducts } from '../src/models/Catalog';

async function main() {
  const [email, empresaId, start, end] = process.argv.slice(2);
  if (!email || !empresaId || !start || !end) throw new Error('Informe e-mail do dono, restaurante, início e fim.');
  const user = (await db.query<{ id: string; nome: string }>(`SELECT u.id,e.nome FROM usuarios u JOIN restaurant_members m ON m.user_id=u.id JOIN empresas e ON e.id=m.empresa_id WHERE lower(btrim(u.email))=$1 AND m.empresa_id=$2 AND m.role='owner'`, [email, empresaId])).rows[0];
  assert.ok(user, 'Conta administradora não encontrada.');
  const actor = { id: user.id, empresaId, role: 'owner' };
  const filters = expenseFilters(new URLSearchParams({ start, end }));
  const data = await expenseExportData(actor, filters);
  const dashboard = await expenseDashboard(actor, filters);
  const sheet = await expenseSheet(actor, filters, 'manual', { exportColumnIds: [] });
  const total = sumCents(data.rows.map(row => row.amountCents));
  const revenue = data.financial.revenue;
  assert.equal(total, dashboard.summary.totalCents);
  assert.equal(total, sheet.totalCents);
  assert.equal(sumCents(dashboard.series.map(row => row.totalCents)), total);
  assert.equal(sumCents(sheet.rows.flatMap(row => row.amounts)), total);
  assert.equal(sumCents(data.financial.expenses.map(row => row.totalCents)), total);
  assert.equal(dashboard.count, data.rows.length);
  assert.equal(dashboard.summary.paidCents + dashboard.summary.pendingCents, total);
  assert.equal(dashboard.finance?.revenueCents, sumCents(revenue.map(row => row.totalCents)));
  assert.equal(dashboard.finance?.profitCents, sheet.finance.profitCents);
  const folder = resolve('reports', `financial-audit-${start}-${end}`);
  await mkdir(folder, { recursive: true });
  const byId = new Map(data.rows.map(row => [row.id, row]));
  const parts = await expenseCsvParts(data.rows);
  let csvRows = 0;
  for (const [index, part] of parts.entries()) {
    const parsed = parseExpenseCsv(part.csv, empresaId, data.categories);
    assert.deepEqual(parsed.issues, []);
    assert.equal(parsed.rows.length, part.rows);
    for (const row of parsed.rows) {
      const original = byId.get(row.sourceId!);
      assert.ok(original);
      assert.deepEqual(row.input, validateExpense(original as unknown as Record<string, unknown>));
    }
    const preview = await previewExpenseCsv(actor, part.csv);
    assert.equal(preview.totalErrors, 0);
    assert.equal(preview.duplicates, part.rows);
    csvRows += part.rows;
    await writeFile(resolve(folder, `gastos-parte-${index + 1}.csv`), part.csv);
  }
  assert.equal(csvRows, data.rows.length);
  const revenueContent = revenueCsv(revenue);
  const parsedRevenue = parseRevenueCsv(revenueContent);
  const fields = ['mealsSold', 'orderCount', 'deliveryMeals', 'dineInMeals'] as const;
  assert.equal(parsedRevenue.length, revenue.length);
  for (const [index, row] of revenue.entries()) {
    assert.equal(parsedRevenue[index].date, row.date);
    assert.equal(parsedRevenue[index].totalCents, row.totalCents);
    for (const key of fields) assert.equal(parsedRevenue[index][key] ?? null, row[key] ?? null);
  }
  const quantities = REVENUE_METRICS.map(metric => {
    const chart = revenueCountSeries(revenue, metric.key, start, end);
    assert.equal(sumCents(chart.series.map(row => row.totalCents ?? 0)), chart.total);
    assert.equal(chart.total, revenue.reduce((sum, row) => sum + (row[metric.key] ?? 0), 0));
    return { field: metric.key, total: chart.total, recordedDays: chart.recordedDays };
  });
  const bytes = await expenseWorkbook(data.rows, filters, user.nome, data.categories, data.financial);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
  const expenses = workbook.getWorksheet('Lançamentos')!;
  for (const [index, original] of data.rows.entries()) {
    const row = expenses.getRow(index + 2);
    assert.equal((row.getCell(1).value as Date).toISOString().slice(0, 10), original.date);
    assert.equal(Math.round(Number(row.getCell(3).value) * 100), original.amountCents);
    assert.equal(row.getCell(10).value, original.id);
    assert.deepEqual(JSON.parse(String(row.getCell(11).value)), original.items ?? []);
    assert.equal(row.getCell(9).value ?? '', original.notes);
  }
  const financial = workbook.getWorksheet('Faturamento')!;
  const revenueByDate = new Map(revenue.map(row => [row.date, row]));
  for (let index = 2; index <= financial.rowCount; index++) {
    const row = financial.getRow(index);
    const original = revenueByDate.get((row.getCell(1).value as Date).toISOString().slice(0, 10));
    if (!original) continue;
    assert.equal(Math.round(Number(row.getCell(2).value) * 100), original.totalCents);
    for (const [offset, key] of fields.entries()) assert.equal(row.getCell(offset + 5).value ?? null, original[key] ?? null);
  }
  const sheetBytes = await expenseSheetWorkbook(sheet, user.nome);
  const sheetBook = new ExcelJS.Workbook();
  await sheetBook.xlsx.load(Uint8Array.from(sheetBytes).buffer);
  const sheetTab = sheetBook.getWorksheet('Planilha de gastos')!;
  assert.equal(Math.round(Number(sheetTab.getRow(sheetTab.rowCount).getCell(sheet.columns.length + 2).value) * 100), total);
  const archive = await expenseCsvArchive(actor, filters);
  const zip = await JSZip.loadAsync(archive);
  const manifest = JSON.parse(await zip.file('manifesto.json')!.async('string'));
  assert.equal(manifest.lancamentos, data.rows.length);
  assert.equal(manifest.totalCentavos, total);
  const products = await listProducts(empresaId);
  const ids = new Set(products.map(row => row.id));
  const missingProducts = data.rows.flatMap(row => row.items ?? []).filter(item => !item.productId || !ids.has(item.productId));
  const report = {
    restaurant: user.nome, start, end, expenses: data.rows.length, revenueDays: revenue.length,
    expenseCents: total, revenueCents: dashboard.finance?.revenueCents, profitCents: dashboard.finance?.profitCents,
    quantities, csvParts: parts.length, csvRows, missingProductReferences: missingProducts.length,
    checks: ['Banco, painel, séries e planilha reconciliados', 'CSV de gastos: todos os campos e produtos conferidos',
      'Prévia de reimportação: registros existentes reconhecidos como duplicados', 'CSV de faturamento: valores e todas as quantidades conferidos',
      'Excel: datas, centavos, IDs, observações, produtos e faturamento conferidos', 'Planilha Excel: total reconciliado', 'ZIP: manifesto reconciliado'],
  };
  assert.equal(missingProducts.length, 0, 'Há produtos sem vínculo com o catálogo.');
  await Promise.all([
    writeFile(resolve(folder, 'faturamento.csv'), revenueContent), writeFile(resolve(folder, 'financeiro.xlsx'), bytes),
    writeFile(resolve(folder, 'planilha.xlsx'), sheetBytes), writeFile(resolve(folder, 'gastos.zip'), archive),
    writeFile(resolve(folder, 'auditoria.json'), JSON.stringify(report, null, 2)),
  ]);
  console.log(JSON.stringify({ ...report, folder }));
}
main().catch(error => {
  console.error(error instanceof assert.AssertionError ? `Divergência: ${error.message}` : 'Não foi possível concluir a auditoria financeira.');
  process.exitCode = 1;
}).finally(() => db.end());
