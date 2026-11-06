import type { ReactNode } from 'react';
import { displayDate } from '@/src/lib/expense-shared';
import styles from './finance.module.css';

export default function PeriodFilters({ start, end, primary, children, activeFilters = 0, advancedLabel = 'Mais filtros' }: {
  start: string; end: string; primary?: ReactNode; children: ReactNode;
  activeFilters?: number; advancedLabel?: string;
}) {
  return <section className={styles.filtersCard} aria-label="Filtros do período">
    <div className={styles.filterPanelHeading}>
      <h2>Período</h2>
      <span>{displayDate(start)} a {displayDate(end)}</span>
    </div>
    {primary}
    <details className={styles.filterDetails}>
      <summary>
        {advancedLabel}
        {activeFilters > 0 && <span className={styles.filterCount}>{activeFilters} {activeFilters === 1 ? 'ativo' : 'ativos'}</span>}
      </summary>
      <div className={styles.filterDetailsBody}>{children}</div>
    </details>
  </section>;
}
