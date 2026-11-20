import type { Pool, PoolClient } from 'pg';
import { db } from './db';

export type Queryable = Pick<Pool, 'query'>;
export async function inTransaction<T>(work: (client: PoolClient) => Promise<T>, readOnly = false): Promise<T> {
  const client = await db.connect();
  let discard = false;
  try {
    // SET LOCAL works with Neon's transaction pooler; startup/session settings
    // can be rejected or leak into another borrower of a pooled connection.
    const begin = readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN';
    await client.query(`${begin}; SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='15s'`);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => { discard = true; });
    throw error;
  } finally { client.release(discard); }
}
export function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
