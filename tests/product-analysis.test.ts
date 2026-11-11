import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productSpending, productTrend } from '../src/lib/product-analysis';

test('gráficos somam custo por produto sem misturar quantidades de unidades diferentes', () => {
  const rows = [
    { productId: 'rice', name: 'Arroz', quantity: 10, unit: 'kg' as const, amountCents: 4500, purchases: 1 },
    { productId: 'rice', name: 'Arroz', quantity: 500, unit: 'g' as const, amountCents: 250, purchases: 1 },
    { productId: 'beans', name: 'Feijão', quantity: 3, unit: 'kg' as const, amountCents: 3000, purchases: 1 },
  ];
  assert.deepEqual(productSpending(rows), [{ id: 'rice', name: 'Arroz', totalCents: 4750 }, { id: 'beans', name: 'Feijão', totalCents: 3000 }]);
  assert.equal(rows[0].quantity, 10);
});
test('evolução por produto respeita período e preenche dias sem compra', () => {
  const daily = [
    { date: '2024-02-28', productId: 'rice', name: 'Arroz', totalCents: 101 },
    { date: '2024-02-28', productId: 'beans', name: 'Feijão', totalCents: 300 },
    { date: '2024-02-29', productId: 'rice', name: 'Arroz', totalCents: 202 },
    { date: '2024-03-02', productId: 'rice', name: 'Arroz', totalCents: 9999 },
  ];
  assert.deepEqual(productTrend(daily, '2024-02-28', '2024-03-01', 'rice').series.map(item => item.totalCents), [101, 202, 0]);
  assert.deepEqual(productTrend(daily, '2024-02-28', '2024-03-01', '').series.map(item => item.totalCents), [401, 202, 0]);
  assert.deepEqual(productSpending([]), []);
});
