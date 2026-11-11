'use client';
import { useState } from 'react';
import { money, type ExpenseDashboardData, type ProductTotal } from '@/src/lib/expense-shared';
import { formatPercent, ratioPercent, sumCents } from '@/src/lib/financial-math';
import { PRODUCT_COLORS, productSpending, productTrend } from '@/src/lib/product-analysis';
import CategoryPie from './CategoryPie';
import MoneyTrendChart from './MoneyTrendChart';
import styles from './finance.module.css';
export default function ProductCharts({ products, daily, start, end }: { products: ProductTotal[]; daily: NonNullable<ExpenseDashboardData['productDaily']>; start: string; end: string }) {
  const [selectedId, setSelectedId] = useState('');
  const spending = productSpending(products);
  const detailedTotal = sumCents(spending.map(item => item.totalCents));
  const top = spending.slice(0, 7);
  const rest = sumCents(spending.slice(7).map(item => item.totalCents));
  const remaining = { id: 'remaining-products', name: 'Demais produtos', totalCents: rest };
  const slices = [...top, ...(rest ? [remaining] : [])];
  const selected = spending.find(item => item.id === selectedId) || (selectedId === remaining.id && rest ? remaining : undefined);
  const activeId = selected?.id || '';
  const restIds = new Set(spending.slice(7).map(item => item.id));
  const trend = activeId === remaining.id
    ? productTrend(daily.filter(item => restIds.has(item.productId)), start, end, '')
    : productTrend(daily, start, end, activeId);
  const percent = (value: number) => formatPercent(ratioPercent(value, detailedTotal) || '0');
  return <div className={styles.productCharts}>
    <div className={styles.productChartGrid}>
      <MoneyTrendChart className={`${styles.chartCard} ${styles.productTrend}`} key={`${start}/${end}/${activeId}`} titleId="product-trend-title" title={selected ? `Compras de ${selected.name}` : 'Evolução das compras detalhadas'} metric="Gasto com produtos" emptyTitle="Sem produtos neste período" peakLabel="Dia de maior compra" daysLabel="Dias com compras"
        series={trend.series} interval={trend.seriesInterval} start={start} end={end} totalCents={selected?.totalCents || detailedTotal} peak={trend.peakDay} recordedDays={trend.daysWithExpenses} hasRecords={daily.length > 0}>
        <label className={styles.field} htmlFor="product-trend-select">Acompanhar gasto com<select id="product-trend-select" value={activeId} onChange={event => setSelectedId(event.target.value)}><option value="">Todos os produtos detalhados</option>{rest > 0 && <option value={remaining.id}>{remaining.name}</option>}{spending.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <p className={styles.importHint}>Valores pagos ou a pagar conforme os filtros. Este gráfico mostra gastos com compras, e não estoque ou consumo da cozinha.</p>
      </MoneyTrendChart>
      <section className={styles.chartCard} aria-labelledby="product-share-title"><div className={styles.cardHeading}><div><h3 id="product-share-title">O peso de cada produto</h3><p>Participação no valor detalhado · {money(detailedTotal)}</p></div></div>
        <CategoryPie dimension="product" categories={slices.map(item => ({ category: item.id, totalCents: item.totalCents, count: 1 }))} total={detailedTotal} count={spending.length}
          options={slices.map((item, index) => ({ id: item.id, label: item.name, color: PRODUCT_COLORS[index % PRODUCT_COLORS.length] }))}
          selectedKey={slices.some(item => item.id === activeId) ? activeId : null} onSelect={id => setSelectedId(id || '')} />
      </section>
    </div>
    <section className={styles.chartCard} aria-labelledby="product-ranking-title"><div className={styles.cardHeading}><div><h3 id="product-ranking-title">Produtos que mais pesam na conta</h3><p>Os 8 maiores gastos. Toque para ver a evolução das compras.</p></div></div>
        <ol className={styles.productRanking}>{spending.slice(0, 8).map((item, index) => <li key={item.id}><button type="button" aria-pressed={activeId === item.id} onClick={() => setSelectedId(item.id)}><span><b>{index + 1}. {item.name}</b><strong>{money(item.totalCents)}</strong></span><span className={styles.productBar}><i style={{ width: `${item.totalCents / spending[0].totalCents * 100}%`, background: PRODUCT_COLORS[index] }} /></span><small>{percent(item.totalCents)}% do valor detalhado</small></button></li>)}</ol>
    </section>
  </div>;
}
