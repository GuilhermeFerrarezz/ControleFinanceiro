import { InputError } from './validation';

export const MAX_REVENUE_COUNT = 2147483647;

export function revenueCount(value: unknown, label: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_REVENUE_COUNT) {
    throw new InputError(`${label}: informe um número inteiro entre 0 e ${MAX_REVENUE_COUNT}.`);
  }
  return value;
}
