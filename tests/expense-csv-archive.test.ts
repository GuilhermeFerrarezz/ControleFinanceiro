import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expenseCsvParts } from '../src/lib/expense-csv-archive';
import { MAX_CSV_BYTES, parseExpenseCsv } from '../src/lib/expense-csv';
import type { IExpense } from '../src/models/Expense';
function row(index: number, notes = ''): IExpense { return { id: randomUUID(), description: `Compra ${index}`, date: '2026-11-01', amountCents: 12345, category: 'alimentos', merchant: 'Mercado', paymentMethod: 'pix', status: 'paid', notes, authorName: 'Autor' } as IExpense; }
test('divide por quantidade com cabeçalho em cada CSV, sem perder ou repetir IDs', async () => {
  const rows = Array.from({ length: 4001 }, (_, index) => row(index));
  const parts = await expenseCsvParts(rows);
  assert.deepEqual(parts.map(part => part.rows), [2000, 2000, 1]);
  const ids = parts.flatMap(part => { const parsed = parseExpenseCsv(part.csv, randomUUID()); assert.deepEqual(parsed.issues, []); assert.equal(Buffer.byteLength(part.csv, 'utf8'), part.bytes); assert.ok(part.bytes <= MAX_CSV_BYTES); return parsed.rows.map(row => row.sourceId); });
  assert.deepEqual(ids, rows.map(row => row.id));
});
test('divide pelo tamanho em bytes UTF-8, incluindo BOM, cabeçalho e aspas', async () => {
  const rows = Array.from({ length: 2000 }, (_, index) => row(index, 'á"'.repeat(500)));
  const parts = await expenseCsvParts(rows); assert.ok(parts.length > 1);
  assert.equal(parts.reduce((sum, part) => sum + part.rows, 0), rows.length);
  for (const part of parts) { assert.ok(part.bytes <= MAX_CSV_BYTES); const parsed = parseExpenseCsv(part.csv, randomUUID()); assert.deepEqual(parsed.issues, []); assert.equal(parsed.rows.length, part.rows); }
});
