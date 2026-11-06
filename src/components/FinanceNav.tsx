import Link from 'next/link';
import Icon from './Icon';
import styles from './finance.module.css';
export default function FinanceNav({ active }: { active: 'overview' | 'profit' | 'expenses' | 'sheet' | 'revenue' | 'team' | 'restaurant' | 'catalog' }) {
  return <nav className={styles.navigation} aria-label="Áreas do restaurante">
    <Link href="/dashboard" aria-current={active === 'overview' ? 'page' : undefined}><Icon name="chart" size={18} />Visão geral</Link>
    <Link href="/dashboard/profit" aria-current={active === 'profit' ? 'page' : undefined}><Icon name="chart" size={18} />Lucro</Link>
    <Link href="/dashboard/expenses" aria-current={active === 'expenses' ? 'page' : undefined}><Icon name="receipt" size={18} />Lançamentos</Link>
    <Link href="/dashboard/sheet" aria-current={active === 'sheet' ? 'page' : undefined}><Icon name="receipt" size={18} />Planilha</Link>
    <Link href="/dashboard/revenue" aria-current={active === 'revenue' ? 'page' : undefined}><Icon name="chart" size={18} />Faturamento</Link>
    <Link href="/dashboard/catalog" aria-current={active === 'catalog' ? 'page' : undefined}><Icon name="store" size={18} />Categorias e locais</Link>
    <Link href="/dashboard/team" aria-current={active === 'team' ? 'page' : undefined}><Icon name="team" size={18} />Equipe</Link>
    <Link href="/dashboard/restaurant" aria-current={active === 'restaurant' ? 'page' : undefined}><Icon name="store" size={18} />Restaurante</Link>
  </nav>;
}
