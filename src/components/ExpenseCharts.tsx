'use client';
import { useState, type PointerEvent } from 'react';
import { displayDate, trendPeriodLabel, money, type ExpenseDashboardData } from '@/src/lib/expense-shared';
import Icon from './Icon';
import CategoryPie from './CategoryPie';
import styles from './finance.module.css';

export default function ExpenseCharts({ data }: { data: ExpenseDashboardData }) {
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const series=data.series;
  const activeIndex=series.findIndex(day=>day.date===activeDate);
  const active=activeIndex>=0?activeIndex:null;
  const monthly=data.seriesInterval==='month';
  const yearly=data.seriesInterval==='year';
  const periodLabel=(date:string)=>trendPeriodLabel(date,data.seriesInterval);
  const peak=data.peakDay || {date:data.filters.start,totalCents:0};
  const daysWithExpenses=data.daysWithExpenses;
  const max = Math.max(...series.map(day => day.totalCents), 100);
  const left = 62, right = 690, top = 24, bottom = 225;
  const x = (index: number) => series.length === 1 ? (left + right) / 2 : left + index / (series.length - 1) * (right - left);
  const y = (value: number) => bottom - value / max * (bottom - top);
  const line = series.map((day, index) => `${index ? 'L' : 'M'}${x(index)},${y(day.totalCents)}`).join(' ');
  function inspect(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = (event.clientX - bounds.left) / bounds.width * 720;
    const index=Math.max(0, Math.min(series.length - 1, Math.round((point - left) / (right - left) * (series.length - 1))));
    setActiveDate(series[index]?.date ?? null);
  }
  return <div className={styles.charts}>
    <section className={styles.chartCard} aria-labelledby="trend-title"><div className={styles.cardHeading}><div><h2 id="trend-title">O ritmo dos gastos</h2><p>{yearly ? 'Evolução anual no período selecionado' : monthly ? 'Evolução mensal no período selecionado' : 'Evolução diária no período selecionado'}</p></div><span className={styles.chartBadge}><span />Gastos</span></div>
      {data.count === 0 ? <div className={styles.chartEmpty}><Icon name="chart" size={36} /><strong>Seu gráfico começa no primeiro gasto.</strong><p>Os lançamentos deste período aparecerão aqui.</p></div> : <>
        <div className={styles.chartReadout} aria-live="polite">{active !== null ? <><span>{periodLabel(series[active].date)}</span><strong>{money(series[active].totalCents)}</strong></> : <><span>Total do período</span><strong>{money(data.summary.totalCents)}</strong></>}</div>
        <svg className={styles.lineChart} viewBox="0 0 720 270" role="img" aria-label={`Gastos ${yearly ? 'anuais' : monthly ? 'mensais' : 'diários'} de ${displayDate(data.filters.start)} a ${displayDate(data.filters.end)}. Total de ${money(data.summary.totalCents)}. Valores disponíveis na tabela abaixo.`} onPointerMove={inspect} onPointerLeave={() => setActiveDate(null)} onPointerDown={inspect}>
          <defs><linearGradient id="expense-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#829d62" stopOpacity="0.28" /><stop offset="100%" stopColor="#829d62" stopOpacity="0.01" /></linearGradient></defs>
          {[0, .25, .5, .75, 1].map(fraction => <g key={fraction}><line x1={left} x2={right} y1={y(max * fraction)} y2={y(max * fraction)} stroke="#e8ebdf" strokeDasharray="4 4" /><text x={left - 10} y={y(max * fraction) + 4} textAnchor="end" fill="#7d8870" fontSize="11">{new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(max * fraction / 100)}</text></g>)}
          <path d={`${line} L${x(series.length - 1)},${bottom} L${x(0)},${bottom} Z`} fill="url(#expense-area)" /><path d={line} fill="none" stroke="#42694d" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          {series.map((day, index) => (series.length === 1 || day.totalCents > 0) && <circle key={day.date} cx={x(index)} cy={y(day.totalCents)} r={series.length > 60 ? 2 : 4} fill="#42694d" stroke="#fffefa" strokeWidth="2"><title>{`${periodLabel(day.date)}: ${money(day.totalCents)}`}</title></circle>)}
          {Array.from(new Set([0, Math.floor((series.length - 1) / 4), Math.floor((series.length - 1) / 2), Math.floor((series.length - 1) * .75), series.length - 1])).map(index => <text key={index} x={x(index)} y="255" textAnchor="middle" fill="#7d8870" fontSize="12">{trendPeriodLabel(series[index].date,data.seriesInterval,true)}</text>)}
          {active !== null && <g><line x1={x(active)} x2={x(active)} y1={top} y2={bottom} stroke="#81966a" strokeDasharray="3 4" /><circle cx={x(active)} cy={y(series[active].totalCents)} r="6" fill="#42694d" stroke="white" strokeWidth="3" /></g>}
        </svg>
        <div className={styles.chartInsights}><div><span>Dia de maior gasto</span><strong>{money(peak.totalCents)}</strong><small>{displayDate(peak.date)}</small></div><div><span>Dias com lançamentos</span><strong>{daysWithExpenses} <small>de {Math.round((Date.parse(data.filters.end)-Date.parse(data.filters.start))/86400000)+1} dias</small></strong><small>no período selecionado</small></div></div>
        <details className={styles.chartValues}><summary>{yearly ? 'Ver valores por ano' : monthly ? 'Ver valores por mês' : 'Ver valores por dia'}</summary><div><table><caption className={styles.srOnly}>Valores do gráfico</caption><thead><tr><th>Data</th><th>Gastos</th></tr></thead><tbody>{series.map(day => <tr key={day.date}><td>{periodLabel(day.date)}</td><td>{money(day.totalCents)}</td></tr>)}</tbody></table></div></details>
      </>}
    </section>
    <section className={styles.chartCard} aria-labelledby="categories-title"><div className={styles.cardHeading}><div><h2 id="categories-title">Para onde vai o dinheiro</h2><p>Distribuição por categoria</p></div></div>
      {data.count === 0 ? <div className={styles.chartEmpty}><Icon name="leaf" size={36} /><strong>Cada categoria terá seu espaço.</strong><p>Adicione gastos para ver a distribuição.</p></div> : <CategoryPie categories={data.categories} total={data.summary.totalCents} count={data.count} />}
    </section>
  </div>;
}
