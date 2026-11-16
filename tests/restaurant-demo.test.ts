import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isolatedDatabase } from './postgres-fixture';
import { restaurantDemoSales } from '../src/lib/restaurant-demo';
import { demoUnitPrice } from '../src/lib/demo-prices';
import { addDays, todayInSaoPaulo } from '../src/lib/expense-shared';
import { normalizeIngredient, quantityText } from '../src/lib/ingredient-analysis';
import { inventoryProducts } from '../src/models/Inventory';

test('simulação do restaurante fecha às segundas e mantém refeições e pedidos coerentes', () => {
  assert.deepEqual(restaurantDemoSales('2026-11-30'), { totalCents: 0, deliveryMeals: 0, dineInMeals: 0, orderCount: 0 });
  const open = restaurantDemoSales('2026-11-29');
  assert.ok(open.totalCents > 0);
  assert.ok(open.orderCount <= open.deliveryMeals + open.dineInMeals);
});

test('preços fictícios têm altas e quedas nas compras diárias e semanais', () => {
  for (const interval of [1, 7]) {
    const prices = Array.from({ length: 40 }, (_, index) => demoUnitPrice(599, 'Arroz', addDays('2026-01-01', index * interval)));
    assert.ok(new Set(prices).size > 10);
    assert.ok(prices.some((price, index) => index > 0 && price > prices[index - 1]));
    assert.ok(prices.some((price, index) => index > 0 && price < prices[index - 1]));
    assert.ok(prices.every(price => Number.isInteger(price) && price >= 400 && price <= 900));
  }
});

