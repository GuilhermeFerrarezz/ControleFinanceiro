// Work in integer cents so small amounts keep distinct, accurate axis labels.
export function moneyChartScale(values: (number | null)[]) {
  let low = 0, high = 0;
  for (const value of values) {
    if (value === null || !Number.isFinite(value)) continue;
    low = Math.min(low, value); high = Math.max(high, value);
  }
  const rawStep = Math.max(1, (high - low) / 4);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = Math.max(1, [1, 2, 2.5, 5, 10].map(factor => Math.ceil(factor * magnitude))
    .find(candidate => candidate >= rawStep)!);
  const min = Math.floor(low / step) * step;
  const max = Math.max(min + step, Math.ceil(high / step) * step);
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, index) => min + index * step);
  return { min, max, ticks };
}

export function moneyAxisLabel(cents: number) {
  const value = cents / 100;
  // Abbreviate only large values; retain cent precision for small scales.
  return new Intl.NumberFormat('pt-BR', Math.abs(value) >= 10000
    ? { notation: 'compact', maximumFractionDigits: 2 }
    : { maximumFractionDigits: 2 }).format(value);
}
