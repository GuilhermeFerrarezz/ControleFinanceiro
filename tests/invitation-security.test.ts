import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { isolatedDatabase } from './postgres-fixture';
import { acceptInvitation, findValidInvitation } from '../src/models/Invitation';

test('convite que vence durante a transação não pode ser consultado nem consumido', async t => {
  const fixture = await isolatedDatabase();
  t.after(() => fixture.cleanup());
  const client = await fixture.pool.connect();
  try {
    await client.query('BEGIN');
    const restaurant = (await client.query("INSERT INTO empresas(nome) VALUES ('Restaurante de teste') RETURNING id")).rows[0];
    const user = (await client.query("INSERT INTO usuarios(nome,email,senha) VALUES ('Pessoa de teste','invitation@example.com','hash-apenas-de-teste') RETURNING id")).rows[0];
    const hash = createHash('sha256').update(randomBytes(32)).digest('hex');
    const invitation = (await client.query(`INSERT INTO restaurant_invitations(empresa_id,invited_by,email,token_hash,expires_at)
      VALUES ($1,$2,'employee@example.com',$3,clock_timestamp()+interval '100 milliseconds') RETURNING id`, [restaurant.id,user.id,hash])).rows[0];
    // CURRENT_TIMESTAMP stays at BEGIN even after this wait, as it does when
    // a concurrent writer holds a row lock until after the invitation expires.
    await client.query('SELECT pg_sleep(0.2)');
    const found = await findValidInvitation(hash,client,true);
    const accepted = await acceptInvitation(invitation.id,client);
    assert.deepEqual({ found, accepted }, { found: null, accepted: false });
    assert.equal((await client.query('SELECT accepted_at FROM restaurant_invitations WHERE id=$1',[invitation.id])).rows[0].accepted_at,null);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
