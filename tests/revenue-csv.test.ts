import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRevenueCsv, revenueCsv } from '../src/lib/revenue-csv';
import { MAX_REVENUE_COUNT, revenueCount } from '../src/lib/revenue-counts';

test('quantidades opcionais preservam zero, valores e campos vazios no CSV', () => {
  const rows = [
    { date: '2026-11-01', totalCents: 50000, mealsSold: 80, orderCount: 45, deliveryMeals: 30, dineInMeals: 50 },
    { date: '2026-11-02', totalCents: 0, mealsSold: 0, orderCount: 0, deliveryMeals: 0, dineInMeals: 0 },
    { date: '2026-11-03', totalCents: 10000, orderCount: 10 },
  ];
  assert.deepEqual(parseRevenueCsv(revenueCsv(rows)), rows);
  assert.deepEqual(parseRevenueCsv('Data;Faturamento\n01/11/2026;100,00'), [{ date: '2026-11-01', totalCents: 10000 }]);
});

test('quantidades rejeitam negativos, frações, texto, limite excedido e colunas repetidas', () => {
  for (const value of [-1, 1.5, '10', Number.NaN, MAX_REVENUE_COUNT + 1]) {
    assert.throws(() => revenueCount(value, 'Pedidos'), /número inteiro/);
  }
  assert.equal(revenueCount(undefined, 'Pedidos'), null);
  assert.equal(revenueCount(null, 'Pedidos'), null);
  assert.equal(revenueCount(0, 'Pedidos'), 0);
  assert.equal(revenueCount(MAX_REVENUE_COUNT, 'Pedidos'), MAX_REVENUE_COUNT);
  for (const header of ['Refeições/marmitex vendidos', 'Número de pedidos', 'Marmitex delivery', 'Refeições no restaurante']) {
    for (const value of ['-1', '1,5', '1.5', 'abc', '2147483648']) {
      assert.throws(() => parseRevenueCsv(`Data;Faturamento;${header}\n01/11/2026;100,00;${value}`), /Registro 1:/);
    }
    assert.throws(() => parseRevenueCsv(`Data;Faturamento;${header};${header}\n01/11/2026;100,00;1;2`), /colunas repetidas/);
  }
});

test('CSV de faturamento preserva zero, centavos e datas em exportação e reimportação', () => {
  const rows = [{ date: '2024-02-29', totalCents: 0 }, { date: '2024-03-01', totalCents: 123456 }];
  assert.deepEqual(parseRevenueCsv(revenueCsv(rows)), rows);
});
test('cabeçalhos ambíguos de faturamento são rejeitados sem escolher valores silenciosamente', () => {
  for (const csv of [
    'Data;Data;Faturamento\n01/03/2024;02/03/2024;100,00',
    'Data;Faturamento;Faturamento (R$)\n01/03/2024;100,00;900,00',
    'Data;Faturamento;Faturamento\n01/03/2024;100,00;900,00',
  ]) assert.throws(() => parseRevenueCsv(csv), /colunas repetidas/);
});
