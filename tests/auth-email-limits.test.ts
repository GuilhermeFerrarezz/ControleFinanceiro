import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/lib/db';
import { withAuthEmailBudget } from '../src/lib/auth-email-limits';

test('envio limita concorrência e libera capacidade após falhas ou quotas excedidas', async t => {
  let blocked = false;
  t.mock.method(db, 'query', async () => ({ rows: [{ count: blocked ? 31 : 1 }] }));
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const running = [withAuthEmailBudget(() => gate), withAuthEmailBudget(() => gate)];
  await assert.rejects(withAuthEmailBudget(async () => true), /ocupado/);
  release(); await Promise.all(running);
  await assert.rejects(withAuthEmailBudget(async () => { throw new Error('provedor indisponível'); }), /provedor/);
  assert.equal(await withAuthEmailBudget(async () => true), true);
  blocked = true;
  let sent = false;
  await assert.rejects(withAuthEmailBudget(async () => { sent = true; }), /Limite/);
  assert.equal(sent, false);
  blocked = false;
  assert.equal(await withAuthEmailBudget(async () => true), true);
});
