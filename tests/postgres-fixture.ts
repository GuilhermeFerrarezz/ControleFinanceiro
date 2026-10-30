import { randomUUID } from 'node:crypto';
import { Pool, type QueryResultRow } from 'pg';
import { migrateDatabase } from '../src/lib/migrations';

export async function isolatedDatabase() {
  const base = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!base) throw new Error('Defina TEST_DATABASE_URL ou DATABASE_URL para executar os testes de integração PostgreSQL.');
  const admin = new Pool({ connectionString: base, connectionTimeoutMillis: 5000 });
  const schema = `test_finance_${randomUUID().replaceAll('-', '')}`;
  // PostgreSQL identifiers cannot be bound. This name is internally generated,
  // checked against a strict allowlist and quoted; no user data enters DDL.
  if (!/^test_finance_[0-9a-f]{32}$/.test(schema)) throw new Error('Schema de teste inválido.');
  const url = new URL(base);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const connectionString = url.toString();
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
  const cleanup = async () => {
    await pool.end();
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  };
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await migrateDatabase(pool);
  } catch (error) { await cleanup(); throw error; }
  return { pool, connectionString, cleanup };
}
export async function query<T extends QueryResultRow = Record<string, unknown>>(pool: Pool, sql: string, values: unknown[] = []): Promise<T[]> {
  return (await pool.query<T>(sql, values)).rows;
}
