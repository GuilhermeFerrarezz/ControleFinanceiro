const ZERO = BigInt(0), TWO = BigInt(2), TEN = BigInt(10), HUNDRED = BigInt(100);
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

export function safeInteger(value: unknown): number {
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value)) return value;
  } else if (typeof value === 'bigint' || (typeof value === 'string' && /^-?\d+$/.test(value))) {
    const integer = BigInt(value);
    if (integer >= -MAX_SAFE && integer <= MAX_SAFE) return Number(integer);
  }
  throw new RangeError('Valor financeiro fora do intervalo exato de centavos. Reduza o período consultado.');
}

export function sumCents(values: Iterable<number>): number {
  let total = ZERO;
  for (const value of values) total += BigInt(safeInteger(value));
  return safeInteger(total);
}

export function subtractCents(value: number, cost: number): number {
  return safeInteger(BigInt(safeInteger(value)) - BigInt(safeInteger(cost)));
}

// Round once, at the final display precision; ties go away from zero.
function roundedDivide(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= ZERO) throw new RangeError('O divisor deve ser positivo.');
  const absolute = numerator < ZERO ? -numerator : numerator;
  const rounded = (absolute * TWO + denominator) / (denominator * TWO);
  return numerator < ZERO ? -rounded : rounded;
}

export function averageCents(total: number, days: number): number {
  return safeInteger(roundedDivide(BigInt(safeInteger(total)), BigInt(safeInteger(days))));
}

export function ratioPercent(numerator: number, denominator: number): string | null {
  safeInteger(numerator); safeInteger(denominator);
  if (denominator <= 0) return null;
  const tenths = roundedDivide(BigInt(numerator) * BigInt(1000), BigInt(denominator));
  const absolute = tenths < ZERO ? -tenths : tenths;
  const fraction = absolute % TEN;
  return `${tenths < ZERO ? '-' : ''}${absolute / TEN}${fraction ? `.${fraction}` : ''}`;
}

export function changePercent(current: number, previous: number): string | null {
  return ratioPercent(subtractCents(current, previous), previous);
}

const integerFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
export function formatPercent(value: string): string {
  const [whole, fraction] = value.replace('-', '').split('.');
  return (value.startsWith('-') ? '-' : '') + integerFormatter.format(BigInt(whole)) + (fraction ? `,${fraction}` : '');
}

export function decimalCents(cents: number, separator = ','): string {
  const value = BigInt(safeInteger(cents));
  const absolute = value < ZERO ? -value : value;
  return `${value < ZERO ? '-' : ''}${absolute / HUNDRED}${separator}${String(absolute % HUNDRED).padStart(2, '0')}`;
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function formatMoney(cents: number): string {
  const decimal = decimalCents(cents, '.');
  const [whole, fraction] = decimal.replace('-', '').split('.');
  return currencyFormatter.formatToParts(cents < 0 ? -1 : 1).map(part => {
    if (part.type === 'integer') return integerFormatter.format(BigInt(whole));
    if (part.type === 'fraction') return fraction;
    return part.value;
  }).join('');
}

// Excel preserves only 15 significant decimal digits. Larger totals are text,
// keeping all cents instead of silently rounding a numeric cell.
export function excelMoney(cents: number | null): number | string | null {
  if (cents === null) return null;
  safeInteger(cents);
  return Math.abs(cents) > 999_999_999_999_999 ? decimalCents(cents) : cents / 100;
}
