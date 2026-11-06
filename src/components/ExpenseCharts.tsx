'use client';
import type { ExpenseDashboardData } from '@/src/lib/expense-shared';
import Icon from './Icon';
import CategoryPie from './CategoryPie';
import MoneyTrendChart from './MoneyTrendChart';
import styles from './finance.module.css';

export default function ExpenseCharts({ data }: { data: ExpenseDashboardData }) {
  return <div className={styles.charts}>
    <MoneyTrendChart titleId="trend-title" title="O ritmo dos gastos" metric="Gastos"
      emptyTitle="Seu gráfico começa no primeiro gasto." peakLabel="Dia de maior gasto" daysLabel="Dias com lançamentos"
      series={data.series} interval={data.seriesInterval} start={data.filters.start} end={data.filters.end}
      totalCents={data.summary.totalCents} peak={data.peakDay} recordedDays={data.daysWithExpenses} hasRecords={data.count > 0} />
    <section className={styles.chartCard} aria-labelledby="categories-title"><div className={styles.cardHeading}><div><h2 id="categories-title">Para onde vai o dinheiro</h2><p>Distribuição por categoria</p></div></div>
      {data.count === 0 ? <div className={styles.chartEmpty}><Icon name="leaf" size={36} /><strong>Cada categoria terá seu espaço.</strong><p>Adicione gastos para ver a distribuição.</p></div> : <CategoryPie categories={data.categories} total={data.summary.totalCents} count={data.count} options={data.categoryOptions} />}
    </section>
  </div>;
}
