import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { averageCents, changePercent, decimalCents, excelMoney, formatMoney, formatPercent, ratioPercent, safeInteger, subtractCents, sumCents } from '../src/lib/financial-math';
import { buildExpenseSeries, parseMoneyInput } from '../src/lib/expense-shared';
import { financeComparison } from '../src/lib/revenue';
import { expenseFilters } from '../src/lib/expenses';
import { expenseSheetWorkbook } from '../src/lib/expense-sheet-workbook';
import { expenseCsv, parseExpenseCsv } from '../src/lib/expense-csv';
import { revenueCsv, parseRevenueCsv } from '../src/lib/revenue-csv';
import type { IExpense } from '../src/models/Expense';

// Independent quotient/remainder oracle, not floating-point arithmetic.
function referenceRound(n: bigint, d: bigint) {
  let quotient = n / d;
  const remainder = n % d;
  if ((remainder < BigInt(0) ? -remainder : remainder) * BigInt(2) >= d) {
    quotient += n < BigInt(0) ? BigInt(-1) : BigInt(1);
  }
  return quotient;
}

test('centavos permanecem exatos até o limite e entradas inválidas nunca viram zero', () => {
  for (const value of [null, undefined, '', ' ', true, '1.01', '9007199254740990.5', Infinity, NaN, 1.5]) {
    assert.throws(() => safeInteger(value));
  }
  assert.equal(safeInteger('9007199254740991'), Number.MAX_SAFE_INTEGER);
  assert.throws(() => safeInteger('9007199254740992'));
  assert.throws(() => sumCents([Number.MAX_SAFE_INTEGER, 1]));
  assert.throws(() => subtractCents(-Number.MAX_SAFE_INTEGER, 1));
  assert.equal(sumCents([Number.MAX_SAFE_INTEGER, 2, -2]), Number.MAX_SAFE_INTEGER);
  assert.equal(sumCents([10, 20, 1]), 31);
});

test('formatação conserva inclusive o último centavo de totais grandes e negativos', () => {
  for (const sign of [1, -1]) {
    const cents = sign * Number.MAX_SAFE_INTEGER;
    const digits = formatMoney(cents).replace(/\D/g, '');
    assert.equal(digits, '9007199254740991');
    assert.equal(formatMoney(cents).startsWith('-'), sign < 0);
  }
  assert.match(formatMoney(-1), /^-R\$\s0,01$/);
  assert.match(formatMoney(0), /^R\$\s0,00$/);
  assert.equal(decimalCents(Number.MAX_SAFE_INTEGER), '90071992547409,91');
  assert.equal(decimalCents(-1), '-0,01');
  assert.equal(formatPercent('-0.1'), '-0,1');
});

test('arredondamento de médias e percentuais é simétrico, com empates para longe de zero', () => {
  assert.equal(averageCents(1, 2), 1);
  assert.equal(averageCents(-1, 2), -1);
  assert.equal(changePercent(1, 16), '-93.8');
  assert.equal(changePercent(31, 16), '93.8');
  assert.equal(changePercent(1, 80), '-98.8');
  assert.equal(changePercent(0, 10), '-100');
  assert.equal(changePercent(10, 10), '0');
  assert.equal(changePercent(10, 0), null);
  assert.equal(ratioPercent(1, 3), '33.3');
  assert.equal(changePercent(Number.MAX_SAFE_INTEGER, 1), '900719925474099000');
  assert.throws(() => averageCents(10, 0));
});

test('5000 cenários determinísticos conferem com uma referência independente em BigInt', () => {
  let seed = 123456789;
  const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  for (let index = 0; index < 5000; index++) {
    const total = Number((BigInt(next()) * BigInt(2000000) + BigInt(next())) % BigInt(Number.MAX_SAFE_INTEGER));
    const days = next() % 36890 + 1;
    assert.equal(averageCents(total, days), Number(referenceRound(BigInt(total), BigInt(days))));
    const previous = next() + 1;
    const expectedTenths = referenceRound((BigInt(total) - BigInt(previous)) * BigInt(1000), BigInt(previous));
    const actual = changePercent(total, previous)!;
    const negative = actual.startsWith('-');
    const [whole, fraction = '0'] = actual.replace('-', '').split('.');
    const actualTenths = (BigInt(whole) * BigInt(10) + BigInt(fraction)) * BigInt(negative ? -1 : 1);
    assert.equal(actualTenths, expectedTenths);
    assert.equal(formatMoney(total).replace(/\D/g, ''), String(total));
  }
});

test('importações e exportações preservam todos os centavos válidos', () => {
  for (const cents of [1, 10, 101, 123456, 9999999999]) {
    assert.equal(parseMoneyInput(decimalCents(cents)), cents);
    const revenue = [{ date: '2024-02-29', totalCents: cents }];
    assert.deepEqual(parseRevenueCsv(revenueCsv(revenue)), revenue);
    const row = { date: '2024-02-29', amountCents: cents, description: 'Teste', category: 'alimentos', merchant: '', status: 'paid', paymentMethod: 'pix', notes: '', authorName: 'Teste', id: '01234567-89ab-4cde-8fab-0123456789ab' } as IExpense;
    const imported = parseExpenseCsv(expenseCsv([row]), '01234567-89ab-4cde-8fab-0123456789ab');
    assert.deepEqual(imported.issues, []);
    assert.equal(imported.rows[0].input.amountCents, cents);
  }
  assert.equal(parseMoneyInput('0,001'), null);
  assert.equal(parseMoneyInput('100000000,00'), null);
});

test('séries e comparações ignoram valores fora dos limites exatos do período', () => {
  const period = expenseFilters(new URLSearchParams('start=2024-01-15&end=2024-04-20'));
  const rows = [{ date: '2024-01-01', totalCents: 999 }, { date: '2024-01-15', totalCents: 1 }, { date: '2024-04-21', totalCents: 888 }];
  const series = buildExpenseSeries(rows, period.start, period.end);
  assert.equal(series.series[0].totalCents, 1);
  assert.equal(sumCents(series.series.map(row => row.totalCents)), 1);
  assert.equal(series.daysWithExpenses, 1);
  const finance = financeComparison(rows, rows, period);
  assert.equal(finance.revenueCents, 1);
  assert.equal(finance.expenseCents, 1);
  assert.equal(finance.profitCents, 0);
  assert.equal(finance.recordedDays, 1);
});

test('Excel mantém totais acima de 15 algarismos como texto sem perder centavos', async () => {
  const cents = Number.MAX_SAFE_INTEGER;
  assert.equal(excelMoney(cents), '90071992547409,91');
  assert.equal(excelMoney(123), 1.23);
  const filters = expenseFilters(new URLSearchParams('start=2026-01-01&end=2026-01-01'));
  const data = {
    columns: [{ id: 'alimentos', label: 'Alimentos', color: '#000', totalCents: cents }],
    rows: [{ date: filters.start, amounts: [cents], revenueCents: 0, profitCents: -cents }],
    totalCents: cents, filters,
    finance: financeComparison([{ date: filters.start, totalCents: cents }], [{ date: filters.start, totalCents: 0 }], filters),
  } as Parameters<typeof expenseSheetWorkbook>[0];
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Uint8Array.from(await expenseSheetWorkbook(data, 'Teste')).buffer);
  const sheet = book.getWorksheet('Planilha de gastos')!;
  assert.equal(sheet.getCell('B2').value, '90071992547409,91');
  assert.equal(sheet.getCell('C2').value, '90071992547409,91');
  assert.equal(sheet.getCell('E2').value, '-90071992547409,91');
  assert.equal(sheet.getCell('B3').value, '90071992547409,91');
});
