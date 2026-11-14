import { buildExpenseSeries, type DailyRevenue } from './expense-shared';

export const REVENUE_METRICS = [
  { key: 'orderCount', title: 'Evolução dos pedidos', label: 'Pedidos feitos' },
  { key: 'deliveryMeals', title: 'Evolução dos marmitex delivery', label: 'Marmitex delivery' },
  { key: 'dineInMeals', title: 'Evolução das refeições no restaurante', label: 'Refeições no restaurante' },
] as const;

export function revenueCountSeries(rows: DailyRevenue[], key: typeof REVENUE_METRICS[number]['key'], start: string, end: string) {
  const recorded = rows.filter(row => row.date >= start && row.date <= end && row[key] != null)
    .map(row => ({ date: row.date, totalCents: row[key]! }));
  const trend = buildExpenseSeries(recorded, start, end);
  const coverage = buildExpenseSeries(recorded.map(row => ({ ...row, totalCents: 1 })), start, end);
  return {
    series: trend.series.map((row, index) => ({ ...row, totalCents: coverage.series[index].totalCents ? row.totalCents : null })),
    interval: trend.seriesInterval,
    total: recorded.reduce((total, row) => total + row.totalCents, 0),
    recordedDays: recorded.length,
    peak: recorded.reduce<{ date: string; totalCents: number } | null>((best, row) => !best || row.totalCents > best.totalCents ? row : best, null),
  };
}
