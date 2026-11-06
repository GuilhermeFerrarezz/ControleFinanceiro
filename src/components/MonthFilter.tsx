import type { ReactNode } from 'react';
import styles from './finance.module.css';

const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function MonthFilter({ action, start, children }: {
  action: string; start: string; children?: ReactNode;
}) {
  return <form key={start} action={action} method="get" className={`${styles.filters} ${styles.monthFilter}`}>
    <label className={styles.filterField}>Mês
      <select name="month" defaultValue={start.slice(5, 7)}>
        {months.map((name, index) => <option key={name} value={String(index + 1).padStart(2, '0')}>{name}</option>)}
      </select>
    </label>
    <label className={styles.filterField}>Ano do mês
      <input type="number" name="monthYear" min="2000" max="2100" defaultValue={start.slice(0, 4)} required />
    </label>
    {children}
    <button className="button button-outline" type="submit">Filtrar por mês</button>
  </form>;
}
