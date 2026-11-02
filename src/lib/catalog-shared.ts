export function normalizeCatalogName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}
export type MerchantOption = { id: string; name: string };
