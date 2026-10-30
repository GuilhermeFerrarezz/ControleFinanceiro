import type { Pool, PoolClient } from 'pg';
import { db } from './db';

export type Queryable = Pick<Pool, 'query'>;
export async function inTransaction<T>(work: (client: PoolClient) => Promise<T>, readOnly = false): Promise<T> {
  const client = await db.connect();
  let discard = false;
  try {
    await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
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
