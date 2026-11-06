import { db } from './db';
import { inTransaction, type Queryable } from './postgres';
import { findMembership } from '../models/Membership';
import { expenseDaily, integer } from '../models/Expense';
import { buildExpenseSeries, daysBetween, type DailyRevenue, type ExpenseFilters, type FinanceComparison } from './expense-shared';

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
  const { series: costs, seriesInterval } = buildExpenseSeries(expenses, start, end);
  const sales = buildExpenseSeries(revenue, start, end).series;
  const coverage = buildExpenseSeries(revenue.map(row => ({ ...row, totalCents: 1 })), start, end).series;
  const revenueCents = integer(revenue.reduce((total, row) => total + row.totalCents, 0));
  const expenseCents = integer(expenses.reduce((total, row) => total + row.totalCents, 0));
  return {
    revenueCents, expenseCents, profitCents: revenue.length ? revenueCents - expenseCents : null,
    recordedDays: revenue.length, periodDays: daysBetween(start, end), seriesInterval,
    series: costs.map((row, index) => ({
      date: row.date, expenseCents: row.totalCents,
      revenueCents: coverage[index].totalCents ? sales[index].totalCents : null,
      profitCents: coverage[index].totalCents ? sales[index].totalCents - row.totalCents : null,
    })),
  };
}
