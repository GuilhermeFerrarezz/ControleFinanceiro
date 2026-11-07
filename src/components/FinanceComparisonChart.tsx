'use client';

import { useState, type PointerEvent } from 'react';
import { money, trendPeriodLabel, type FinanceComparison } from '@/src/lib/expense-shared';
import { moneyAxisLabel, moneyChartScale } from '@/src/lib/chart-scale';
import { chartPeriodIndex } from './chart-pointer';
import styles from './finance.module.css';

const metrics = [
  { key: 'revenueCents', label: 'Faturamento', color: '#267654' },
  { key: 'expenseCents', label: 'Gastos', color: '#a64f2c' },
  { key: 'profitCents', label: 'Lucro / prejuízo', color: '#4a579b' },
] as const;

export default function FinanceComparisonChart({ finance }: { finance: FinanceComparison }) {
  const [selectedDate, setSelectedDate] = useState('');
  const [hoverDate, setHoverDate] = useState('');
  const activeIndex = finance.series.findIndex(row => row.date === (hoverDate || selectedDate));
  const active = finance.series[activeIndex];
  const scale = moneyChartScale(finance.series.flatMap(row => metrics.map(metric => row[metric.key])));
  const left = 80, right = 700, top = 30, bottom = 220;
  const slot = (right - left) / Math.max(1, finance.series.length);
  const barWidth = Math.min(24, slot * .32);
  const x = (index: number) => left + slot * (index + .5);
  const y = (value: number) => bottom - (value - scale.min) / (scale.max - scale.min) * (bottom - top);
  const label = (date: string, short = false) => trendPeriodLabel(date, finance.seriesInterval, short);
  const ticks = finance.series.length ? [...new Set(Array.from({ length: 5 }, (_, index) =>
    Math.round(index * (finance.series.length - 1) / 4)))] : [];
  const partial = finance.recordedDays < finance.periodDays;
  const profitPath = finance.series.map((row, index) => row.profitCents === null ? '' :
    `${index > 0 && finance.series[index - 1].profitCents !== null ? 'L' : 'M'}${x(index)} ${y(row.profitCents)}`).join(' ');
  function inspect(event: PointerEvent<SVGSVGElement>, pin: boolean) {
    const index = chartPeriodIndex(event, x(0), x(finance.series.length - 1), finance.series.length);
    if (index === null) return;
    const date = finance.series[index].date;
    if (pin) { setSelectedDate(date); setHoverDate(''); }
    else if (event.pointerType === 'mouse') setHoverDate(date);
  }
  return <section className={styles.financeComparison} aria-labelledby="finance-comparison-title">
    <div className={styles.cardHeading}>
      <div><h2 id="finance-comparison-title">Faturamento, gastos e lucro</h2>
        <p>Lucro ou prejuízo = faturamento registrado − todos os gastos do período.</p></div>
    </div>
    <p className={styles.financeCoverage}>Totais do período selecionado{partial && finance.recordedDays > 0 ? ' · Resultado parcial' : ''}</p>
    <div className={styles.financeMetrics}>
      {metrics.map(metric => <div key={metric.key} style={{ borderTop: `3px solid ${metric.color}` }}>
        <span>{metric.label}</span><strong>{finance[metric.key] === null || (metric.key === 'revenueCents' && !finance.recordedDays)
          ? 'Sem registro' : money(finance[metric.key]!)}</strong>
      </div>)}
    </div>
    <p className={styles.financeCoverage}>{finance.recordedDays} de {finance.periodDays} dias com faturamento registrado.
      {partial && ' Faturamento ausente não equivale a zero. O resultado parcial desconta todos os gastos, inclusive os dos dias sem faturamento informado.'}
    </p>
    <div className={styles.comparisonToolbar}>
      <ul className={styles.financeLegend}>{metrics.map(metric =>
        <li key={metric.key}><i style={{ background: metric.color, borderRadius: metric.key === 'profitCents' ? 8 : 2,
          width: metric.key === 'profitCents' ? 24 : 10, height: metric.key === 'profitCents' ? 3 : 10 }} />{metric.label}</li>)}</ul>
      <label className={`${styles.filterField} ${styles.comparisonPeriod}`}>Consultar valores
        <select value={selectedDate} onChange={event => { setSelectedDate(event.target.value); setHoverDate(''); }}>
          <option value="">Selecione um período</option>
          {finance.series.map(row => <option key={row.date} value={row.date}>{label(row.date)}</option>)}
        </select>
      </label>
    </div>
    <p className={styles.financeCoverage}>Valores em R$ · {finance.seriesInterval === 'day' ? 'Totais por dia' : finance.seriesInterval === 'month' ? 'Totais por mês' : 'Totais por ano'}.
      {' '}Barras: faturamento e gastos. Linha: lucro acima de zero, prejuízo abaixo de zero. Lacunas indicam faturamento não informado.</p>
    <div className={styles.comparisonReadout} aria-live="polite">
      {active ? <>
        <strong>{label(active.date)}{active.recordedDays < active.periodDays && active.recordedDays > 0 ? ' · Parcial' : ''}</strong>
        <div>{metrics.map(metric => <span key={metric.key} style={{ color: metric.color }}>
          {metric.label}: <b>{active[metric.key] === null ? 'Sem registro' : money(active[metric.key]!)}</b>
        </span>)}</div>
        <small>Faturamento informado em {active.recordedDays} de {active.periodDays} dias.</small>
      </> : <><strong>Consulte cada ponto</strong><span>Passe o mouse, toque no gráfico ou selecione um período acima para ver os valores exatos.</span></>}
    </div>
    <svg className={`${styles.lineChart} ${styles.comparisonChart}`} viewBox="0 0 740 260" role="img"
      aria-label="Comparação em reais. Barras de faturamento e gastos e linha de lucro ou prejuízo. Valores exatos na tabela abaixo."
      onPointerMove={event => inspect(event, false)} onPointerDown={event => inspect(event, true)} onPointerLeave={() => setHoverDate('')}>
      <text x={left} y="16" fontSize="11" fill="#506249">R$</text>
      {scale.ticks.map(value => <g key={value}>
        <line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke={value === 0 ? '#73836a' : '#d7dfcf'} strokeWidth={value === 0 ? 1.5 : 1} strokeDasharray={value === 0 ? undefined : '4 4'} />
        <text x={left - 10} y={y(value) + 4} textAnchor="end" fontSize="11" fill="#506249">{moneyAxisLabel(value)}</text>
      </g>)}
      {active && <rect x={left + activeIndex * slot} y={top} width={slot} height={bottom - top} fill="#203d31" opacity=".05" />}
      {finance.series.map((row, index) => <g key={row.date}>
        {metrics.slice(0, 2).map((metric, barIndex) => {
          const value = row[metric.key];
          if (value === null) return null;
          const incomplete = metric.key === 'revenueCents' && row.recordedDays < row.periodDays;
          return <rect key={metric.key} x={x(index) + (barIndex - 1) * barWidth} y={y(value)} width={barWidth}
            height={Math.max(0, y(0) - y(value))} fill={metric.color} fillOpacity={incomplete ? .4 : .85}
            stroke={incomplete ? metric.color : undefined} strokeDasharray={incomplete ? '3 2' : undefined}>
            <title>{`${label(row.date)} · ${metric.label}: ${money(value)}${incomplete ? ' (parcial)' : ''}`}</title>
          </rect>;
        })}
      </g>)}
      <path d={profitPath} fill="none" stroke="#4a579b" strokeWidth="2.5" strokeLinejoin="round" />
      {finance.series.map((row, index) => row.profitCents !== null && <circle key={row.date} cx={x(index)} cy={y(row.profitCents)}
        r={activeIndex === index ? 5 : 3} fill={row.recordedDays < row.periodDays ? '#fffefa' : '#4a579b'} stroke="#4a579b" strokeWidth="2">
        <title>{`${label(row.date)} · Lucro / prejuízo: ${money(row.profitCents)}${row.recordedDays < row.periodDays ? ' (parcial)' : ''}`}</title>
      </circle>)}
      {active && <line pointerEvents="none" x1={x(activeIndex)} x2={x(activeIndex)} y1={top} y2={bottom} stroke="#81966a" strokeDasharray="3 4" />}
      {ticks.map(index => <text key={index} x={x(index)} y="246" textAnchor="middle" fontSize="11" fill="#506249">{label(finance.series[index].date, true)}</text>)}
    </svg>
    {partial && <p className={styles.financeCoverage}>Barras claras e pontos vazados indicam períodos com faturamento parcial.</p>}
    <details className={styles.chartValues}><summary>Ver valores exatos da comparação</summary><div><table>
      <thead><tr><th>Período</th>{metrics.map(metric => <th key={metric.key}>{metric.label}</th>)}<th>Dias com faturamento</th></tr></thead>
      <tbody>{finance.series.map(row => <tr key={row.date}><th scope="row">{label(row.date)}</th>
        {metrics.map(metric => <td key={metric.key}>{row[metric.key] === null ? 'Sem registro' : money(row[metric.key]!)}</td>)}
        <td>{row.recordedDays} / {row.periodDays}{row.recordedDays > 0 && row.recordedDays < row.periodDays ? ' · Parcial' : ''}</td>
      </tr>)}</tbody>
    </table></div></details>
  </section>;
}
