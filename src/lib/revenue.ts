import { subtractCents, sumCents } from './financial-math';
import { db } from './db';
import { inTransaction, type Queryable } from './postgres';
import { findMembership } from '../models/Membership';
import { expenseDaily, integer } from '../models/Expense';
import { addDays, buildExpenseSeries, daysBetween, type DailyRevenue, type ExpenseFilters, type FinanceComparison } from './expense-shared';

export async function listRevenue(empresaId: string, period: { start: string; end: string }, client: Queryable = db) {
  const { rows } = await client.query<{ date: string; totalCents: string }>(
    `SELECT to_char(date,'YYYY-MM-DD') AS date, amount_cents AS "totalCents" FROM daily_revenue
     WHERE empresa_id=$1 AND date BETWEEN $2::date AND $3::date ORDER BY date`,
    [empresaId, period.start, period.end]);
  return rows.map(row => ({ ...row, totalCents: integer(row.totalCents) }));
}

export async function saveRevenue(actor: { id: string; empresaId: string }, rows: DailyRevenue[], replace: boolean) {
  return inTransaction(async client => {
    if ((await findMembership(actor.id, actor.empresaId, client, true))?.role !== 'owner') return null;
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const result = await client.query(
      `INSERT INTO daily_revenue (empresa_id,date,amount_cents)
       SELECT $1,date,amount FROM unnest($2::date[],$3::bigint[]) AS item(date,amount)
       ON CONFLICT (empresa_id,date) ${replace
        ? 'DO UPDATE SET amount_cents=EXCLUDED.amount_cents,updated_at=CURRENT_TIMESTAMP'
        : 'DO NOTHING'}`,
      [actor.empresaId, sorted.map(row => row.date), sorted.map(row => row.totalCents)]);
    const saved = result.rowCount ?? 0;
    return { saved, skipped: rows.length - saved };
  });
}

export async function deleteRevenue(actor: { id: string; empresaId: string }, row: DailyRevenue) {
  return inTransaction(async client => {
    if ((await findMembership(actor.id, actor.empresaId, client, true))?.role !== 'owner') return null;
    const result = await client.query(
      'DELETE FROM daily_revenue WHERE empresa_id=$1 AND date=$2::date AND amount_cents=$3',
      [actor.empresaId, row.date, row.totalCents]);
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
