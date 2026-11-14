import { db } from '../src/lib/db';
import { seedDemoHistory } from '../src/lib/demo-history';
import { todayInSaoPaulo } from '../src/lib/expense-shared';
import assert from 'node:assert/strict';

async function main() {
  const [email, empresaId, start, end = todayInSaoPaulo()] = process.argv.slice(2);
  if (!email || !empresaId || !start) throw new Error('Informe e-mail do dono, ID do restaurante e data inicial (AAAA-MM-DD).');
  const user = (await db.query<{ id: string }>('SELECT id FROM usuarios WHERE lower(btrim(email))=$1', [email.trim().toLowerCase()])).rows[0];
  if (!user) throw new Error('Conta não encontrada.');
  const existingExpenses = (await db.query('SELECT * FROM expenses WHERE empresa_id=$1 ORDER BY id', [empresaId])).rows;
  const existingRevenue = (await db.query('SELECT date::text,amount_cents,meals_sold,order_count,delivery_meals,dine_in_meals FROM daily_revenue WHERE empresa_id=$1 ORDER BY date', [empresaId])).rows;
  const result = await seedDemoHistory({ id: user.id, empresaId }, start, end);
  const afterExpenses = new Map((await db.query('SELECT * FROM expenses WHERE empresa_id=$1 ORDER BY id', [empresaId])).rows.map(row => [row.id, row]));
  for (const row of existingExpenses) assert.deepEqual(afterExpenses.get(row.id), row);
  const afterRevenue = new Map((await db.query('SELECT date::text,amount_cents,meals_sold,order_count,delivery_meals,dine_in_meals FROM daily_revenue WHERE empresa_id=$1 ORDER BY date', [empresaId])).rows.map(row => [row.date, row]));
  for (const row of existingRevenue) for (const key of ['amount_cents', 'meals_sold', 'order_count', 'delivery_meals', 'dine_in_meals']) {
    if (row[key] !== null) assert.equal(afterRevenue.get(row.date)?.[key], row[key]);
  }
  console.log(JSON.stringify({ ...result, preservedExpenses: existingExpenses.length, preservedRevenue: existingRevenue.length }));
}
main().catch(error => {
  console.error(error instanceof Error && !('code' in error) ? error.message : 'Não foi possível carregar o histórico de demonstração.');
  process.exitCode = 1;
}).finally(() => db.end());
