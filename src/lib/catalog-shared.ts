export function normalizeCatalogName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}
export type MerchantOption = { id: string; name: string };

export type CatalogKind = 'category' | 'merchant' | 'product';
export type ProductOption = MerchantOption & { defaultUnit: import('./expense-shared').ExpenseItem['unit']; archived?: boolean };
export const BASIC_PRODUCTS: readonly { name: string; defaultUnit: ProductOption['defaultUnit'] }[] = [
  { name: 'Arroz', defaultUnit: 'kg' },
  { name: 'Feijão', defaultUnit: 'kg' },
  { name: 'Carne bovina', defaultUnit: 'kg' },
  { name: 'Carne suína', defaultUnit: 'kg' },
  { name: 'Frango', defaultUnit: 'kg' },
  { name: 'Peixe', defaultUnit: 'kg' },
  { name: 'Batata', defaultUnit: 'kg' },
  { name: 'Batata frita congelada', defaultUnit: 'kg' },
  { name: 'Tomate', defaultUnit: 'kg' },
  { name: 'Cebola', defaultUnit: 'kg' },
  { name: 'Alho', defaultUnit: 'kg' },
  { name: 'Alface', defaultUnit: 'un' },
  { name: 'Cenoura', defaultUnit: 'kg' },
  { name: 'Óleo de soja', defaultUnit: 'L' },
  { name: 'Azeite', defaultUnit: 'L' },
  { name: 'Sal', defaultUnit: 'kg' },
  { name: 'Açúcar', defaultUnit: 'kg' },
  { name: 'Farinha de trigo', defaultUnit: 'kg' },
  { name: 'Macarrão', defaultUnit: 'pacote' },
  { name: 'Molho de tomate', defaultUnit: 'pacote' },
  { name: 'Leite', defaultUnit: 'L' },
  { name: 'Queijo', defaultUnit: 'kg' },
  { name: 'Ovos', defaultUnit: 'un' },
  { name: 'Café', defaultUnit: 'kg' },
  { name: 'Detergente', defaultUnit: 'L' },
  { name: 'Água sanitária', defaultUnit: 'L' },
  { name: 'Embalagem para marmita', defaultUnit: 'un' },
];
