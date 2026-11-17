import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { db } from '../src/lib/db';
import { completeAuthToken } from '../src/lib/account-recovery';

test('tokens inexistentes ou expirados são rejeitados antes de calcular bcrypt', async t => {
  t.mock.method(db, 'query', async () => ({ rows: [], rowCount: 0 }));
  let hashes = 0;
  t.mock.method(bcrypt, 'hash', async () => { hashes++; throw new Error('bcrypt não deve ser chamado'); });
  await assert.rejects(completeAuthToken('x'.repeat(43), 'password_reset', 'nova-senha-123'), /inválido ou expirado/);
  assert.equal(hashes, 0);
});
