import type { ExpenseDashboardData, ProductTotal } from './expense-shared';
import { buildExpenseSeries } from './expense-shared';
import { sumCents } from './financial-math';
export const PRODUCT_COLORS = ['#406a4e', '#c58b64', '#749da0', '#a1ad6c', '#8a82a0', '#ad716d', '#b6a076', '#567b9b'];
export function productSpending(products: ProductTotal[]) {
  const byId = new Map<string, { id: string; name: string; totalCents: number }>();
  for (const item of products) {
    const id = item.productId || item.name;
    const previous = byId.get(id);
    byId.set(id, { id, name: item.name, totalCents: sumCents([previous?.totalCents || 0, item.amountCents]) });
  }
  return [...byId.values()].sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name, 'pt-BR'));
}
export function productTrend(daily: NonNullable<ExpenseDashboardData['productDaily']>, start: string, end: string, selectedId: string) {
  const byDate = new Map<string, number>();
  for (const item of daily) if (!selectedId || item.productId === selectedId) byDate.set(item.date, sumCents([byDate.get(item.date) || 0, item.totalCents]));
  return buildExpenseSeries([...byDate].map(([date, totalCents]) => ({ date, totalCents })), start, end);
}
