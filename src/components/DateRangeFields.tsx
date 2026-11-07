'use client';

import { useState } from 'react';
import { selectedPeriodYear, yearPeriod } from '@/src/lib/expense-shared';
import styles from './finance.module.css';

export default function DateRangeFields({ start, end, years, today }: {
  start: string; end: string; years: number[]; today: string;
}) {
  const [period, setPeriod] = useState({ start, end });
  const [selectedYear, setSelectedYear] = useState(selectedPeriodYear({ start, end }, today));
  const availableYears = Array.from(new Set([
    ...years, Number(today.slice(0, 4)), Number(start.slice(0, 4)), Number(end.slice(0, 4)),
  ])).sort((a, b) => b - a);

  return <>
    <h3 className={styles.filterGroupTitle}>Datas e ano</h3>
    <label className={styles.filterField}>Ano
      <select value={selectedYear} onChange={event => {
        setSelectedYear(event.target.value);
        if (event.target.value) setPeriod(yearPeriod(Number(event.target.value), today));
      }}>
        <option value="">Período personalizado</option>
        {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
      </select>
    </label>
    <label className={styles.filterField}>De
      <input name="start" type="date" min="2000-01-01" max="2100-12-31" required
        value={period.start} onChange={event => {
          setPeriod({ ...period, start: event.target.value }); setSelectedYear('');
        }} />
    </label>
    <label className={styles.filterField}>Até
      <input name="end" type="date" min="2000-01-01" max="2100-12-31" required
        value={period.end} onChange={event => {
          setPeriod({ ...period, end: event.target.value }); setSelectedYear('');
        }} />
    </label>
  </>;
}
