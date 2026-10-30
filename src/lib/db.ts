import { Pool } from 'pg';

// Reuse one pool during Next.js development reloads.
const globalForDb = globalThis as unknown as { pgPool?: Pool };
export const db = globalForDb.pgPool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});
// Idle connections may be closed by the database. pg discards them automatically.
if (!globalForDb.pgPool) {
  db.on('error', () => console.error('Uma conexão ociosa com o PostgreSQL foi encerrada.'));
}
if (process.env.NODE_ENV !== 'production') globalForDb.pgPool = db;
