import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { isolatedDatabase } from './postgres-fixture';
import { db } from '../src/lib/db';
import { createDemoAccount } from '../src/lib/demo-account';

test('conta fictícia é isolada, sem privilégio de plataforma e criada atomicamente', { timeout: 60000 }, async t => {
  const fixture = await isolatedDatabase();
  t.after(() => fixture.cleanup());
  t.mock.method(db, 'connect', () => fixture.pool.connect());
  const real = (await fixture.pool.query("INSERT INTO empresas(nome) VALUES ('Casa real preservada') RETURNING *")).rows[0];
  const password = 'Demo!senha-forte-123';
  const result = await createDemoAccount('demo@saldodacasa.app', password, '2026-11-01', '2026-11-03');
  assert.notEqual(result.restaurantId, real.id);
  assert.ok(result.expensesAdded > 0);
  const user = (await fixture.pool.query('SELECT * FROM usuarios WHERE id=$1', [result.userId])).rows[0];
  assert.ok(user.email_verified_at); assert.equal(user.ativo, true);
  assert.ok(await bcrypt.compare(password, user.senha)); assert.notEqual(user.senha, password);
  assert.deepEqual((await fixture.pool.query('SELECT user_id,empresa_id,role FROM restaurant_members')).rows,
    [{ user_id: result.userId, empresa_id: result.restaurantId, role: 'owner' }]);
  assert.deepEqual((await fixture.pool.query('SELECT * FROM empresas WHERE id=$1', [real.id])).rows[0], real);
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS count FROM expenses WHERE empresa_id=$1', [real.id])).rows[0].count, 0);
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS count FROM auth_tokens')).rows[0].count, 0);
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS count FROM daily_revenue WHERE empresa_id=$1', [result.restaurantId])).rows[0].count, 3);
  assert.equal((await fixture.pool.query("SELECT count(*)::int AS count FROM expenses WHERE empresa_id=$1 AND (demo_key IS NULL OR notes NOT LIKE '%FICTÍCIOS%')", [result.restaurantId])).rows[0].count, 0);
  await assert.rejects(createDemoAccount(user.email, password, '2026-11-01', '2026-11-03'), /já existe/);
  await assert.rejects(createDemoAccount('bad-range@example.com', password, '2026-01-01', '2026-12-31'), /100 dias/);
  await fixture.pool.query('UPDATE platform_settings SET max_restaurants=2');
  await assert.rejects(createDemoAccount('full@example.com', password, '2026-11-01', '2026-11-03'), /limite/);
  await fixture.pool.query('UPDATE platform_settings SET max_restaurants=10');
  const counts = async () => (await fixture.pool.query(`SELECT (SELECT count(*)::int FROM usuarios) AS users,
    (SELECT count(*)::int FROM empresas) AS restaurants,(SELECT count(*)::int FROM expenses) AS expenses`)).rows[0];
  const before = await counts();
  await fixture.pool.query("CREATE FUNCTION reject_demo_expense() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated failure'; END $$");
  await fixture.pool.query('CREATE TRIGGER reject_demo BEFORE INSERT ON expenses FOR EACH ROW EXECUTE FUNCTION reject_demo_expense()');
  await assert.rejects(createDemoAccount('rollback@example.com', password, '2026-11-01', '2026-11-03'));
  assert.deepEqual(await counts(), before, 'falha na carga reverte conta e restaurante novos');
});
