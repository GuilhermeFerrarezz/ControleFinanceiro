import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import type { ConnectionOptions } from 'node:tls';
import { databaseOptions } from '../src/lib/database-options';

test('Neon sempre exige TLS com certificado e hostname verificados', () => {
  for (const suffix of ['neon.tech', 'neon.build']) {
    for (const query of ['', '?sslmode=disable', '?sslmode=no-verify&ssl=false&uselibpqcompat=true']) {
      const options = databaseOptions(`postgresql://example:example@ep-test.${suffix}/database${query}`);
      const url = new URL(options.connectionString!);
      assert.equal(url.searchParams.get('sslmode'), 'verify-full');
      const client = new Client(options);
      assert.ok(client.ssl && typeof client.ssl === 'object');
      const ssl = client.ssl as unknown as ConnectionOptions;
      assert.notEqual(ssl.rejectUnauthorized, false);
      assert.equal(ssl.checkServerIdentity, undefined);
    }
  }
});

test('preserva banco local e limita o pool sem exibir credenciais em erros', () => {
  const local = 'postgresql://example:example@localhost:5432/database?options=-c%20search_path%3Disolated';
  const options = databaseOptions(local);
  assert.equal(options.connectionString, local); assert.equal(options.max, 5);
  // Neon PgBouncer rejects these in startup packets. Apply SET LOCAL instead.
  assert.equal(options.statement_timeout, undefined);
  assert.equal(options.lock_timeout, undefined);
  for (const invalid of ['password-secret', 'https://example:password-secret@host/database']) assert.throws(() => databaseOptions(invalid), error => error instanceof Error && !error.message.includes('password-secret'));
});
