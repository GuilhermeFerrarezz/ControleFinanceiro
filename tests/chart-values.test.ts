import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moneyAxisLabel, moneyChartScale } from '../src/lib/chart-scale';
import { financeComparison } from '../src/lib/revenue';
import { expenseFilters } from '../src/lib/expenses';
import { chartPeriodIndex } from '../src/components/chart-pointer';

test('um único período continua selecionável sem divisão por zero', () => {
  const event = { currentTarget: { getScreenCTM: () => ({}) } } as Parameters<typeof chartPeriodIndex>[0];
  assert.equal(chartPeriodIndex(event, 390, 390, 1), 0);
  assert.equal(chartPeriodIndex(event, 80, 700, 0), null);
});

test('a escala mantém centavos distintos e inclui zero e prejuízos', () => {
  const small = moneyChartScale([1, 2, null]);
  assert.equal(small.min, 0);
  assert.ok(small.max >= 2);
  assert.equal(new Set(small.ticks.map(moneyAxisLabel)).size, small.ticks.length);
  assert.equal(moneyAxisLabel(1), '0,01');
  const mixed = moneyChartScale([-123456, 0, 789012]);
  assert.ok(mixed.min <= -123456);
  assert.ok(mixed.max >= 789012);
  assert.ok(mixed.ticks.includes(0));
  const empty = moneyChartScale([null, 0]);
  assert.ok(empty.max > empty.min);
});

test('a comparação distingue faturamento zero, ausente e prejuízo sem alterar os totais', () => {
  const finance = financeComparison([
    { date: '2026-11-01', totalCents: 1000 },
    { date: '2026-11-02', totalCents: 500 },
    { date: '2026-11-03', totalCents: 700 },
  ], [
    { date: '2026-11-01', totalCents: 2000 },
    { date: '2026-11-02', totalCents: 0 },
  ], expenseFilters(new URLSearchParams('start=2026-11-01&end=2026-11-03')));
  assert.equal(finance.profitCents, -200);
  assert.deepEqual(finance.series.map(row => row.profitCents), [1000, -500, null]);
  assert.deepEqual(finance.series.map(row => row.revenueCents), [2000, 0, null]);
  assert.deepEqual(finance.series.map(row => row.recordedDays), [1, 1, 0]);
  assert.deepEqual(finance.series.map(row => row.periodDays), [1, 1, 1]);
});

test('a cobertura mensal respeita meses incompletos e fevereiro bissexto', () => {
  const finance = financeComparison([], [
    { date: '2024-02-29', totalCents: 12345 },
  ], expenseFilters(new URLSearchParams('start=2024-01-15&end=2024-04-20')));
  assert.equal(finance.seriesInterval, 'month');
  assert.deepEqual(finance.series.map(row => row.periodDays), [17, 29, 31, 20]);
  assert.deepEqual(finance.series.map(row => row.recordedDays), [0, 1, 0, 0]);
  assert.equal(finance.series[1].revenueCents, 12345);
  assert.equal(finance.series.reduce((sum, row) => sum + row.periodDays, 0), finance.periodDays);
});

test('a cobertura anual respeita os limites do intervalo selecionado', () => {
  const finance = financeComparison([], [], expenseFilters(new URLSearchParams('start=2020-12-31&end=2027-01-01')));
  assert.equal(finance.seriesInterval, 'year');
  assert.equal(finance.series[0].periodDays, 1);
  assert.equal(finance.series.at(-1)!.periodDays, 1);
  assert.equal(finance.series.reduce((sum, row) => sum + row.periodDays, 0), finance.periodDays);
  assert.equal(finance.profitCents, null);
});
