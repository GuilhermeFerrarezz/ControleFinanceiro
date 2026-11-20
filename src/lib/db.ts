import 'server-only';
import { Pool } from 'pg';
import { databaseOptions } from './database-options';

// Route bundles also share the pool in production, within this process only.
const globalForDb = globalThis as unknown as { pgPool?: Pool };
export const db = globalForDb.pgPool ?? new Pool(databaseOptions(process.env.DATABASE_URL));
// Idle connections may be closed by the database. pg discards them automatically.
if (!globalForDb.pgPool) {
  db.on('error', () => console.error('Uma conexão ociosa com o PostgreSQL foi encerrada.'));
}
globalForDb.pgPool = db;
