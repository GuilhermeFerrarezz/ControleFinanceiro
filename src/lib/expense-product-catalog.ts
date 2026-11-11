import { insertCatalogEntry, listProducts, lockCatalog } from '../models/Catalog';
import { normalizeCatalogName } from './catalog-shared';
import type { ExpenseInput } from './expense-shared';
import type { Queryable } from './postgres';
import { InputError } from './validation';

export async function resolveExpenseProducts(empresaId: string, input: ExpenseInput, client: Queryable, previous?: ExpenseInput, importing = false): Promise<ExpenseInput> {
  if (!input.items?.length) return input;
  await lockCatalog(empresaId, client);
  const products = await listProducts(empresaId, client);
  const items = [];
  for (const item of input.items) {
    let product = item.productId ? products.find(product => product.id === item.productId)
      : products.find(product => normalizeCatalogName(product.name) === normalizeCatalogName(item.name));
    // Exported IDs belong to their source restaurant. Import resolves by name locally.
    if (importing && !product) product = products.find(product => normalizeCatalogName(product.name) === normalizeCatalogName(item.name));
    if (!product && importing) {
      const created = await insertCatalogEntry(empresaId, 'product', item.name, client, item.unit);
      product = { ...created, defaultUnit: item.unit, archived: false }; products.push(product);
    }
    const retained = previous?.items?.some(old => old.productId === product?.id);
    if (!product || (product.archived && !retained && !importing)) throw new InputError(`Selecione ou cadastre o produto “${item.name}” antes de salvar.`);
    items.push({ ...item, productId: product.id, name: product.name });
  }
  return { ...input, items };
}
