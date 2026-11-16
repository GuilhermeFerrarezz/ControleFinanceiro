import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { isolatedDatabase } from './postgres-fixture';
import { migrateDatabase } from '../src/lib/migrations';
import { recordInventoryMovement } from '../src/lib/inventory';

test('todas as movimentações aceitam motivo opcional, inclusive em bancos existentes', async t => {
  const fixture = await isolatedDatabase();
  t.after(() => fixture.cleanup());
  // Reproduce the old constraint, then apply the upgrade to an existing database.
  await fixture.pool.query('ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_reason_check');
  await fixture.pool.query('ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_reason_check CHECK (length(btrim(reason)) BETWEEN 2 AND 300)');
  await migrateDatabase(fixture.pool);
  const empresaId = (await fixture.pool.query("INSERT INTO empresas(nome) VALUES ('Estoque de teste') RETURNING id")).rows[0].id;
  const id = (await fixture.pool.query("INSERT INTO usuarios(nome,email,senha) VALUES ('Dono','optional@inventory.invalid','unused') RETURNING id")).rows[0].id;
  const productId = (await fixture.pool.query("INSERT INTO restaurant_catalog(empresa_id,kind,name,normalized_name) VALUES ($1,'product','Arroz','arroz') RETURNING id", [empresaId])).rows[0].id;
  await fixture.pool.query("INSERT INTO inventory_products(empresa_id,product_id,unit) VALUES ($1,$2,'kg')", [empresaId, productId]);
  const movements = [
    { action: 'opening', quantity: '10' },
    { action: 'entry', quantity: '2', reason: '' },
    { action: 'consumption', quantity: '1', reason: '   ' },
    { action: 'waste', quantity: '1', reason: null },
    { action: 'correction', quantity: '1' },
    { action: 'count', quantity: '8', expectedBalance: '9' },
  ];
  for (const movement of movements) {
    const body = { ...movement, date: '2026-11-16', requestId: randomUUID() };
    assert.deepEqual(await recordInventoryMovement({ id, empresaId }, productId, body, fixture.pool), { replayed: false });
    assert.deepEqual(await recordInventoryMovement({ id, empresaId }, productId, body, fixture.pool), { replayed: true });
  }
  const saved = (await fixture.pool.query('SELECT source,reason FROM inventory_movements WHERE empresa_id=$1', [empresaId])).rows;
  assert.equal(saved.length, 6);
  assert.ok(saved.every(row => row.reason === ''));
  const body = { action: 'entry', quantity: '1', date: '2026-11-16', requestId: randomUUID() };
  await recordInventoryMovement({ id, empresaId }, productId, { ...body, reason: 'x' }, fixture.pool);
  for (const reason of ['x'.repeat(301), 123, 'texto\0inválido']) {
    await assert.rejects(recordInventoryMovement({ id, empresaId }, productId, { ...body, requestId: randomUUID(), reason }, fixture.pool), /Motivo/);
  }
});
