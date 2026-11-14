import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revenueCountSeries } from '../src/lib/revenue-series';

test('gráficos separam delivery e restaurante, preservam zero e deixam lacunas para dados ausentes', () => {
  const rows = [
    { date: '2026-11-01', totalCents: 10000, mealsSold: 100, deliveryMeals: 8, dineInMeals: 12, orderCount: 6 },
    { date: '2026-11-02', totalCents: 0, deliveryMeals: 0 },
    { date: '2026-11-03', totalCents: 10000, mealsSold: 40 },
    { date: '2026-10-31', totalCents: 10000, deliveryMeals: 999 },
  ];
  const delivery = revenueCountSeries(rows, 'deliveryMeals', '2026-11-01', '2026-11-04');
  assert.deepEqual(delivery.series.map(row => row.totalCents), [8, 0, null, null]);
  assert.equal(delivery.total, 8);
  assert.equal(delivery.recordedDays, 2);
  assert.deepEqual(delivery.peak, { date: '2026-11-01', totalCents: 8 });
  const restaurant = revenueCountSeries(rows, 'dineInMeals', '2026-11-01', '2026-11-04');
  assert.deepEqual(restaurant.series.map(row => row.totalCents), [12, null, null, null]);
  assert.equal(revenueCountSeries(rows, 'orderCount', '2026-11-01', '2026-11-04').total, 6);
});

test('gráficos agrupam quantidades por mês e ano conforme o período', () => {
  const rows = [
    { date: '2026-01-01', totalCents: 0, deliveryMeals: 5 },
    { date: '2026-01-02', totalCents: 0, deliveryMeals: 7 },
    { date: '2026-03-01', totalCents: 0, deliveryMeals: 0 },
  ];
  const monthly = revenueCountSeries(rows, 'deliveryMeals', '2026-01-01', '2026-12-31');
  assert.equal(monthly.interval, 'month');
  assert.deepEqual(monthly.series.slice(0, 3).map(row => row.totalCents), [12, null, 0]);
  const yearly = revenueCountSeries(rows, 'deliveryMeals', '2020-01-01', '2026-12-31');
  assert.equal(yearly.interval, 'year');
  assert.equal(yearly.series.at(-1)?.totalCents, 12);
  const empty = revenueCountSeries([], 'orderCount', '2026-11-01', '2026-11-30');
  assert.equal(empty.recordedDays, 0);
  assert.equal(empty.peak, null);
  assert.ok(empty.series.every(row => row.totalCents === null));
});
