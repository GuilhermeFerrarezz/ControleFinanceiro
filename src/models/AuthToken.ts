import { createHash, randomBytes } from 'node:crypto';
import type { Queryable } from '../lib/postgres';
import { db } from '../lib/db';

export type AuthTokenType = 'email_verification' | 'password_reset';
export const authTokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const validAuthToken = (token: unknown): token is string => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
export type StoredAuthToken = { token_hash: string; expires_at: Date; created_at: Date };
export async function storedAuthToken(userId: string,type: AuthTokenType,client: Queryable) {
  return (await client.query<StoredAuthToken>('SELECT token_hash,expires_at,created_at FROM auth_tokens WHERE user_id=$1 AND type=$2',[userId,type])).rows[0] ?? null;
}
export async function restoreAuthTokenAfterFailedDelivery(userId: string,type: AuthTokenType,failedToken: string,previous: StoredAuthToken|null,client: Queryable) {
  // Never overwrite a newer token or resurrect one after successful use,
  // suspension or deletion. Only undo our still-current, unused issuance.
  if (!(await client.query('SELECT id FROM usuarios WHERE id=$1 AND ativo AND deleted_at IS NULL FOR UPDATE',[userId])).rowCount) return;
  const removed=await client.query('DELETE FROM auth_tokens WHERE user_id=$1 AND type=$2 AND token_hash=$3 RETURNING id',[userId,type,authTokenHash(failedToken)]);
  if (!removed.rowCount || !previous) return;
  await client.query(`INSERT INTO auth_tokens(user_id,type,token_hash,expires_at,created_at) SELECT $1,$2,$3,$4,$5 WHERE $4::timestamptz>clock_timestamp()`,[userId,type,previous.token_hash,previous.expires_at,previous.created_at]);
}
export async function authTokenExists(token: string, type: AuthTokenType) {
  return (await db.query('SELECT t.id FROM auth_tokens t JOIN usuarios u ON u.id=t.user_id WHERE token_hash=$1 AND type=$2 AND expires_at>clock_timestamp() AND u.ativo', [authTokenHash(token), type])).rowCount === 1;
}

// Call inside a transaction. Issuance and consumption lock the identity first.
export async function issueAuthToken(userId: string, type: AuthTokenType, client: Queryable) {
  if (!(await client.query('SELECT id FROM usuarios WHERE id=$1 AND ativo FOR UPDATE', [userId])).rowCount) throw new Error('Conta indisponível.');
  const token = randomBytes(32).toString('base64url');
  const lifetime = type === 'email_verification' ? 24 * 60 * 60_000 : 30 * 60_000;
  await client.query(`INSERT INTO auth_tokens (user_id,token_hash,type,expires_at) VALUES ($1,$2,$3,clock_timestamp()+$4*interval '1 millisecond')
    ON CONFLICT (user_id,type) DO UPDATE SET token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,created_at=clock_timestamp()`,
  [userId, authTokenHash(token), type, lifetime]);
  return token;
}

export async function consumeAuthToken(token: string, type: AuthTokenType, client: Queryable) {
  const hash = authTokenHash(token);
  const identity = (await client.query<{ user_id: string }>('SELECT user_id FROM auth_tokens WHERE token_hash=$1 AND type=$2', [hash, type])).rows[0];
  if (!identity) return null;
  if (!(await client.query('SELECT id FROM usuarios WHERE id=$1 AND ativo FOR UPDATE', [identity.user_id])).rowCount) return null;
  const result = await client.query<{ user_id: string }>(`DELETE FROM auth_tokens WHERE token_hash=$1 AND type=$2 AND expires_at>clock_timestamp() RETURNING user_id`, [hash, type]);
  return result.rows[0]?.user_id ?? null;
}
