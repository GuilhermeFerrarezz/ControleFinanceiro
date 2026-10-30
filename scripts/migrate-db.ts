import { migrateDatabase } from '../src/lib/migrations';
import sqlite3 from 'sqlite3';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

async function main() {
  const storage = process.env.DATABASE_STORAGE || './database.sqlite';
  if (storage !== ':memory:' && existsSync(storage)) {
    const backupDir = join(dirname(resolve(storage)), '.backups');
    await mkdir(backupDir, { recursive: true });
    const backup = join(backupDir, `database-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
    const db = new sqlite3.Database(storage);
    try {
      await new Promise<void>((resolve, reject) => db.run('VACUUM INTO ?', [backup], error => error ? reject(error) : resolve()));
    } finally {
      await new Promise<void>((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
    }
    console.log(`Backup criado em ${backup}`);
  }
  await migrateDatabase(storage);
}
main()
  .then(() => console.log('Migrações aplicadas com sucesso.'))
  .catch(error => { console.error(error instanceof Error ? error.message : 'Falha na migração.'); process.exitCode = 1; });
