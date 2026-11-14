import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isolatedDatabase } from './postgres-fixture';

test('histórico fictício preenche campos, preserva dados existentes e não duplica ao repetir', async t => {
  const fixture = await isolatedDatabase();
  t.after(() => fixture.cleanup());
  const company = (await fixture.pool.query("INSERT INTO empresas(nome) VALUES ('Demonstração') RETURNING id")).rows[0].id;
  const user = (await fixture.pool.query("INSERT INTO usuarios(nome,email,senha,empresa_id) VALUES ('Dono','demo@history.invalid','unused',$1) RETURNING id", [company])).rows[0].id;
  await fixture.pool.query("INSERT INTO restaurant_members(user_id,empresa_id,role) VALUES ($1,$2,'owner')", [user, company]);
  await fixture.pool.query(`INSERT INTO daily_revenue(empresa_id,date,amount_cents,delivery_meals,order_count)
    VALUES ($1,'2026-01-01',12345,9,4),($1,'2026-01-02',0,NULL,NULL)`, [company]);
  const run = async () => {
    const result = await promisify(execFile)(process.execPath, ['--import', 'tsx', 'scripts/seed-demo-history.ts', 'demo@history.invalid', company, '2026-01-01', '2026-02-28'], {
      env: { ...process.env, DATABASE_URL: fixture.connectionString }, windowsHide: true,
    });
    return JSON.parse(result.stdout);
  };
  const first = await run();
  assert.equal(first.days, 59);
  assert.equal(first.revenueAdded, 57);
  assert.equal(first.revenueCompleted, 2);
  const before = (await fixture.pool.query('SELECT * FROM daily_revenue ORDER BY date')).rows;
  assert.equal(Number(before[0].amount_cents), 12345);
  assert.equal(before[0].delivery_meals, 9);
  assert.equal(before[0].order_count, 4);
  assert.equal(before[1].delivery_meals, 0);
  assert.equal(before[1].dine_in_meals, 0);
  assert.equal(before[1].order_count, 0);
  assert.ok(before.every(row => row.delivery_meals !== null && row.dine_in_meals !== null && row.order_count !== null));
  const second = await run();
  assert.equal(second.expensesAdded, 0);
  assert.equal(second.revenueAdded, 0);
  assert.equal(second.revenueCompleted, 0);
  assert.deepEqual((await fixture.pool.query('SELECT * FROM daily_revenue ORDER BY date')).rows, before);
  const expenses = (await fixture.pool.query('SELECT * FROM expenses')).rows;
  assert.equal(expenses.length, first.expensesAdded);
  assert.equal((await fixture.pool.query('SELECT * FROM expense_audit')).rowCount, expenses.length);
  assert.equal(new Set(expenses.map(row => row.category)).size, 9);
  assert.equal(new Set(expenses.map(row => row.payment_method)).size, 7);
  assert.ok(expenses.some(row => row.items.some((item: { packageContent?: unknown }) => item.packageContent)));
});
