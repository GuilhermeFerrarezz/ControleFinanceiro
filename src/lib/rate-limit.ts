import { QueryTypes } from 'sequelize';
import { createHash } from 'node:crypto';
import { sequelize } from './db';
export async function consumeLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (key.endsWith(':global')) {
    await sequelize.query('DELETE FROM auth_rate_limits WHERE windowStart < :cutoff', { replacements: { cutoff: now - 24 * 60 * 60_000 } });
  }
  const hashedKey = createHash('sha256').update(key).digest('hex');
  await sequelize.query(
    `INSERT INTO auth_rate_limits (key, count, windowStart) VALUES (:key, 1, :now)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN windowStart <= :cutoff THEN 1 ELSE count + 1 END,
       windowStart = CASE WHEN windowStart <= :cutoff THEN :now ELSE windowStart END`,
    { replacements: { key: hashedKey, now, cutoff: now - windowMs }, type: QueryTypes.INSERT });
  // Sequelize 6's SQLite driver does not support INSERT ... RETURNING.
  // Concurrent increments may conservatively deny more requests, never increase the quota.
  const [row] = await sequelize.query<{ count: number }>('SELECT count FROM auth_rate_limits WHERE key = :key', {
    replacements: { key: hashedKey }, type: QueryTypes.SELECT,
  });
  return row.count <= limit;
}
