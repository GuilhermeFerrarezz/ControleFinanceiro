import { migrateDatabase } from '../src/lib/migrations';
import { db } from '../src/lib/db';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL no arquivo .env.');
  await migrateDatabase();
  console.log('Schema PostgreSQL aplicado com sucesso.');
}
main().catch(() => {
  // Never print connection strings or database error details that may contain data.
  console.error('Não foi possível preparar o PostgreSQL. Confira DATABASE_URL, a conexão e as permissões para criar tabelas.');
  process.exitCode = 1;
}).finally(() => db.end());
