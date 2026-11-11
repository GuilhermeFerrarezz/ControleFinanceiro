import { ITEM_UNITS, MAX_AMOUNT_CENTS, type ExpenseItem } from './expense-shared';
import { sumCents } from './financial-math';
import { InputError } from './validation';

export const MAX_EXPENSE_ITEMS = 50;
export function parseQuantity(value: string): number | null {
  if (!/^\d+(?:[,.]\d{1,3})?$/.test(value.trim())) return null;
  const quantity = Number(value.trim().replace(',', '.'));
  return quantity > 0 && quantity <= 1_000_000 ? quantity : null;
}
export function validateExpenseItems(value: unknown, totalCents: number): ExpenseItem[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_EXPENSE_ITEMS) throw new InputError('Informe até 50 produtos por compra.');
  const items = value.map((item: unknown, index) => {
    const fail = () => new InputError(`Produto ${index + 1}: informe nome, quantidade positiva (até 3 casas decimais), unidade e valor total do item.`);
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw fail();
    const row = item as Record<string, unknown>;
    if (typeof row.name !== 'string' || !row.name.trim() || row.name.trim().length > 120 || row.name.includes('\0') ||
      typeof row.quantity !== 'number' || parseQuantity(String(row.quantity)) === null ||
      !ITEM_UNITS.includes(row.unit as ExpenseItem['unit']) || !Number.isSafeInteger(row.amountCents) ||
      Number(row.amountCents) <= 0 || Number(row.amountCents) > MAX_AMOUNT_CENTS) throw fail();
    if (row.productId !== undefined && (typeof row.productId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.productId))) throw fail();
    return { ...(row.productId ? { productId: String(row.productId).toLowerCase() } : {}), name: row.name.trim().replace(/\s+/g, ' '), quantity: row.quantity, unit: row.unit as ExpenseItem['unit'], amountCents: Number(row.amountCents) };
  });
  if (sumCents(items.map(item => item.amountCents)) > totalCents) throw new InputError('A soma dos produtos não pode ultrapassar o valor total da compra.');
  return items;
}
