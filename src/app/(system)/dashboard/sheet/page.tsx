import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/src/lib/auth';
import { expenseFilters, expenseSheet, type ExpenseSheetOrder } from '@/src/lib/expenses';
import { displayDate, money, PAYMENT_METHODS } from '@/src/lib/expense-shared';
import { userRestaurants } from '@/src/lib/restaurants';
import { InputError } from '@/src/lib/validation';
import Header from '@/src/components/cabecalho/page';
import ExpenseSheetTable from '@/src/components/ExpenseSheetTable';
import FinanceNav from '@/src/components/FinanceNav';
import styles from '@/src/components/finance.module.css';
import RestaurantSwitcher from '../RestaurantSwitcher';

export const metadata = { title: 'Planilha de gastos | Saldo da Casa' };
const path = '/dashboard/sheet';
const sortOptions = [
  { value: 'manual', label: 'Ordem personalizada' },
  { value: 'name-asc', label: 'Nome (A–Z)' },
  { value: 'name-desc', label: 'Nome (Z–A)' },
  { value: 'highest', label: 'Maior total primeiro' },
  { value: 'lowest', label: 'Menor total primeiro' },
] satisfies { value: ExpenseSheetOrder; label: string }[];

export default async function ExpenseSheetPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!user.empresaId) redirect('/home');

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') params.set(key, value);
  }

  let requested;
  let error = '';
  try { requested = expenseFilters(params); }
  catch (cause) {
    if (!(cause instanceof InputError)) throw cause;
    requested = expenseFilters();
    error = cause.message;
  }
  const order = sortOptions.find(option => option.value === params.get('sort'))?.value ?? 'manual';
  const detailDate = params.get('detailDate');
  const detailCategory = params.get('detailCategory');
  const detailPage = Number(params.get('detailPage') || 1);
  const detail = detailDate && detailCategory && Number.isSafeInteger(detailPage) && detailPage > 0 && detailPage <= 100000
    ? { date: detailDate, category: detailCategory, page: detailPage } : undefined;
  const { filters, categoryOptions, merchantOptions, columns, rows, pages, totalCents, details } =
    await expenseSheet({ ...user, empresaId: user.empresaId }, requested, order, detail);
  const period = new URLSearchParams({ start: filters.start, end: filters.end });
  function pageHref(page: number) {
    const query = new URLSearchParams(period);
    for (const key of ['category', 'merchant', 'status', 'q'] as const) {
      const value = filters[key];
      if (value) query.set(key, value);
    }
    query.set('sort', order);
    query.set('page', String(page));
    return path + '?' + query;
  }

  function detailsHref(page: number) {
    if (!details) return pageHref(filters.page);
    const query = new URLSearchParams(pageHref(filters.page).split('?')[1]);
    query.set('detailDate', details.date);
    query.set('detailCategory', details.category);
    query.set('detailPage', String(page));
    return path + '?' + query + '#detalhes-gastos';
  }

  return <>
    <Header nome={user.empresaNome || 'Meu restaurante'} user={user} />
    <main className={styles.main}>
      <FinanceNav active="sheet" />
      <div className={styles.heading}>
        <div><h1>Planilha de gastos</h1><p>Cada célula soma os lançamentos da categoria naquele dia.</p></div>
        <RestaurantSwitcher restaurants={await userRestaurants(user.id)} selected={user.empresaId} />
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <section className={styles.filtersCard} aria-label="Filtros da planilha">
        <form key={pageHref(1)} action={path} method="get" className={styles.filters}>
          <label className={styles.filterField}>De<input name="start" type="date" min="2000-01-01" max="2100-12-31" defaultValue={filters.start} required /></label>
          <label className={styles.filterField}>Até<input name="end" type="date" min="2000-01-01" max="2100-12-31" defaultValue={filters.end} required /></label>
          <label className={styles.filterField}>Categoria<select name="category" defaultValue={filters.category}>
            <option value="">Todas as categorias</option>
            {categoryOptions.filter(item => !item.archived).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select></label>
          <label className={styles.filterField}>Local<select name="merchant" defaultValue={filters.merchant}>
            <option value="">Todos os locais</option>
            {merchantOptions.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
          </select></label>
          <label className={styles.filterField}>Ordenar categorias<select name="sort" defaultValue={order}>
            {sortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select></label>
          <button className="button" type="submit">Aplicar filtros</button>
        </form>
        <form action={path} method="get" className={styles.periodLine}>
          <input type="hidden" name="start" value={filters.start} />
          <input type="hidden" name="end" value={filters.end} />
          <input type="hidden" name="sort" value={order} />
          <button className={styles.textButton} type="submit">Limpar filtros</button>
        </form>
      </section>
      <p className={styles.periodLine}>Período: {displayDate(filters.start)} a {displayDate(filters.end)}</p>
      <ExpenseSheetTable key={user.empresaId} storageId={user.empresaId} baseHref={pageHref(filters.page)}
        manual={order === 'manual'} columns={columns} rows={rows} totalCents={totalCents} />
      {details && <section id="detalhes-gastos" className={styles.sheetDetails} aria-labelledby="sheet-details-title">
        <div className={styles.headingActions}>
          <h2 id="sheet-details-title">{columns.find(item => item.id === details.category)?.label} · {displayDate(details.date)}</h2>
          <Link className={styles.textButton} href={pageHref(filters.page)} scroll={false}>Fechar detalhes</Link>
        </div>
        {!details.expenses.length && <p>Nenhum lançamento encontrado nesta página.</p>}
        {details.expenses.map(expense => <details key={expense.id} open={details.expenses.length === 1}>
          <summary><strong>{expense.description}</strong> · {money(expense.amountCents)}</summary>
          <dl>
            <div><dt>Local</dt><dd>{expense.merchant || 'Não informado'}</dd></div>
            <div><dt>Situação</dt><dd>{expense.status === 'paid' ? 'Pago' : 'A pagar'}</dd></div>
            <div><dt>Pagamento</dt><dd>{PAYMENT_METHODS.find(method => method.id === expense.paymentMethod)?.label}</dd></div>
            <div><dt>Lançado por</dt><dd>{expense.authorName}</dd></div>
            {expense.notes && <div><dt>Observações</dt><dd>{expense.notes}</dd></div>}
          </dl>
        </details>)}
        {(details.page > 1 || details.hasNext) && <nav className={styles.pagination} aria-label="Páginas dos lançamentos da célula">
          <span>Página {details.page}</span>
          <div>
            {details.page > 1 && <Link className={styles.textButton} href={detailsHref(details.page - 1)}>Lançamentos anteriores</Link>}
            {details.hasNext && <Link className={styles.textButton} href={detailsHref(details.page + 1)}>Mais lançamentos</Link>}
          </div>
        </nav>}
      </section>}
      {pages > 1 && <nav className={styles.pagination} aria-label="Páginas da planilha">
        <span>Página {filters.page} de {pages} · até 31 dias por página</span>
        <div>
          {filters.page > 1 && <Link className={styles.textButton} href={pageHref(filters.page - 1)}>Dias anteriores</Link>}
          {filters.page < pages && <Link className={styles.textButton} href={pageHref(filters.page + 1)}>Próximos dias</Link>}
        </div>
      </nav>}
    </main>
  </>;
}
