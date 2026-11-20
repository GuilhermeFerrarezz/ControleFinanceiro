import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isolatedDatabase } from './postgres-fixture';
import { db } from '../src/lib/db';
import { inTransaction } from '../src/lib/postgres';

test('timeout SQL reverte a escrita e devolve uma conexão utilizável sem estado local', async t => {
  const fixture = await isolatedDatabase();
  t.after(() => fixture.cleanup());
  t.mock.method(db, 'connect', () => fixture.pool.connect());
  await inTransaction(async client => {
    const { rows } = await client.query(`SELECT current_setting('statement_timeout') AS statement,
      current_setting('lock_timeout') AS lock, current_setting('idle_in_transaction_session_timeout') AS idle`);
    assert.deepEqual(rows[0], { statement: '30s', lock: '5s', idle: '15s' });
  }, true);
  await assert.rejects(inTransaction(async client => {
    await client.query("INSERT INTO empresas(nome) VALUES ('Gravação que deve ser revertida')");
    await client.query("SET LOCAL statement_timeout='20ms'");
    await client.query('SELECT pg_sleep(0.1)');
  }), error => (error as { code: string }).code === '57014');
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS count FROM empresas')).rows[0].count, 0);
  assert.equal(await inTransaction(async client => (await client.query('SELECT 42 AS value')).rows[0].value), 42);
});
