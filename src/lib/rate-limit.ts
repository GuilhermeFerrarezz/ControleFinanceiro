import { createHash } from 'node:crypto';
import { db } from './db';
import type { Queryable } from './postgres';

function hashLimitKey(key: string) {
  return createHash('sha256').update(key).digest('hex');
}

export async function resetLimit(key: string, client: Queryable) {
  await client.query('DELETE FROM auth_rate_limits WHERE key=$1', [hashLimitKey(key)]);
}

export async function consumeLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup >= 60_000) {
    lastCleanup = now;
    await db.query(`DELETE FROM auth_rate_limits WHERE key IN (
      SELECT key FROM auth_rate_limits WHERE window_start < $1 ORDER BY window_start LIMIT 1000
    )`, [now - 24 * 60 * 60_000]);
  }
  const hashedKey = hashLimitKey(key);
  const { rows } = await db.query<{ count: number }>(
    `INSERT INTO auth_rate_limits (key,count,window_start) VALUES ($1,1,$2)
     ON CONFLICT (key) DO UPDATE SET
       count=CASE WHEN auth_rate_limits.window_start <= $3 THEN 1 ELSE auth_rate_limits.count+1 END,
       window_start=CASE WHEN auth_rate_limits.window_start <= $3 THEN $2 ELSE auth_rate_limits.window_start END
     WHERE auth_rate_limits.window_start <= $3 OR auth_rate_limits.count <= $4
     RETURNING count`, [hashedKey, now, now - windowMs, limit]);
  // A saturated bucket rejects subsequent requests without repeatedly rewriting its row.
  return rows.length === 1 && rows[0].count <= limit;
}
let lastCleanup = 0;
