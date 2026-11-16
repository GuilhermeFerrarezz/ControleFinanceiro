import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stockBalance, stockQuantity } from '../src/lib/inventory-shared';
import { recordInventoryMovement } from '../src/lib/inventory';
import type { Queryable } from '../src/lib/postgres';

test('saldo de conferência aceita a escala do PostgreSQL sem alterar os limites da quantidade digitada', () => {
  assert.equal(stockBalance('6.00000000000000000000'), '6');
  assert.equal(stockBalance('0.00000000100000000000'), '0.000000001');
  assert.equal(stockBalance('2000000.12345678900000'), '2000000.123456789');
  for (const value of ['', null, '-1', 'NaN', '1e3', '0.0000000001']) assert.throws(() => stockBalance(value));
  for (const value of ['1000001', '0.0000000001', '-1', '6.00000000000000000000']) assert.throws(() => stockQuantity(value));
  assert.equal(stockQuantity('2,5'), '2.5');
  assert.equal(stockQuantity('0'), '0');
  assert.throws(() => stockQuantity('0', false));
});

test('contagem registra a diferença com saldo do banco e continua rejeitando saldo desatualizado', async () => {
  const productId = '11111111-1111-4111-8111-111111111111';
  const actor = { id: 'user', empresaId: 'restaurant' };
  const body = { action: 'count', quantity: '2,5', expectedBalance: '6.00000000000000000000', reason: 'Conferência avulsa', date: '2026-11-16', requestId: '22222222-2222-4222-8222-222222222222' };
  let balance = '6.00000000000000000000';
  let inserted: unknown[] | undefined;
  const client = { query: async (sql: string, values: unknown[]) => {
    if (sql.startsWith('SELECT product_id,actor_id')) return { rows: [] };
    if (sql.startsWith('WITH purchases')) return { rows: [{ id: productId, name: 'Arroz', balance, archived: false }] };
    if (sql.startsWith('SELECT ($1::numeric-$2::numeric)')) {
      assert.deepEqual(values, ['2.5', '6.00000000000000000000']);
      return { rows: [{ delta: '-3.50000000000000000000' }] };
    }
    if (sql.startsWith('INSERT INTO inventory_movements')) { inserted = values; return { rows: [] }; }
    throw new Error(`Unexpected query: ${sql}`);
  } } as unknown as Queryable;
  assert.deepEqual(await recordInventoryMovement(actor, productId, body, client), { replayed: false });
  assert.equal(inserted?.[4], '-3.50000000000000000000');
  inserted = undefined;
  balance = '6.00000000100000000000';
  await assert.rejects(recordInventoryMovement(actor, productId, body, client), /O estoque mudou/);
  assert.equal(inserted, undefined);
  // Large accumulated balances must be compared exactly, including nanounits.
  balance = '2000000.00000000200000';
  await assert.rejects(recordInventoryMovement(actor, productId, { ...body, expectedBalance: '2000000.00000000100000' }, client), /O estoque mudou/);
});
