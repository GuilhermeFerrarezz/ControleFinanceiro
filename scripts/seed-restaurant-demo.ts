import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { db } from '../src/lib/db';
import { seedRestaurantDemo } from '../src/lib/restaurant-demo';

async function main() {
  const [email, empresaId, start, end] = process.argv.slice(2);
  if (!email || !empresaId || !start || !end) throw new Error('Informe e-mail do dono, restaurante, início e fim.');
  const user = (await db.query<{ id: string }>(`SELECT u.id FROM usuarios u JOIN restaurant_members m ON m.user_id=u.id
    WHERE lower(btrim(u.email))=$1 AND m.empresa_id=$2 AND m.role='owner'`, [email.trim().toLowerCase(), empresaId])).rows[0];
  if (!user) throw new Error('Conta administradora não encontrada.');
  const folder = resolve('reports', `restaurant-demo-${start}-${end}`);
  await mkdir(folder, { recursive: true });
  const before: Record<string, unknown> = {};
  for (const table of ['expenses', 'daily_revenue', 'inventory_products', 'inventory_movements', 'restaurant_catalog']) {
    // Table names are fixed above; only values come from CLI arguments.
    before[table] = (await db.query(`SELECT * FROM ${table} WHERE empresa_id=$1`, [empresaId])).rows;
  }
  await writeFile(resolve(folder, `backup-antes-${Date.now()}.json`), JSON.stringify(before, null, 2));
  const result = await seedRestaurantDemo({ id: user.id, empresaId }, start, end);
  await writeFile(resolve(folder, 'carga.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
main().catch(error => {
  console.error(error instanceof Error && !('code' in error) ? error.message : 'Não foi possível carregar os lançamentos de exemplo.');
  process.exitCode = 1;
}).finally(() => db.end());
