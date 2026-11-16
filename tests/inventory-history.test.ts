import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isolatedDatabase } from './postgres-fixture';
import { inventoryHistory, inventoryProducts } from '../src/models/Inventory';
import { normalizeIngredient } from '../src/lib/ingredient-analysis';
import { stockBalance } from '../src/lib/inventory-shared';
import type { ExpenseItem } from '../src/lib/expense-shared';

test('histórico otimizado preserva paginação, filtros, unidades, autoria e isolamento', async t => {
  const fixture = await isolatedDatabase();
  t.after(() => fixture.cleanup());
  const company = (await fixture.pool.query("INSERT INTO empresas(nome) VALUES ('Estoque paginado') RETURNING id")).rows[0].id;
  const user = (await fixture.pool.query("INSERT INTO usuarios(nome,email,senha) VALUES ('Dono','history@inventory.invalid','unused') RETURNING id")).rows[0].id;
  const products = (await fixture.pool.query(`INSERT INTO restaurant_catalog(empresa_id,kind,name,normalized_name)
    VALUES ($1,'product','Arroz','arroz'),($1,'product','Óleo','oleo') RETURNING id,name`, [company])).rows;
  for (const product of products) await fixture.pool.query('INSERT INTO inventory_products(empresa_id,product_id,unit) VALUES ($1,$2,$3)', [company, product.id, product.name === 'Arroz' ? 'kg' : 'L']);
  const rice = products.find(item => item.name === 'Arroz');
  const oil = products.find(item => item.name === 'Óleo');
  const items: ExpenseItem[] = [
    { productId: rice.id, name: rice.name, unit: 'kg', quantity: 2, amountCents: 1000, stock: true },
    { productId: oil.id, name: oil.name, unit: 'pacote', quantity: 1, packageContent: { quantity: 500, unit: 'ml' }, amountCents: 500, stock: true },
    { productId: rice.id, name: rice.name, unit: 'un', quantity: 1, amountCents: 100, stock: true },
    { productId: oil.id, name: oil.name, unit: 'L', quantity: 1, amountCents: 100, stock: false },
  ];
  const expenses = (await fixture.pool.query(`INSERT INTO expenses(empresa_id,created_by,updated_by,request_id,description,amount_cents,date,category,merchant,items,created_at,deleted_at)
    SELECT $1,$2,$2,gen_random_uuid(),'Compra',1700,DATE '2026-11-01'+(n%5),'alimentos',CASE WHEN n%2=0 THEN 'Mercado' ELSE 'MERCADO' END,$3::jsonb,
      TIMESTAMPTZ '2026-11-01 12:00:00Z',CASE WHEN n=40 THEN CURRENT_TIMESTAMP ELSE NULL END
    FROM generate_series(1,40) n RETURNING id,to_char(date,'YYYY-MM-DD') AS date,merchant,deleted_at`, [company, user, JSON.stringify(items)])).rows;
  await fixture.pool.query("INSERT INTO inventory_movements(empresa_id,product_id,actor_id,request_id,quantity,date,source) VALUES ($1,$2,$3,gen_random_uuid(),3,'2026-11-06','entry')", [company, rice.id, user]);
  await fixture.pool.query('UPDATE restaurant_catalog SET deleted_at=CURRENT_TIMESTAMP WHERE id=$1', [oil.id]);
  const expected = expenses.filter(row => !row.deleted_at).flatMap(expense => items.slice(0, 2).map((item, index) => ({
    id: `${expense.id}:${index + 1}`, productId: item.productId, productName: item.name, unit: normalizeIngredient(item).unit,
    quantity: normalizeIngredient(item).quantity, date: expense.date, reason: `Compra: ${expense.merchant}`, source: 'purchase', author: 'Dono', expenseId: expense.id,
  }))).sort((a, b) => a.date === b.date ? (a.id < b.id ? 1 : -1) : (a.date < b.date ? 1 : -1));
  for (const productId of [null, rice.id, oil.id]) {
    const purchases = expected.filter(row => !productId || row.productId === productId);
    const actual = [];
    for (let page = 1; page <= 4; page++) {
      const rows = await inventoryHistory(company, productId, page, fixture.pool);
      assert.ok(rows.length <= 31);
      actual.push(...rows.slice(0, 30));
    }
    assert.deepEqual(actual.filter(row => row.source === 'purchase').map(row => ({ ...row, quantity: stockBalance(row.quantity) })), purchases);
    assert.equal(actual.filter(row => row.source === 'entry').length, productId === oil.id ? 0 : 1);
    assert.equal(new Set(actual.map(row => row.id)).size, actual.length);
  }
  const stock = await inventoryProducts(company, fixture.pool);
  assert.equal(stockBalance(stock.find(item => item.id === rice.id)!.balance), '81');
  assert.equal(stockBalance(stock.find(item => item.id === oil.id)!.balance), '19.5');
  assert.equal(stock.find(item => item.id === rice.id)!.purchasedFrom.length, 1);
  assert.equal(stock.find(item => item.id === oil.id)!.archived, true);
  const other = (await fixture.pool.query("INSERT INTO empresas(nome) VALUES ('Outro restaurante') RETURNING id")).rows[0].id;
  assert.deepEqual(await inventoryHistory(other, null, 1, fixture.pool), []);
  assert.deepEqual(await inventoryProducts(other, fixture.pool), []);
});
