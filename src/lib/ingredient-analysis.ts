import { addDays, type ExpenseItem, type IngredientDay } from './expense-shared';
import { safeInteger } from './financial-math';
const THOUSAND = BigInt(1000), SCALE = BigInt(1_000_000_000);
const integerFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
function milli(value: number) { const [whole, fraction = ''] = String(value).split('.'); return BigInt(whole) * THOUSAND + BigInt(fraction.padEnd(3, '0')); }
export function measuredQuantity(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(9, '0').slice(0, 9));
}
export function quantityText(nano: bigint) {
  const fraction = String(nano % SCALE).padStart(9, '0').replace(/0+$/, '');
  return String(nano / SCALE) + (fraction ? '.' + fraction : '');
}
export function normalizeIngredient(item: ExpenseItem) {
  const packed = (item.unit === 'pacote' || item.unit === 'caixa') && item.packageContent;
  const sourceUnit = packed ? packed.unit : item.unit;
  const unit = sourceUnit === 'g' ? 'kg' : sourceUnit === 'ml' ? 'L' : sourceUnit;
  let nano = packed ? milli(item.quantity) * milli(packed.quantity) * THOUSAND : milli(item.quantity) * BigInt(1_000_000);
  if (sourceUnit === 'g' || sourceUnit === 'ml') nano /= THOUSAND;
  return { unit, quantity: quantityText(nano) };
}
// Exact integer cents; round only after dividing the total cost by total quantity.
export function ingredientPrice(cents: number, quantity: string) {
  const divisor = measuredQuantity(quantity);
  if (divisor <= BigInt(0)) return null;
  const numerator = BigInt(cents) * SCALE;
  return String((numerator * BigInt(2) + divisor) / (divisor * BigInt(2)));
}
export function displayQuantity(value: string) {
  const [whole, fraction] = value.split('.');
  const trimmed = fraction?.replace(/0+$/, '');
  return integerFormatter.format(BigInt(whole)) + (trimmed ? ',' + trimmed : '');
}
export function displayPrice(cents: string) {
  const value = BigInt(cents); return 'R$ ' + integerFormatter.format(value / BigInt(100)) + ',' + String(value % BigInt(100)).padStart(2, '0');
}
export function priceChange(current: string, previous: string) {
  const before = BigInt(previous); if (before <= BigInt(0)) return null;
  const difference = BigInt(current) - before, absolute = difference < BigInt(0) ? -difference : difference;
  const tenths = (absolute * BigInt(2000) + before) / (before * BigInt(2));
  return (difference < BigInt(0) ? '-' : '') + String(tenths / BigInt(10)) + (tenths % BigInt(10) ? '.' + String(tenths % BigInt(10)) : '');
}
export function ingredientPriceSeries(daily: IngredientDay[], productId: string, unit: string, start: string, end: string) {
  const duration = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  const interval: 'day' | 'month' | 'year' = duration <= 90 ? 'day' : duration <= 366 * 5 ? 'month' : 'year';
  const key = (date: string) => interval === 'day' ? date : interval === 'month' ? date.slice(0, 7) + '-01' : date.slice(0, 4) + '-01-01';
  const buckets = new Map<string, { cents: bigint; quantity: bigint }>();
  for (const day of daily) if (day.productId === productId && day.unit === unit && day.date >= start && day.date <= end) {
    const previous = buckets.get(key(day.date)) || { cents: BigInt(0), quantity: BigInt(0) };
    buckets.set(key(day.date), { cents: previous.cents + BigInt(day.totalCents), quantity: previous.quantity + measuredQuantity(day.quantity) });
  }
  const series: { date: string; totalCents: number | null }[] = [];
  for (let date = key(start); date <= end;) {
    const bucket = buckets.get(date);
    const price = bucket ? ingredientPrice(safeInteger(bucket.cents), quantityText(bucket.quantity)) : null;
    series.push({ date, totalCents: price !== null && BigInt(price) <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(price) : null });
    if (interval === 'day') date = addDays(date, 1);
    else { const next = new Date(date + 'T12:00:00Z'); if (interval === 'month') next.setUTCMonth(next.getUTCMonth() + 1); else next.setUTCFullYear(next.getUTCFullYear() + 1); date = next.toISOString().slice(0, 10); }
  }
  const positive = series.filter((item): item is {date:string;totalCents:number} => item.totalCents !== null);
  return { series, interval, peak: positive.reduce<{date:string;totalCents:number}|null>((peak, item) => !peak || item.totalCents > peak.totalCents ? item : peak, null) };
}

export function aggregateIngredientItems(items: Iterable<ExpenseItem>) {
  const groups = new Map<string, { name: string; unit: string; quantity: bigint; cents: bigint }>();
  for (const item of items) {
    const normalized = normalizeIngredient(item), key = `${item.productId || item.name}/${normalized.unit}`;
    const previous = groups.get(key) || { name: item.name, unit: normalized.unit, quantity: BigInt(0), cents: BigInt(0) };
    groups.set(key, { ...previous, quantity: previous.quantity + measuredQuantity(normalized.quantity), cents: previous.cents + BigInt(item.amountCents) });
  }
  return [...groups.values()].map(row => ({ name: row.name, unit: row.unit, quantity: quantityText(row.quantity), amountCents: safeInteger(row.cents), priceCents: ingredientPrice(safeInteger(row.cents), quantityText(row.quantity))! })).sort((a, b) => b.amountCents - a.amountCents || a.name.localeCompare(b.name, 'pt-BR') || a.unit.localeCompare(b.unit));
}
export function excelQuantity(quantity: string): number | string {
  const normalized = quantityText(measuredQuantity(quantity));
  return normalized.replace('.', '').replace(/^0+/, '').length > 15 ? normalized.replace('.', ',') : Number(normalized);
}
export function excelPrice(cents: string): number | string {
  return BigInt(cents) > BigInt(999_999_999_999_999) ? displayPrice(cents) : Number(cents) / 100;
}
