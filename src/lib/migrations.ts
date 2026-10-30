import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import { db } from './db';

// schema.sql owns BEGIN/COMMIT. All statements must run on this same connection.
export async function migrateDatabase(pool: Pool = db) {
  const sql = await readFile(new URL('../../schema.sql', import.meta.url), 'utf8');
  const client = await pool.connect();
  try { await client.query(sql); }
  catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
  finally { client.release(); }
}
