import { subtractCents, sumCents } from './financial-math';
import { db } from './db';
import { inTransaction, type Queryable } from './postgres';
import { findMembership } from '../models/Membership';
import { InputError } from './validation';
import { expenseDaily, integer } from '../models/Expense';
import { addDays, buildExpenseSeries, daysBetween, type DailyRevenue, type ExpenseFilters, type FinanceComparison } from './expense-shared';

export async function listRevenue(empresaId: string, period: { start: string; end: string }, client: Queryable = db) {
  const { rows } = await client.query<{ date: string; totalCents: string; mealsSold: number | null; deliveryMeals: number | null; dineInMeals: number | null; orderCount: number | null }>(
    `SELECT to_char(date,'YYYY-MM-DD') AS date, amount_cents AS "totalCents",
     meals_sold AS "mealsSold", order_count AS "orderCount", delivery_meals AS "deliveryMeals", dine_in_meals AS "dineInMeals", (demo_key IS NOT NULL) AS "isDemo" FROM daily_revenue
     WHERE empresa_id=$1 AND date BETWEEN $2::date AND $3::date ORDER BY date`,
    [empresaId, period.start, period.end]);
  return rows.map(row => ({ ...row, totalCents: integer(row.totalCents) }));
}

export class RevenueConflictError extends InputError {}

export async function saveRevenue(actor: { id: string; empresaId: string }, rows: DailyRevenue[], replace: boolean, expected: DailyRevenue | null = null) {
  return inTransaction(async client => {
    if ((await findMembership(actor.id, actor.empresaId, client, true))?.role !== 'owner') return null;
    if (replace) {
      if (rows.length !== 1 || (expected && expected.date !== rows[0].date)) throw new InputError('Informe um único dia e seu valor anterior.');
      const row = rows[0];
      const values = [actor.empresaId, row.date, row.totalCents, row.mealsSold ?? null,
        row.orderCount ?? null, row.deliveryMeals ?? null, row.dineInMeals ?? null];
      const result = expected
        ? await client.query(`UPDATE daily_revenue SET amount_cents=$3,meals_sold=$4,order_count=$5,
            delivery_meals=$6,dine_in_meals=$7,demo_key=NULL,updated_at=clock_timestamp()
            WHERE empresa_id=$1 AND date=$2 AND amount_cents=$8
            AND meals_sold IS NOT DISTINCT FROM $9::integer AND order_count IS NOT DISTINCT FROM $10::integer
            AND delivery_meals IS NOT DISTINCT FROM $11::integer AND dine_in_meals IS NOT DISTINCT FROM $12::integer`,
          [...values, expected.totalCents, expected.mealsSold ?? null, expected.orderCount ?? null,
            expected.deliveryMeals ?? null, expected.dineInMeals ?? null])
        : await client.query(`INSERT INTO daily_revenue(empresa_id,date,amount_cents,meals_sold,order_count,delivery_meals,dine_in_meals)
            VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (empresa_id,date) DO NOTHING`, values);
      if (result.rowCount !== 1) throw new RevenueConflictError('O faturamento mudou. Atualize a página e selecione o dia novamente antes de salvar.');
      return { saved: 1, skipped: 0 };
    }
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const result = await client.query(
      `INSERT INTO daily_revenue (empresa_id,date,amount_cents,meals_sold,order_count,delivery_meals,dine_in_meals)
       SELECT $1,date,amount,meals,orders,delivery,dine_in FROM unnest($2::date[],$3::bigint[],$4::integer[],$5::integer[],$6::integer[],$7::integer[]) AS item(date,amount,meals,orders,delivery,dine_in)
       ON CONFLICT (empresa_id,date) DO NOTHING`,
      [actor.empresaId, sorted.map(row => row.date), sorted.map(row => row.totalCents),
        sorted.map(row => row.mealsSold ?? null), sorted.map(row => row.orderCount ?? null),
        sorted.map(row => row.deliveryMeals ?? null), sorted.map(row => row.dineInMeals ?? null)]);
    const saved = result.rowCount ?? 0;
    return { saved, skipped: rows.length - saved };
  });
}

export async function deleteRevenue(actor: { id: string; empresaId: string }, row: DailyRevenue) {
  return inTransaction(async client => {
    if ((await findMembership(actor.id, actor.empresaId, client, true))?.role !== 'owner') return null;
    const result = await client.query(
      `DELETE FROM daily_revenue WHERE empresa_id=$1 AND date=$2::date AND amount_cents=$3
       AND meals_sold IS NOT DISTINCT FROM $4::integer AND order_count IS NOT DISTINCT FROM $5::integer
       AND delivery_meals IS NOT DISTINCT FROM $6::integer AND dine_in_meals IS NOT DISTINCT FROM $7::integer`,
      [actor.empresaId, row.date, row.totalCents, row.mealsSold ?? null, row.orderCount ?? null, row.deliveryMeals ?? null, row.dineInMeals ?? null]);
    return result.rowCount === 1;
  });
}

export async function financeDays(empresaId: string, period: ExpenseFilters, client: Queryable = db,
  unfilteredDaily?: DailyRevenue[]) {
  // Profit compares revenue with all costs, regardless of the expense-only filters.
  const expenses = unfilteredDaily ?? await expenseDaily(empresaId,
    { ...period, category: '', merchant: '', status: '', q: '' }, client);
  const revenue = await listRevenue(empresaId, period, client);
  return { expenses, revenue };
}

export function financeComparison(expenses: DailyRevenue[], revenue: DailyRevenue[], period: ExpenseFilters): FinanceComparison {
  const { start, end } = period;
  expenses = expenses.filter(row => row.date >= start && row.date <= end);
  revenue = revenue.filter(row => row.date >= start && row.date <= end);
  const { series: costs, seriesInterval } = buildExpenseSeries(expenses, start, end);
  const sales = buildExpenseSeries(revenue, start, end).series;
  const coverage = buildExpenseSeries(revenue.map(row => ({ ...row, totalCents: 1 })), start, end).series;
  const revenueCents = sumCents(revenue.map(row => row.totalCents));
  const expenseCents = sumCents(expenses.map(row => row.totalCents));
  return {
    revenueCents, expenseCents, profitCents: revenue.length ? subtractCents(revenueCents, expenseCents) : null,
    recordedDays: revenue.length, periodDays: daysBetween(start, end), seriesInterval,
    series: costs.map((row, index) => {
      const next = new Date(`${row.date}T12:00:00Z`);
      if (seriesInterval === 'year') next.setUTCFullYear(next.getUTCFullYear() + 1);
      else if (seriesInterval === 'month') next.setUTCMonth(next.getUTCMonth() + 1);
      else next.setUTCDate(next.getUTCDate() + 1);
      const bucketEnd = addDays(next.toISOString().slice(0, 10), -1);
      return {
        date: row.date, expenseCents: row.totalCents,
        revenueCents: coverage[index].totalCents ? sales[index].totalCents : null,
        profitCents: coverage[index].totalCents ? subtractCents(sales[index].totalCents, row.totalCents) : null,
        recordedDays: coverage[index].totalCents,
        periodDays: daysBetween(row.date < start ? start : row.date, bucketEnd > end ? end : bucketEnd),
      };
    }),
  };
}
