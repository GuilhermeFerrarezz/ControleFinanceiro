import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isolatedDatabase } from './postgres-fixture';
import { restaurantDemoSales } from '../src/lib/restaurant-demo';

test('simulação do restaurante fecha às segundas e mantém refeições e pedidos coerentes', () => {
  assert.deepEqual(restaurantDemoSales('2026-11-30'), { totalCents: 0, deliveryMeals: 0, dineInMeals: 0, orderCount: 0 });
  const open = restaurantDemoSales('2026-11-29');
  assert.ok(open.totalCents > 0);
  assert.ok(open.orderCount <= open.deliveryMeals + open.dineInMeals);
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
      'complete@demo.invalid', company, '2026-01-01', '2026-02-28'], {
      env: { ...process.env, DATABASE_URL: fixture.connectionString }, windowsHide: true,
    });
    return JSON.parse(result.stdout);
  };
  const first = await run();
  assert.equal(first.days, 59);
  assert.equal(first.closedMondays, 8);
  assert.equal(first.categoryCounts.Mercado, 59);
  assert.equal(first.categoryCounts.Hortifruti, 59);
  const revenues = (await fixture.pool.query('SELECT *,date::text AS day FROM daily_revenue ORDER BY date')).rows;
  assert.equal(revenues.length, 59);
  for (const row of revenues) if (new Date(`${row.day}T12:00:00Z`).getUTCDay() === 1) {
    assert.equal(Number(row.amount_cents), 0);
    assert.equal(row.delivery_meals, 0); assert.equal(row.dine_in_meals, 0); assert.equal(row.order_count, 0);
  }
  assert.equal(Number(revenues.find(row => row.day === '2026-01-06').amount_cents), 12345);
  const expenses = (await fixture.pool.query(`SELECT e.*,e.date::text AS day,c.name AS label FROM expenses e JOIN restaurant_catalog c ON c.id::text=e.category ORDER BY e.id`)).rows;
  assert.equal(new Set(expenses.map(row => row.day)).size, 59);
  assert.equal(new Set(expenses.map(row => row.label)).size, 11);
  assert.ok(expenses.filter(row => row.label === 'Mercado').every(row => row.category === market && row.items.length === 10));
  assert.ok(expenses.filter(row => row.label === 'Hortifruti').every(row => row.items.some((item: { name: string }) => item.name === 'Tomate')));
  assert.ok(expenses.filter(row => row.label.startsWith('Moto')).every(row => new Date(`${row.day}T12:00:00Z`).getUTCDay() !== 1));
  for (const row of expenses) {
    assert.ok(row.merchant && row.notes && row.demo_key);
    if (row.items.length) assert.equal(row.items.reduce((sum: number, item: { amountCents: number }) => sum + item.amountCents, 0), Number(row.amount_cents));
  }
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS count FROM expense_audit')).rows[0].count, first.expensesAdded);
  const repeat = await run();
  assert.equal(repeat.expensesAdded, 0);
  assert.equal(repeat.revenueWritten, 0);
  assert.deepEqual((await fixture.pool.query('SELECT *,date::text AS day FROM daily_revenue ORDER BY date')).rows, revenues);
});
