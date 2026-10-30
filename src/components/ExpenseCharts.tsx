'use client';
import { useState, type PointerEvent } from 'react';
import { displayDate, EXPENSE_CATEGORIES, money, type ExpenseDashboardData } from '@/src/lib/expense-shared';
import Icon from './Icon';
import styles from './finance.module.css';

export default function ExpenseCharts({ data }: { data: ExpenseDashboardData }) {
  const [active, setActive] = useState<number | null>(null);
  const series = data.series;
  const peak = series.reduce((highest, day) => day.totalCents > highest.totalCents ? day : highest, series[0]);
  const daysWithExpenses = series.filter(day => day.totalCents > 0).length;
  const max = Math.max(...series.map(day => day.totalCents), 100);
  const left = 62, right = 690, top = 24, bottom = 225;
  const x = (index: number) => series.length === 1 ? (left + right) / 2 : left + index / (series.length - 1) * (right - left);
  const y = (value: number) => bottom - value / max * (bottom - top);
  const line = series.map((day, index) => `${index ? 'L' : 'M'}${x(index)},${y(day.totalCents)}`).join(' ');
  function inspect(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = (event.clientX - bounds.left) / bounds.width * 720;
    setActive(Math.max(0, Math.min(series.length - 1, Math.round((point - left) / (right - left) * (series.length - 1)))));
  }
  const gradient = data.categories.map((item, index) => {
    const start = data.categories.slice(0, index).reduce((sum, category) => sum + category.totalCents, 0) / (data.summary.totalCents || 1) * 100;
    const end = start + item.totalCents / (data.summary.totalCents || 1) * 100;
    const color = EXPENSE_CATEGORIES.find(category => category.id === item.category)?.color || '#939889';
    return `${color} ${start}% ${end}%`;
  }).join(', ');
  return <div className={styles.charts}>
    <section className={styles.chartCard} aria-labelledby="trend-title"><div className={styles.cardHeading}><div><h2 id="trend-title">O ritmo dos gastos</h2><p>Evolução diária no período selecionado</p></div><span className={styles.chartBadge}><span />Gastos</span></div>
      {data.count === 0 ? <div className={styles.chartEmpty}><Icon name="chart" size={36} /><strong>Seu gráfico começa no primeiro gasto.</strong><p>Os lançamentos deste período aparecerão aqui.</p></div> : <>
        <div className={styles.chartReadout} aria-live="polite">{active !== null ? <><span>{displayDate(series[active].date)}</span><strong>{money(series[active].totalCents)}</strong></> : <><span>Total do período</span><strong>{money(data.summary.totalCents)}</strong></>}</div>
        <svg className={styles.lineChart} viewBox="0 0 720 270" role="img" aria-label={`Gastos diários de ${displayDate(data.filters.start)} a ${displayDate(data.filters.end)}. Total de ${money(data.summary.totalCents)}. Valores disponíveis na tabela abaixo.`} onPointerMove={inspect} onPointerLeave={() => setActive(null)} onPointerDown={inspect}>
          <defs><linearGradient id="expense-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#829d62" stopOpacity="0.28" /><stop offset="100%" stopColor="#829d62" stopOpacity="0.01" /></linearGradient></defs>
          {[0, .25, .5, .75, 1].map(fraction => <g key={fraction}><line x1={left} x2={right} y1={y(max * fraction)} y2={y(max * fraction)} stroke="#e8ebdf" strokeDasharray="4 4" /><text x={left - 10} y={y(max * fraction) + 4} textAnchor="end" fill="#7d8870" fontSize="11">{new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(max * fraction / 100)}</text></g>)}
          <path d={`${line} L${x(series.length - 1)},${bottom} L${x(0)},${bottom} Z`} fill="url(#expense-area)" /><path d={line} fill="none" stroke="#42694d" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          {series.map((day, index) => (series.length === 1 || day.totalCents > 0) && <circle key={day.date} cx={x(index)} cy={y(day.totalCents)} r={series.length > 60 ? 2 : 4} fill="#42694d" stroke="#fffefa" strokeWidth="2"><title>{`${displayDate(day.date)}: ${money(day.totalCents)}`}</title></circle>)}
          {Array.from(new Set([0, Math.floor((series.length - 1) / 4), Math.floor((series.length - 1) / 2), Math.floor((series.length - 1) * .75), series.length - 1])).map(index => <text key={index} x={x(index)} y="255" textAnchor="middle" fill="#7d8870" fontSize="12">{displayDate(series[index].date).slice(0, 5)}</text>)}
          {active !== null && <g><line x1={x(active)} x2={x(active)} y1={top} y2={bottom} stroke="#81966a" strokeDasharray="3 4" /><circle cx={x(active)} cy={y(series[active].totalCents)} r="6" fill="#42694d" stroke="white" strokeWidth="3" /></g>}
        </svg>
        <div className={styles.chartInsights}><div><span>Dia de maior gasto</span><strong>{money(peak.totalCents)}</strong><small>{displayDate(peak.date)}</small></div><div><span>Dias com lançamentos</span><strong>{daysWithExpenses} <small>de {series.length} dias</small></strong><small>no período selecionado</small></div></div>
        <details className={styles.chartValues}><summary>Ver valores por dia</summary><div><table><caption className={styles.srOnly}>Valores diários do gráfico</caption><thead><tr><th>Data</th><th>Gastos</th></tr></thead><tbody>{series.map(day => <tr key={day.date}><td>{displayDate(day.date)}</td><td>{money(day.totalCents)}</td></tr>)}</tbody></table></div></details>
      </>}
    </section>
    <section className={styles.chartCard} aria-labelledby="categories-title"><div className={styles.cardHeading}><div><h2 id="categories-title">Para onde vai o dinheiro</h2><p>Distribuição por categoria</p></div></div>
      {data.count === 0 ? <div className={styles.chartEmpty}><Icon name="leaf" size={36} /><strong>Cada categoria terá seu espaço.</strong><p>Adicione gastos para ver a distribuição.</p></div> : <><div className={styles.donut} style={{ background: `conic-gradient(${gradient})` }} role="img" aria-label="Distribuição dos gastos por categoria, detalhada na lista abaixo"><div><span>{data.categories.length} {data.categories.length === 1 ? 'categoria' : 'categorias'}</span><strong>{data.count}</strong><span>lançamentos</span></div></div><ul className={styles.categoryLegend}>{data.categories.map(item => {
        const category = EXPENSE_CATEGORIES.find(category => category.id === item.category)!;
        return <li key={item.category}><span className={styles.legendDot} style={{ background: category.color }} /><span>{category.label}<small>{Math.round(item.totalCents / data.summary.totalCents * 1000) / 10}% do total</small></span><strong>{money(item.totalCents)}</strong></li>;
      })}</ul></>}
    </section>
  </div>;
}
