'use client';

import { useState, type PointerEvent } from 'react';
import { money, trendPeriodLabel, type FinanceComparison } from '@/src/lib/expense-shared';
import { chartPeriodIndex } from './chart-pointer';
import styles from './finance.module.css';

const metrics = [
  { key: 'revenueCents', label: 'Faturamento', color: '#267654' },
  { key: 'expenseCents', label: 'Gastos', color: '#a64f2c' },
  { key: 'profitCents', label: 'Resultado', color: '#4a579b' },
] as const;

export default function FinanceComparisonChart({ finance }: { finance: FinanceComparison }) {
  const [selectedDate, setSelectedDate] = useState('');
  const [hoverDate, setHoverDate] = useState('');
  const activeIndex = finance.series.findIndex(row => row.date === (hoverDate || selectedDate));
  const active = finance.series[activeIndex];
  const displayed = active ?? finance;
  const values = finance.series.flatMap(row => metrics.map(metric => row[metric.key] ?? 0));
  const max = Math.max(100, ...values);
  const min = Math.min(0, ...values);
  const left = 68, right = 690;
  const x = (index: number) => finance.series.length === 1 ? (left + right) / 2 : left + index * (right - left) / (finance.series.length - 1);
  const y = (value: number) => 200 - (value - min) * 170 / (max - min);
  const label = (date: string, short = false) => trendPeriodLabel(date, finance.seriesInterval, short);
  const ticks = [...new Set([0, Math.floor((finance.series.length - 1) / 2), finance.series.length - 1])];
  function inspect(event: PointerEvent<SVGSVGElement>, pin: boolean) {
    const index = chartPeriodIndex(event, left, right, finance.series.length);
    if (index === null) return;
    const date = finance.series[index].date;
    if (pin) { setSelectedDate(date); setHoverDate(''); }
    else if (event.pointerType === 'mouse') setHoverDate(date);
  }
  return <section className={styles.financeComparison} aria-labelledby="finance-comparison-title">
    <div className={styles.cardHeading}>
      <div><h2 id="finance-comparison-title">Faturamento, gastos e lucro</h2><p>O resultado indica o lucro ou prejuízo estimado a partir do faturamento e dos gastos registrados.</p></div>
    </div>
    <label className={`${styles.filterField} ${styles.comparisonPeriod}`}>Período em destaque
      <select value={finance.series.some(row => row.date === selectedDate) ? selectedDate : ''} onChange={event => { setSelectedDate(event.target.value); setHoverDate(''); }}>
        <option value="">Total do período</option>
        {finance.series.map(row => <option key={row.date} value={row.date}>{label(row.date)}</option>)}
      </select>
    </label>
    <div aria-live="polite">
      <p className={styles.financeCoverage}>{active ? label(active.date) : 'Total do período'}</p>
      <div className={styles.financeMetrics}>
        {metrics.map(metric => {
          const value = displayed[metric.key];
          return <div key={metric.key}><span>{metric.label}</span><strong>
            {value === null || (!active && metric.key === 'revenueCents' && !finance.recordedDays)
              ? 'Sem registro' : money(value)}
          </strong></div>;
        })}
      </div>
    </div>
    <p className={styles.financeCoverage}>{finance.recordedDays} de {finance.periodDays} dias com faturamento registrado.
      {finance.recordedDays < finance.periodDays && ' Os resultados com dias faltantes são parciais.'}
      {' '}A comparação considera todos os gastos do restaurante no período.</p>
    <ul className={styles.financeLegend}>{metrics.map(metric =>
      <li key={metric.key}><i style={{ background: metric.color }} />{metric.label}</li>)}</ul>
    <svg className={styles.lineChart} viewBox="0 0 720 235" role="img" aria-label="Comparação de faturamento, gastos e resultado. Selecione um período para consultar seus valores."
      onPointerMove={event => inspect(event, false)} onPointerDown={event => inspect(event, true)} onPointerLeave={() => setHoverDate('')}>
      {[min, 0, max].filter((value, index, all) => all.indexOf(value) === index).map(value =>
        <g key={value}><line x1={68} x2={690} y1={y(value)} y2={y(value)} stroke="#d7dfcf" strokeDasharray="4 4" />
          <text x={60} y={y(value) + 4} textAnchor="end" fontSize="11" fill="#65745a">{new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(value / 100)}</text></g>)}
      {metrics.map(metric => {
        const path = finance.series.map((row, index) => {
          const value = row[metric.key];
          if (value === null) return '';
          return `${index > 0 && finance.series[index - 1][metric.key] !== null ? 'L' : 'M'}${x(index)} ${y(value)}`;
        }).join(' ');
        return <g key={metric.key}><path d={path} fill="none" stroke={metric.color} strokeWidth="2.5" />
          {finance.series.map((row, index) => row[metric.key] !== null && <circle key={row.date} cx={x(index)} cy={y(row[metric.key]!)} r="3" fill={metric.color}>
            <title>{label(row.date)} · {metric.label}: {money(row[metric.key]!)}</title>
          </circle>)}</g>;
      })}
      {active && <g pointerEvents="none">
        <line x1={x(activeIndex)} x2={x(activeIndex)} y1={30} y2={200} stroke="#81966a" strokeDasharray="3 4" />
        {metrics.map(metric => {
          const value = active[metric.key];
          return value === null ? null : <circle key={metric.key} cx={x(activeIndex)} cy={y(value)} r="6" fill={metric.color} stroke="#fffefa" strokeWidth="2" />;
        })}
      </g>}
      {ticks.map(index => <text key={index} x={x(index)} y="223" textAnchor="middle" fontSize="11" fill="#65745a">{label(finance.series[index].date, true)}</text>)}
    </svg>
    <details className={styles.chartValues}><summary>Ver valores da comparação</summary><div><table>
      <thead><tr><th>Período</th>{metrics.map(metric => <th key={metric.key}>{metric.label}</th>)}</tr></thead>
      <tbody>{finance.series.map(row => <tr key={row.date}><th scope="row">{label(row.date)}</th>
        {metrics.map(metric => <td key={metric.key}>{row[metric.key] === null ? '—' : money(row[metric.key]!)}</td>)}</tr>)}</tbody>
    </table></div></details>
  </section>;
}
