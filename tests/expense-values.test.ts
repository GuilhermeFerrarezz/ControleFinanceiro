import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, daysBetween, monthPeriod, newExpenseRequestId, parseMoneyInput } from '../src/lib/expense-shared';
import { dateValue, expenseFilters, validateExpense } from '../src/lib/expenses';

test('valores em reais são convertidos para centavos sem arredondamento binário', () => {
  for (const [value, expected] of [['0,01', 1], ['10,10', 1010], ['125,9', 12590], ['1.234,56', 123456], ['R$ 1.250,00', 125000], ['99999999,99', 9999999999]] as const) assert.equal(parseMoneyInput(value), expected);
  for (const value of ['0', '-1,00', '10,999', '12.34', '1e3', 'Infinity', '', '100000000,00', '1,234.56']) assert.equal(parseMoneyInput(value), null);
});
test('datas de calendário, anos bissextos e período anterior são consistentes', () => {
  assert.equal(dateValue('2024-02-29'), '2024-02-29');
  for (const value of ['2026-02-29', '2026-02-30', '2026-13-01', '30/10/2026', '2026-01-01T00:00:00Z']) assert.throws(() => dateValue(value));
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2024-01-01', '2024-12-31'), 366);
  assert.deepEqual(monthPeriod('2026-10-30'), { start: '2026-10-01', end: '2026-10-30' });
  assert.throws(() => expenseFilters(new URLSearchParams('start=2026-10-30&end=2026-10-01')));
  assert.throws(() => expenseFilters(new URLSearchParams('start=2024-01-01&end=2026-01-01')));
});
test('validação rejeita valores fracionários em centavos e categorias arbitrárias', () => {
  const body = { description: 'Compra', amountCents: 12345, date: '2026-10-01', category: 'alimentos' };
  assert.equal(validateExpense(body).amountCents, 12345);
  for (const value of [0, -1, 1.5, NaN, Infinity, '100']) assert.throws(() => validateExpense({ ...body, amountCents: value }));
  assert.throws(() => validateExpense({ ...body, category: 'inventada' }));
  assert.throws(() => validateExpense({ ...body, status: 'inventado' }));
});
test('a proteção contra duplicidade pode gerar identificadores fora de contexto HTTPS', () => {
  const first = newExpenseRequestId(); const second = newExpenseRequestId();
  assert.match(first, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.notEqual(first, second);
});