test('lançamentos completos usam categorias corretas, produtos e todos os dias, sem duplicar', { timeout: 60000 }, async t => {
  const fixture = await isolatedDatabase();
  t.after(() => fixture.cleanup());
  const company = (await fixture.pool.query("INSERT INTO empresas(nome) VALUES ('Cozinha de teste') RETURNING id")).rows[0].id;
  const user = (await fixture.pool.query("INSERT INTO usuarios(nome,email,senha,empresa_id) VALUES ('Dono','complete@demo.invalid','unused',$1) RETURNING id", [company])).rows[0].id;
  await fixture.pool.query("INSERT INTO restaurant_members(user_id,empresa_id,role) VALUES ($1,$2,'owner')", [user, company]);
  const market = (await fixture.pool.query("INSERT INTO restaurant_catalog(empresa_id,kind,name,normalized_name) VALUES ($1,'category','Mercado','mercado') RETURNING id", [company])).rows[0].id;
  await fixture.pool.query(`INSERT INTO daily_revenue(empresa_id,date,amount_cents,delivery_meals,dine_in_meals,order_count)
    VALUES ($1,'2026-01-05',9999,3,2,4),($1,'2026-01-06',12345,2,3,4)`, [company]);
  const run = async () => {
    const result = await promisify(execFile)(process.execPath, ['--import', 'tsx', 'scripts/seed-restaurant-demo.ts',
      'complete@demo.invalid', company, '2026-01-01', '2026-12-31'], {
      env: { ...process.env, DATABASE_URL: fixture.connectionString }, windowsHide: true,
    });
    return JSON.parse(result.stdout);
  };
  const first = await run();
  assert.equal(first.days, 365);
  assert.equal(first.closedMondays, 52);
  assert.equal(first.categoryCounts.Mercado, 313);
  assert.equal(first.categoryCounts.Hortifruti, 313);
  const revenues = (await fixture.pool.query('SELECT *,date::text AS day FROM daily_revenue ORDER BY date')).rows;
  assert.equal(revenues.length, 365);
  for (const row of revenues) if (new Date(`${row.day}T12:00:00Z`).getUTCDay() === 1) {
    assert.equal(Number(row.amount_cents), 0);
    assert.equal(row.delivery_meals, 0); assert.equal(row.dine_in_meals, 0); assert.equal(row.order_count, 0);
  }
  assert.equal(Number(revenues.find(row => row.day === '2026-01-06').amount_cents), 12345);
  const expenses = (await fixture.pool.query(`SELECT e.*,e.date::text AS day,c.name AS label FROM expenses e JOIN restaurant_catalog c ON c.id::text=e.category ORDER BY e.id`)).rows;
  assert.equal(new Set(expenses.filter(row => row.items.length).map(row => row.day)).size, 313);
  assert.equal(new Set(expenses.map(row => row.label)).size, 11);
  assert.ok(expenses.filter(row => row.label === 'Mercado').every(row => row.category === market && row.items.length === 10));
  assert.ok(expenses.filter(row => row.label === 'Hortifruti').every(row => row.items.some((item: { name: string }) => item.name === 'Tomate')));
  assert.ok(expenses.filter(row => row.label.startsWith('Moto')).every(row => new Date(`${row.day}T12:00:00Z`).getUTCDay() !== 1));
  for (const row of expenses) {
    assert.ok(row.merchant && row.notes && row.demo_key);
    if (row.items.length) assert.equal(row.items.reduce((sum: number, item: { amountCents: number }) => sum + item.amountCents, 0), Number(row.amount_cents));
    if (row.items.length) {
      assert.notEqual(new Date(`${row.day}T12:00:00Z`).getUTCDay(), 1);
      assert.ok(row.items.every((item: { stock: boolean }) => (item.stock === true) === (row.day <= todayInSaoPaulo())));
    }
  }
  const stockBefore = await inventoryProducts(company, fixture.pool);
  assert.equal(stockBefore.length, 29);
  for (const product of stockBefore) {
    let expected = BigInt(0);
    for (const row of expenses) for (const item of row.items) if (item.productId === product.id && item.stock) {
      const normalized = normalizeIngredient(item);
      assert.equal(normalized.unit, product.unit);
      const [whole, decimals = ''] = normalized.quantity.split('.');
      expected += BigInt(whole) * BigInt(1_000_000_000) + BigInt(decimals.padEnd(9, '0'));
    }
    assert.equal(Number(product.balance), Number(quantityText(expected)));
  }
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS count FROM expense_audit')).rows[0].count, first.expensesAdded);
  const repeat = await run();
  assert.equal(repeat.expensesAdded, 0);
  assert.equal(repeat.expensesUpdated, 0);
  assert.equal(repeat.closedPurchasesRemoved, 0);
  assert.deepEqual(await inventoryProducts(company, fixture.pool), stockBefore);
  assert.equal(repeat.revenueWritten, 0);
  assert.deepEqual((await fixture.pool.query('SELECT *,date::text AS day FROM daily_revenue ORDER BY date')).rows, revenues);
  await t.test('corrige compras antigas sem entrada, remove compras fictícias de segunda e concilia o ano inteiro', async () => {
    const target = expenses.find(row => row.label === 'Hortifruti' && row.day < todayInSaoPaulo());
    const legacyItems = target.items.map((item: { stock?: boolean; name: string }) => { const legacy = { ...item }; delete legacy.stock; return legacy; });
    await fixture.pool.query('UPDATE expenses SET items=$2::jsonb,category=$3 WHERE id=$1', [target.id, JSON.stringify(legacyItems), expenses.find(row => row.label === 'Fixos').category]);
    const monday = (await fixture.pool.query(`INSERT INTO expenses
      (empresa_id,created_by,updated_by,request_id,description,amount_cents,date,category,merchant,status,payment_method,notes,items,demo_key)
      SELECT empresa_id,created_by,updated_by,gen_random_uuid(),description,amount_cents,'2026-01-05',category,merchant,status,payment_method,notes,items,
        'restaurant-complete-v2:2026-01-05:hortifruti' FROM expenses WHERE id=$1 RETURNING id`, [target.id])).rows[0];
    const repaired = await run();
    assert.equal(repaired.expensesAdded, 0);
    assert.equal(repaired.expensesUpdated, 1);
    assert.equal(repaired.closedPurchasesRemoved, 1);
    const after = (await fixture.pool.query('SELECT * FROM expenses WHERE id=$1', [target.id])).rows[0];
    assert.equal(after.amount_cents, target.amount_cents);
    assert.equal(after.category, target.category);
    assert.deepEqual(after.items, target.items);
    assert.ok((await fixture.pool.query('SELECT deleted_at FROM expenses WHERE id=$1', [monday.id])).rows[0].deleted_at);
    assert.deepEqual(await inventoryProducts(company, fixture.pool), stockBefore);
    const verification = JSON.parse((await promisify(execFile)(process.execPath, ['--import', 'tsx', 'scripts/verify-restaurant-inventory.ts', company, '2026-01-01', '2026-12-31'], {
      env: { ...process.env, DATABASE_URL: fixture.connectionString }, windowsHide: true,
    })).stdout);
    assert.equal(verification.verified, true);
    assert.equal(verification.products.length, 29);
    assert.equal(verification.closedMondays, 52);
  });
  await t.test('atualiza somente preços fictícios, preserva demais campos e não reaplica a variação', async () => {
    const target = expenses.find(row => row.label === 'Mercado' && row.day <= '2026-02-28');
    const originalItem = target.items[0];
    const altered = target.items.map((item: { amountCents: number }, index: number) => index ? item : { ...item, amountCents: 12345 });
    await fixture.pool.query('UPDATE expenses SET items=$2::jsonb,amount_cents=$3 WHERE id=$1', [target.id, JSON.stringify(altered),
      altered.reduce((sum: number, item: { amountCents: number }) => sum + item.amountCents, 0) + 999]);
    const clone = async (demoKey: string | null, deleted: boolean) => (await fixture.pool.query(`INSERT INTO expenses
      (empresa_id,created_by,updated_by,request_id,description,amount_cents,date,category,merchant,status,payment_method,notes,items,demo_key,deleted_at)
      SELECT empresa_id,created_by,updated_by,gen_random_uuid(),description,amount_cents,date,category,merchant,status,payment_method,notes,items,$2,
        CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE NULL END FROM expenses WHERE id=$1 RETURNING *`, [target.id, demoKey, deleted])).rows[0];
    const manual = await clone(null, false);
    const deleted = await clone('restaurant-complete-v2:deleted-test', true);
    const runPrices = async () => JSON.parse((await promisify(execFile)(process.execPath, ['--import', 'tsx', 'scripts/vary-demo-prices.ts',
      'complete@demo.invalid', company, '2026-01-01', '2026-02-28'], {
      env: { ...process.env, DATABASE_URL: fixture.connectionString }, windowsHide: true,
    })).stdout);
    const result = await runPrices();
    assert.equal(result.purchasesUpdated, 1);
    assert.equal(result.itemsUpdated, 1);
    const updated = (await fixture.pool.query('SELECT * FROM expenses WHERE id=$1', [target.id])).rows[0];
    assert.deepEqual(updated.items[0], originalItem);
    assert.equal(Number(updated.amount_cents), updated.items.reduce((sum: number, item: { amountCents: number }) => sum + item.amountCents, 0) + 999);
    assert.equal(updated.category, target.category);
    assert.equal(updated.version, 2);
    for (const row of [manual, deleted]) assert.deepEqual((await fixture.pool.query('SELECT * FROM expenses WHERE id=$1', [row.id])).rows[0], row);
    assert.deepEqual((await fixture.pool.query('SELECT *,date::text AS day FROM daily_revenue ORDER BY date')).rows, revenues);
    const auditCount = (await fixture.pool.query('SELECT count(*)::int AS count FROM expense_audit')).rows[0].count;
    assert.equal((await runPrices()).purchasesUpdated, 0);
    assert.equal((await fixture.pool.query('SELECT count(*)::int AS count FROM expense_audit')).rows[0].count, auditCount);
  });
});
