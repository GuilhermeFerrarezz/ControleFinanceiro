import { redirect } from 'next/navigation';
import { currentUser } from '@/src/lib/auth';
import { expenseDashboard, expenseFilters } from '@/src/lib/expenses';
import { InputError } from '@/src/lib/validation';
import { userRestaurants } from '@/src/lib/restaurants';
import Header from './cabecalho/page';
import FinanceNav from './FinanceNav';
import FinancialDashboard from './FinancialDashboard';
import styles from './finance.module.css';
export default async function FinancePage({ view, searchParams }: { view: 'overview' | 'expenses'; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!user.empresaId) redirect('/home');
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) if (typeof value === 'string') params.set(key, value);
  let filters;
  let notice = '';
  try { filters = expenseFilters(params); }
  catch (error) { if (!(error instanceof InputError)) throw error; filters = expenseFilters(); notice = error.message; }
  const data = await expenseDashboard({ ...user, empresaId: user.empresaId }, filters);
  return <><Header nome={user.empresaNome || 'Meu restaurante'} user={user} /><main className={styles.main}><FinanceNav active={view} />
    <FinancialDashboard key={`${user.empresaId}-${view}`} initialData={data} view={view} user={{ id: user.id, nome: user.nome, role: user.role }} restaurants={await userRestaurants(user.id)} selectedRestaurant={user.empresaId} initialNotice={notice} />
  </main></>;
}
