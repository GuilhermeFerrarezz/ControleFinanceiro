'use client';

import { useState, type PointerEvent } from 'react';
import { daysBetween, displayDate, trendPeriodLabel, money } from '@/src/lib/expense-shared';
import { chartPeriodIndex } from './chart-pointer';
import Icon from './Icon';
import styles from './finance.module.css';

export default function MoneyTrendChart({
  titleId, title, metric, emptyTitle, peakLabel, daysLabel, series, interval,
  start, end, totalCents, peak, recordedDays, hasRecords, showZeros = false, className,
}: {
  titleId: string; title: string; metric: string; emptyTitle: string; peakLabel: string; daysLabel: string;
  series: { date: string; totalCents: number | null }[]; interval: 'day' | 'month' | 'year';
  start: string; end: string; totalCents: number; peak: { date: string; totalCents: number } | null;
  recordedDays: number; hasRecords: boolean; showZeros?: boolean; className?: string;
}) {
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const activeIndex=series.findIndex(day=>day.date===activeDate);
  const active=activeIndex>=0?activeIndex:null;
  const monthly=interval==='month';
  const yearly=interval==='year';
  const periodLabel=(date:string)=>trendPeriodLabel(date,interval);
  const max = Math.max(...series.map(day => day.totalCents ?? 0), 100);
  const left = 62, right = 690, top = 24, bottom = 225;
  const x = (index: number) => series.length === 1 ? (left + right) / 2 : left + index / (series.length - 1) * (right - left);
  const y = (value: number) => bottom - value / max * (bottom - top);
  const segments: { x: number; y: number }[][] = [];
  let segment: { x: number; y: number }[] = [];
  for (const [index, day] of series.entries()) {
    if (day.totalCents === null) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push({ x: x(index), y: y(day.totalCents) });
  }
  if (segment.length) segments.push(segment);
  function inspect(event: PointerEvent<SVGSVGElement>) {
    const index = chartPeriodIndex(event, left, right, series.length);
    setActiveDate(index === null ? null : series[index].date);
  }
  const activeValue = active === null ? null : series[active].totalCents;
  return (
    <section className={className ?? styles.chartCard} aria-labelledby={titleId}><div className={styles.cardHeading}><div><h2 id={titleId}>{title}</h2><p>{yearly ? 'Evolução anual no período selecionado' : monthly ? 'Evolução mensal no período selecionado' : 'Evolução diária no período selecionado'}</p></div><span className={styles.chartBadge}><span />{metric}</span></div>
      {!hasRecords ? <div className={styles.chartEmpty}><Icon name="chart" size={36} /><strong>{emptyTitle}</strong><p>Os registros deste período aparecerão aqui.</p></div> : <>
        <div className={styles.chartReadout} aria-live="polite">{active !== null ? <><span>{periodLabel(series[active].date)}</span><strong>{activeValue === null ? 'Sem registro' : money(activeValue)}</strong></> : <><span>Total do período</span><strong>{money(totalCents)}</strong></>}</div>
        <svg className={styles.lineChart} viewBox="0 0 720 270" role="img" aria-label={`${metric} de ${displayDate(start)} a ${displayDate(end)}. Total de ${money(totalCents)}. Valores disponíveis na tabela abaixo.`} onPointerMove={inspect} onPointerLeave={event => { if (event.pointerType === 'mouse') setActiveDate(null); }} onPointerDown={inspect}>
          <defs><linearGradient id={titleId + '-area'} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#829d62" stopOpacity="0.28" /><stop offset="100%" stopColor="#829d62" stopOpacity="0.01" /></linearGradient></defs>
          {[0, .25, .5, .75, 1].map(fraction => <g key={fraction}><line x1={left} x2={right} y1={y(max * fraction)} y2={y(max * fraction)} stroke="#e8ebdf" strokeDasharray="4 4" /><text x={left - 10} y={y(max * fraction) + 4} textAnchor="end" fill="#7d8870" fontSize="11">{new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(max * fraction / 100)}</text></g>)}
          {segments.map(points => {
            const line = points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
            return <g key={points[0].x}>
              <path d={`${line} L${points.at(-1)!.x},${bottom} L${points[0].x},${bottom} Z`} fill={`url(#${titleId}-area)`} />
              <path d={line} fill="none" stroke="#42694d" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            </g>;
          })}
          {series.map((day, index) => day.totalCents !== null && (showZeros || series.length === 1 || day.totalCents > 0) &&
            <circle key={day.date} cx={x(index)} cy={y(day.totalCents)} r={series.length > 60 ? 2 : 4} fill="#42694d" stroke="#fffefa" strokeWidth="2"><title>{`${periodLabel(day.date)}: ${money(day.totalCents)}`}</title></circle>)}
          {Array.from(new Set([0, Math.floor((series.length - 1) / 4), Math.floor((series.length - 1) / 2), Math.floor((series.length - 1) * .75), series.length - 1])).map(index => <text key={index} x={x(index)} y="255" textAnchor="middle" fill="#7d8870" fontSize="12">{trendPeriodLabel(series[index].date,interval,true)}</text>)}
          {active !== null && <g><line x1={x(active)} x2={x(active)} y1={top} y2={bottom} stroke="#81966a" strokeDasharray="3 4" />{activeValue !== null && <circle cx={x(active)} cy={y(activeValue)} r="6" fill="#42694d" stroke="white" strokeWidth="3" />}</g>}
        </svg>
        <div className={styles.chartInsights}>
          <div><span>{peakLabel}</span><strong>{peak ? money(peak.totalCents) : '—'}</strong>{peak && <small>{displayDate(peak.date)}</small>}</div>
          <div><span>{daysLabel}</span><strong>{recordedDays} <small>de {daysBetween(start,end)} dias</small></strong><small>no período selecionado</small></div>
        </div>
        <details className={styles.chartValues}><summary>{yearly ? 'Ver valores por ano' : monthly ? 'Ver valores por mês' : 'Ver valores por dia'}</summary><div><table><caption className={styles.srOnly}>Valores do gráfico</caption><thead><tr><th>Data</th><th>{metric}</th></tr></thead><tbody>{series.map(day => <tr key={day.date}><td>{periodLabel(day.date)}</td><td>{day.totalCents === null ? '—' : money(day.totalCents)}</td></tr>)}</tbody></table></div></details>
      </>}
    </section>
  );
}
