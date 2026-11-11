import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { isolatedDatabase, query } from './postgres-fixture';
import { migrateDatabase } from '../src/lib/migrations';

test('migração cadastra itens históricos com acentos, preserva ordem e não recria produtos excluídos', async t => {
  const fixture = await isolatedDatabase(); t.after(fixture.cleanup);
  const company = randomUUID(), user = randomUUID(), id = randomUUID();
  await query(fixture.pool, "INSERT INTO empresas(id,nome) VALUES ($1,'Cozinha')", [company]);
  await query(fixture.pool, "INSERT INTO usuarios(id,nome,email,senha) VALUES ($1,'Teste','products@test.invalid','hash')", [user]);
  const items = [{ name: 'FEIJAO', unit: 'kg', quantity: 2, amountCents: 1500 }, { name: 'Tempero da casa', unit: 'g', quantity: 200, amountCents: 500 }];
  await query(fixture.pool, `INSERT INTO expenses(id,empresa_id,created_by,updated_by,request_id,description,amount_cents,date,category,items) VALUES ($1,$2,$3,$3,$4,'Compra antiga',3000,'2025-01-01','alimentos',$5::jsonb)`, [id, company, user, randomUUID(), JSON.stringify(items)]);
  await query(fixture.pool, "DELETE FROM schema_migrations WHERE version='20261111_product_catalog'");
  await migrateDatabase(fixture.pool);
  const products = await query<{ id: string; name: string }>(fixture.pool, "SELECT id,name FROM restaurant_catalog WHERE empresa_id=$1 AND kind='product'", [company]);
  assert.equal(products.filter(item => item.name === 'Feijão').length, 1);
  const saved = await query<{ items: { name: string; productId: string }[]; amount: string }>(fixture.pool, 'SELECT items,amount_cents AS amount FROM expenses WHERE id=$1', [id]);
  assert.equal(saved[0].amount, '3000');
  assert.equal(saved[0].items[0].name, 'FEIJAO');
  assert.equal(saved[0].items[0].productId, products.find(item => item.name === 'Feijão')!.id);
  assert.equal(saved[0].items[1].productId, products.find(item => item.name === 'Tempero da casa')!.id);
  await query(fixture.pool, "UPDATE restaurant_catalog SET deleted_at=now() WHERE empresa_id=$1 AND name='Arroz'", [company]);
  await migrateDatabase(fixture.pool);
  const archived = await query(fixture.pool, "SELECT id FROM restaurant_catalog WHERE empresa_id=$1 AND name='Arroz' AND deleted_at IS NOT NULL", [company]);
  assert.equal(archived.length, 1);
});
