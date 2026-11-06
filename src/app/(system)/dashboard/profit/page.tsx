import { redirect } from 'next/navigation';
import { currentUser } from '@/src/lib/auth';
import { expenseFilters } from '@/src/lib/expenses';
import { inTransaction } from '@/src/lib/postgres';
import { financeComparison, financeDays } from '@/src/lib/revenue';
import { userRestaurants } from '@/src/lib/restaurants';
import { InputError } from '@/src/lib/validation';
import Header from '@/src/components/cabecalho/page';
import FinanceComparisonChart from '@/src/components/FinanceComparisonChart';
import MonthFilter from '@/src/components/MonthFilter';
import FinanceNav from '@/src/components/FinanceNav';
import styles from '@/src/components/finance.module.css';
import RestaurantSwitcher from '../RestaurantSwitcher';

export const metadata = { title: 'Lucro | Saldo da Casa' };
const path = '/dashboard/profit';

export default async function ProfitPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!user.empresaId) redirect('/home');
  const empresaId = user.empresaId;

  const params = await searchParams;
  const query = new URLSearchParams();
  for (const field of ['start', 'end', 'year', 'month', 'monthYear'] as const) {
    const value = params[field];
    if (typeof value === 'string') query.set(field, value);
  }
  let period;
  let error = '';
  try { period = expenseFilters(query); }
  catch (cause) {
    if (!(cause instanceof InputError)) throw cause;
    period = expenseFilters();
    error = cause.message;
  }
  const finance = await inTransaction(async client => {
    const { expenses, revenue } = await financeDays(empresaId, period, client);
    return financeComparison(expenses, revenue, period);
  }, true);

  return <>
    <Header nome={user.empresaNome || 'Meu restaurante'} user={user} />
    <main className={styles.main}>
      <FinanceNav active="profit" />
      <div className={styles.heading}>
        <div><h1>Lucro</h1><p>Acompanhe o resultado do restaurante no período.</p></div>
        <RestaurantSwitcher restaurants={await userRestaurants(user.id)} selected={empresaId} />
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <section className={styles.filtersCard} aria-label="Período do lucro">
        <MonthFilter action={path} start={period.start} />
        <form method="get" action={path} className={styles.filters}>
          <label className={styles.filterField}>De<input type="date" name="start" defaultValue={period.start} min="2000-01-01" max="2100-12-31" required /></label>
          <label className={styles.filterField}>Até<input type="date" name="end" defaultValue={period.end} min="2000-01-01" max="2100-12-31" required /></label>
          <button type="submit" className="button">Aplicar período</button>
        </form>
      </section>
      <FinanceComparisonChart key={`${empresaId}-${period.start}-${period.end}`} finance={finance} />
    </main>
  </>;
}
