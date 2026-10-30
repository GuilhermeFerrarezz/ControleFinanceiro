import Link from 'next/link';
import Icon from './Icon';
import styles from './finance.module.css';
export default function FinanceNav({ active }: { active: 'overview' | 'expenses' | 'team' }) {
  return <nav className={styles.navigation} aria-label="Áreas do restaurante">
    <Link href="/dashboard" aria-current={active === 'overview' ? 'page' : undefined}><Icon name="chart" size={18} />Visão geral</Link>
    <Link href="/dashboard/expenses" aria-current={active === 'expenses' ? 'page' : undefined}><Icon name="receipt" size={18} />Lançamentos</Link>
    <Link href="/dashboard/team" aria-current={active === 'team' ? 'page' : undefined}><Icon name="team" size={18} />Equipe</Link>
  </nav>;
}
