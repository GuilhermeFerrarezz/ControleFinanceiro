import type { ExpenseItem } from './expense-shared';
import { normalizeIngredient } from './ingredient-analysis';
import { InputError } from './validation';

export const STOCK_UNITS = ['kg', 'L', 'un', 'pacote', 'caixa'] as const;
export type StockUnit = typeof STOCK_UNITS[number];
export function stockUnit(item: Pick<ExpenseItem, 'unit' | 'packageContent'>): StockUnit {
  return normalizeIngredient({ ...item, name: '', quantity: 1, amountCents: 1 }).unit as StockUnit;
}
export function stockQuantity(value: unknown, zero = true): string {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!/^\d{1,7}(?:\.\d{1,9})?$/.test(text) || Number(text) > 1_000_000 || Number(text) < (zero ? 0 : 0.000000001)) throw new InputError('Informe uma quantidade entre 0 e 1.000.000, com até 9 casas decimais.');
  return text;
}
export type InventoryProduct = {
  id: string; name: string; unit: StockUnit; minimum: string; location: string;
  suppliers: string[]; balance: string; averageCents: string | null; valueCents: string | null;
  purchaseQuantity: string; lastPurchase: string | null; archived: boolean;
  purchasedFrom: { name: string; quantity: string; amountCents: string }[];
};
export type InventoryMovement = {
  id: string; productId: string; productName: string; unit: StockUnit; quantity: string;
  date: string; reason: string; author: string; source: string; expenseId: string | null;
};
export type InventoryData = { products: InventoryProduct[]; movements: InventoryMovement[]; page: number; hasNext: boolean };
