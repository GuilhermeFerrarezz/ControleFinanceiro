import { createHash } from 'node:crypto';
import { db } from './db';
export async function consumeLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (key.endsWith(':global')) await db.query('DELETE FROM auth_rate_limits WHERE window_start < $1', [now - 24 * 60 * 60_000]);
  const hashedKey = createHash('sha256').update(key).digest('hex');
  const { rows } = await db.query<{ count: number }>(
    `INSERT INTO auth_rate_limits (key,count,window_start) VALUES ($1,1,$2)
     ON CONFLICT (key) DO UPDATE SET
       count=CASE WHEN auth_rate_limits.window_start <= $3 THEN 1 ELSE auth_rate_limits.count+1 END,
       window_start=CASE WHEN auth_rate_limits.window_start <= $3 THEN $2 ELSE auth_rate_limits.window_start END
     RETURNING count`, [hashedKey, now, now - windowMs]);
  return rows[0].count <= limit;
}
