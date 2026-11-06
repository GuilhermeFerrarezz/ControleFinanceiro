import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/src/lib/auth';
import { expenseFilters } from '@/src/lib/expenses';
import { buildExpenseSeries, money, todayInSaoPaulo, type DailyRevenue } from '@/src/lib/expense-shared';
import { listRevenue } from '@/src/lib/revenue';
import { userRestaurants } from '@/src/lib/restaurants';
import { InputError } from '@/src/lib/validation';
import Header from '@/src/components/cabecalho/page';
import MonthFilter from '@/src/components/MonthFilter';
import PeriodFilters from '@/src/components/PeriodFilters';
import FinanceNav from '@/src/components/FinanceNav';
import RevenueEditor from '@/src/components/RevenueEditor';
import MoneyTrendChart from '@/src/components/MoneyTrendChart';
import styles from '@/src/components/finance.module.css';
import RestaurantSwitcher from '../RestaurantSwitcher';

export const metadata = { title: 'Faturamento | Saldo da Casa' };
const path = '/dashboard/revenue';

export default async function RevenuePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!user.empresaId) redirect('/home');
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') query.set(key, value);
  }
  let period;
  let error = '';
  try { period = expenseFilters(query); }
  catch (cause) {
    if (!(cause instanceof InputError)) throw cause;
    period = expenseFilters();
    error = cause.message;
  }
  const rows = await listRevenue(user.empresaId, period);
  const totalCents = rows.reduce((sum, row) => sum + row.totalCents, 0);
  const trend = buildExpenseSeries(rows, period.start, period.end);
  const coverage = buildExpenseSeries(rows.map(row => ({ ...row, totalCents: 1 })), period.start, period.end);
  const series = trend.series.map((row, index) => ({
    ...row, totalCents: coverage.series[index].totalCents ? row.totalCents : null,
  }));
  const peak = rows.reduce<DailyRevenue | null>((best, row) =>
    !best || row.totalCents > best.totalCents ? row : best, null);
  const pageSize = 31;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(period.page, pages);
  const visibleRows = rows.slice(Math.max(0, rows.length - page * pageSize), rows.length - (page - 1) * pageSize);
  const dates = new URLSearchParams({ start: period.start, end: period.end });
  return <>
    <Header nome={user.empresaNome || 'Meu restaurante'} user={user} />
    <main className={styles.main}>
      <FinanceNav active="revenue" />
      <div className={styles.heading}>
        <div><h1>Faturamento</h1><p>Registre a soma dos pedidos de cada dia.</p></div>
        <RestaurantSwitcher restaurants={await userRestaurants(user.id)} selected={user.empresaId} />
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <PeriodFilters start={period.start} end={period.end} advancedLabel="Datas personalizadas"
        primary={<MonthFilter action={path} start={period.start} />}>
        <form key={period.start + period.end} method="get" action={path} className={styles.filters}>
          <label className={styles.filterField}>De<input type="date" name="start" defaultValue={period.start} min="2000-01-01" max="2100-12-31" required /></label>
          <label className={styles.filterField}>Até<input type="date" name="end" defaultValue={period.end} min="2000-01-01" max="2100-12-31" required /></label>
          <button type="submit" className="button">Aplicar período</button>
        </form>
      </PeriodFilters>
      <div className={styles.periodLine}>
        <span>{rows.length} dias registrados · Total informado: {money(totalCents)}</span>
        <a className={styles.textButton} href={`/api/v1/revenue?${dates}`}>Exportar faturamento CSV</a>
      </div>
      <MoneyTrendChart titleId="revenue-trend-title" title="O ritmo do faturamento" metric="Faturamento"
        emptyTitle="Seu gráfico começa no primeiro registro." peakLabel="Dia de maior faturamento" daysLabel="Dias com faturamento"
        series={series} interval={trend.seriesInterval} start={period.start} end={period.end}
        totalCents={totalCents} peak={peak} recordedDays={rows.length} hasRecords={rows.length > 0} showZeros
        className={`${styles.chartCard} ${styles.revenueTrend}`} />
      <RevenueEditor key={user.empresaId} empresaId={user.empresaId} today={todayInSaoPaulo()} rows={visibleRows} canEdit={user.role === 'owner'} />
      {pages > 1 && <nav className={styles.pagination} aria-label="Páginas do faturamento">
        <span>Página {page} de {pages}</span>
        <div>
          {page > 1 && <Link href={`${path}?${dates}&page=${page - 1}`}>Dias mais recentes</Link>}
          {page < pages && <Link href={`${path}?${dates}&page=${page + 1}`}>Dias anteriores</Link>}
        </div>
      </nav>}
    </main>
  </>;
}
