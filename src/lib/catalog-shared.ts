export function normalizeCatalogName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}
export type MerchantOption = { id: string; name: string };

export type CatalogKind = 'category' | 'merchant' | 'product' | 'storage';
export type ProductOption = MerchantOption & { stockUnit?: import('./inventory-shared').StockUnit | null; packageContent?: import('./expense-shared').PackageContent | null; defaultUnit: import('./expense-shared').ExpenseItem['unit']; archived?: boolean };
export const BASIC_PRODUCTS: readonly { name: string; defaultUnit: ProductOption['defaultUnit'] }[] = [
  { name: 'Açúcar', defaultUnit: 'kg' },
  { name: 'Água sanitária', defaultUnit: 'L' },
  { name: 'Alcatra', defaultUnit: 'kg' },
  { name: 'Alho', defaultUnit: 'kg' },
  { name: 'Arroz', defaultUnit: 'kg' },
  { name: 'Azeite', defaultUnit: 'L' },
  { name: 'Batata', defaultUnit: 'kg' },
  { name: 'Batata frita congelada', defaultUnit: 'kg' },
  { name: 'Café', defaultUnit: 'kg' },
  { name: 'Cebola', defaultUnit: 'kg' },
  { name: 'Contra-Filé', defaultUnit: 'kg' },
  { name: 'Farinha de Trigo', defaultUnit: 'kg' },
  { name: 'Feijão', defaultUnit: 'kg' },
  { name: 'Filé Mignon', defaultUnit: 'kg' },
  { name: 'Leite', defaultUnit: 'L' },
  { name: 'Linguiça', defaultUnit: 'kg' },
  { name: 'Molho de tomate', defaultUnit: 'pacote' },
  { name: 'Óleo de soja', defaultUnit: 'L' },
  { name: 'Ovos', defaultUnit: 'un' },
  { name: 'Pernil', defaultUnit: 'kg' },
  { name: 'Sal', defaultUnit: 'kg' },
  { name: 'Tilápia', defaultUnit: 'kg' },
];
