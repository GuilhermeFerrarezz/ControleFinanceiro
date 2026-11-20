import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { isolatedDatabase, query } from './postgres-fixture';
import { migrateDatabase } from '../src/lib/migrations';
import { BASIC_PRODUCTS } from '../src/lib/catalog-shared';
import { listProducts, seedProducts } from '../src/models/Catalog';

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

test('catálogo padrão atualiza restaurantes existentes sem perder vínculos e mantém ordem alfabética', async t => {
  const fixture = await isolatedDatabase(); t.after(fixture.cleanup);
  const company = randomUUID();
  await query(fixture.pool, "INSERT INTO empresas(id,nome) VALUES ($1,'Catálogo atualizado')", [company]);
  await query(fixture.pool, `INSERT INTO restaurant_catalog(empresa_id,kind,name,normalized_name,default_unit) VALUES
    ($1,'product','Carne bovina','carne bovina','kg'),
    ($1,'product','Arroz','arroz','kg'),
    ($1,'product','Tempero da casa','tempero da casa','g')`, [company]);
  const before = await listProducts(company, fixture.pool);
  await query(fixture.pool, "DELETE FROM schema_migrations WHERE version='20261120_standard_products'");
  await migrateDatabase(fixture.pool);
  const products = await listProducts(company, fixture.pool);
  assert.equal(products.find(p => p.name === 'Carne bovina')?.archived, true);
  assert.equal(products.find(p => p.name === 'Arroz')?.id, before.find(p => p.name === 'Arroz')?.id);
  assert.equal(products.find(p => p.name === 'Tempero da casa')?.archived, false);
  assert.deepEqual(products.filter(p => !p.archived && p.name !== 'Tempero da casa').map(p => p.name), BASIC_PRODUCTS.map(p => p.name));
  await query(fixture.pool, "UPDATE restaurant_catalog SET deleted_at=now() WHERE empresa_id=$1 AND name='Tilápia'", [company]);
  await migrateDatabase(fixture.pool);
  assert.equal((await listProducts(company, fixture.pool)).find(p => p.name === 'Tilápia')?.archived, true);

  const fresh = randomUUID();
  await query(fixture.pool, "INSERT INTO empresas(id,nome) VALUES ($1,'Casa nova')", [fresh]);
  await seedProducts(fresh, fixture.pool);
  assert.deepEqual((await listProducts(fresh, fixture.pool)).map(p => p.name), BASIC_PRODUCTS.map(p => p.name));
});
