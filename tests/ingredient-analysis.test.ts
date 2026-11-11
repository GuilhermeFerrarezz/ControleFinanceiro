import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateIngredientItems, displayPrice, ingredientPrice, ingredientPriceSeries, normalizeIngredient, priceChange } from '../src/lib/ingredient-analysis';
import { validateExpenseItems } from '../src/lib/expense-items';

test('medidas e embalagens usam conversão exata, incluindo frações pequenas', () => {
  const item = { name: 'Arroz', quantity: 2, unit: 'pacote' as const, amountCents: 5000, packageContent: { quantity: 5, unit: 'kg' as const } };
  assert.deepEqual(normalizeIngredient(item), { unit: 'kg', quantity: '10' });
  assert.deepEqual(normalizeIngredient({ ...item, unit: 'g', quantity: 500, packageContent: undefined }), { unit: 'kg', quantity: '0.5' });
  assert.deepEqual(normalizeIngredient({ ...item, unit: 'caixa', packageContent: { quantity: 6, unit: 'L' } }), { unit: 'L', quantity: '12' });
  assert.deepEqual(normalizeIngredient({ ...item, quantity: 0.001, packageContent: { quantity: 0.001, unit: 'g' } }), { unit: 'kg', quantity: '0.000000001' });
  assert.deepEqual(normalizeIngredient({ ...item, packageContent: undefined }), { unit: 'pacote', quantity: '2' });
  assert.equal(ingredientPrice(5000, '10'), '500');
  assert.equal(ingredientPrice(1, '0.000000001'), '1000000000');
  assert.equal(displayPrice('12345678901234567890'), 'R$ 123.456.789.012.345.678,90');
  assert.equal(priceChange('750', '800'), '-6.3');
});
test('preço médio e gráfico ponderam quantidades, sem somar ou tirar média simples de preços', () => {
  const items = [{ productId: 'rice', name: 'Arroz', quantity: 1, unit: 'kg' as const, amountCents: 1000 }, { productId: 'rice', name: 'Arroz', quantity: 9000, unit: 'g' as const, amountCents: 4500 }];
  assert.deepEqual(aggregateIngredientItems(items), [{ name: 'Arroz', unit: 'kg', quantity: '10', amountCents: 5500, priceCents: '550' }]);
  const daily = [{ productId: 'rice', unit: 'kg', date: '2026-01-01', quantity: '1', totalCents: 1000 }, { productId: 'rice', unit: 'kg', date: '2026-01-02', quantity: '9', totalCents: 4500 }];
  assert.deepEqual(ingredientPriceSeries(daily, 'rice', 'kg', '2026-01-01', '2026-01-03').series.map(day => day.totalCents), [1000, 500, null]);
  assert.equal(ingredientPriceSeries(daily, 'rice', 'kg', '2026-01-01', '2026-12-31').series[0].totalCents, 550);
  assert.equal(ingredientPriceSeries(daily, 'rice', 'L', '2026-01-01', '2026-01-03').series[0].totalCents, null);
});
test('conteúdo inválido ou em unidade incompatível não entra no histórico', () => {
  const item = { name: 'Arroz', quantity: 2, unit: 'pacote', amountCents: 1000 };
  for (const content of [{ quantity: 0, unit: 'kg' }, { quantity: -1, unit: 'kg' }, { quantity: 1.0001, unit: 'kg' }, { quantity: 1, unit: 'caixa' }, { quantity: '5', unit: 'kg' }]) assert.throws(() => validateExpenseItems([{ ...item, packageContent: content }], 1000));
  assert.throws(() => validateExpenseItems([{ ...item, unit: 'kg', packageContent: { quantity: 5, unit: 'kg' } }], 1000));
});
