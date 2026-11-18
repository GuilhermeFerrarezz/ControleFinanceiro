import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { db } from '../src/lib/db';
import { isolatedDatabase } from '../tests/postgres-fixture';
import { importExpenseCsv, parseExpenseCsv, previewExpenseCsv } from '../src/lib/expense-csv';
import { listCategories } from '../src/models/Catalog';
import { expenseExportData, expenseFilters } from '../src/lib/expenses';
import { parseRevenueCsv } from '../src/lib/revenue-csv';
import { listRevenue, saveRevenue } from '../src/lib/revenue';
import type { ExpenseInput } from '../src/lib/expense-shared';
import { normalizeCatalogName } from '../src/lib/catalog-shared';

const canonical = (row: ExpenseInput) => JSON.stringify({
  date: row.date, description: row.description, category: row.category, amountCents: row.amountCents,
  merchant: row.merchant, status: row.status, paymentMethod: row.paymentMethod, notes: row.notes,
  items: (row.items ?? []).map(item => ({ name: normalizeCatalogName(item.name), quantity: item.quantity, unit: item.unit,
    amountCents: item.amountCents, packageContent: item.packageContent ? { quantity: item.packageContent.quantity, unit: item.packageContent.unit } : null })),
});

async function worker(folder: string) {
  const report = JSON.parse(await readFile(resolve(folder, 'auditoria.json'), 'utf8'));
  const empresaId = (await db.query("INSERT INTO empresas(nome) VALUES ('Conferência temporária de importação') RETURNING id")).rows[0].id;
  const userId = (await db.query("INSERT INTO usuarios(nome,email,senha,empresa_id) VALUES ('Auditor temporário','audit@roundtrip.invalid','unused',$1) RETURNING id", [empresaId])).rows[0].id;
  await db.query("INSERT INTO restaurant_members(user_id,empresa_id,role) VALUES ($1,$2,'owner')", [userId, empresaId]);
  const actor = { id: userId, empresaId, role: 'owner' };
  const files = (await readdir(folder)).filter(name => /^gastos-parte-\d+\.csv$/.test(name)).sort();
  const csvs = await Promise.all(files.map(name => readFile(resolve(folder, name), 'utf8')));
  let imported = 0;
  for (const csv of csvs) {
    const preview = await previewExpenseCsv(actor, csv);
    const result = await importExpenseCsv(actor, csv, preview.unknownCategories);
    imported += result.imported;
    const repeat = await importExpenseCsv(actor, csv, preview.unknownCategories);
    assert.equal(repeat.imported, 0);
    assert.equal(repeat.duplicates, result.imported);
  }
  assert.equal(imported, report.expenses);
  const categories = await listCategories(empresaId);
  const source = csvs.flatMap(csv => {
    const parsed = parseExpenseCsv(csv, empresaId, categories);
    assert.deepEqual(parsed.issues, []);
    return parsed.rows.map(row => canonical(row.input));
  }).sort();
  const revenueSource = parseRevenueCsv(await readFile(resolve(folder, 'faturamento.csv'), 'utf8'));
  assert.equal((await saveRevenue(actor, revenueSource, false))?.saved, report.revenueDays);
  assert.equal((await saveRevenue(actor, revenueSource, false))?.saved, 0);
  const filters = expenseFilters(new URLSearchParams({ start: report.start, end: report.end }));
  const target = await expenseExportData(actor, filters);
  assert.deepEqual(target.rows.map(canonical).sort(), source);
  assert.ok(target.rows.every(row => row.createdBy === userId));
  const revenueTarget = await listRevenue(empresaId, filters);
  assert.equal(revenueTarget.length, revenueSource.length);
  for (const [index, row] of revenueSource.entries()) {
    assert.equal(revenueTarget[index].date, row.date);
    assert.equal(revenueTarget[index].totalCents, row.totalCents);
    for (const field of ['mealsSold', 'orderCount', 'deliveryMeals', 'dineInMeals'] as const) assert.equal(revenueTarget[index][field] ?? null, row[field] ?? null);
  }
  console.log(JSON.stringify({ expensesImportedAndCompared: imported, revenueDaysImportedAndCompared: revenueTarget.length,
    duplicateExpensesAdded: 0, duplicateRevenueDaysAdded: 0, allBusinessFieldsPreserved: true,
    author: 'Novos registros pertencem ao usuário que importou; IDs são locais ao destino.',
    products: 'Nomes são resolvidos pelo catálogo local, desconsiderando diferenças de maiúsculas e acentuação.' }));
}

async function main() {
  if (process.argv[2] === '--worker') return worker(resolve(process.argv[3]));
  const folder = resolve(process.argv[2] ?? '');
  if (!process.argv[2]) throw new Error('Informe a pasta gerada pela auditoria.');
  const fixture = await isolatedDatabase();
  try {
    const { stdout } = await promisify(execFile)(process.execPath, ['--conditions=react-server', '--import', 'tsx', 'scripts/verify-financial-roundtrip.ts', '--worker', folder], {
      env: { ...process.env, DATABASE_URL: fixture.connectionString }, windowsHide: true, maxBuffer: 1024 * 1024,
    });
    const result = JSON.parse(stdout);
    await writeFile(resolve(folder, 'reimportacao-verificada.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await fixture.cleanup(); }
}
main().catch(error => {
  console.error(error instanceof assert.AssertionError ? `Divergência: ${error.message}`
    : typeof error?.stderr === 'string' ? error.stderr.trim()
    : error instanceof Error && !('code' in error) ? error.message : 'Não foi possível verificar a reimportação em ambiente isolado.');
  process.exitCode = 1;
}).finally(() => db.end());
