import 'server-only';
import { Pool } from 'pg';
import { databaseOptions } from './database-options';

// Reuse one pool during Next.js development reloads.
const globalForDb = globalThis as unknown as { pgPool?: Pool };
export const db = globalForDb.pgPool ?? new Pool(databaseOptions(process.env.DATABASE_URL));
// Idle connections may be closed by the database. pg discards them automatically.
if (!globalForDb.pgPool) {
  db.on('error', () => console.error('Uma conexão ociosa com o PostgreSQL foi encerrada.'));
}
if (process.env.NODE_ENV !== 'production') globalForDb.pgPool = db;
