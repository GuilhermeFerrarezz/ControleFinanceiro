import { insertCatalogEntry, listProducts, lockCatalog } from '../models/Catalog';
import { normalizeCatalogName, type ProductOption } from './catalog-shared';
import type { ExpenseInput } from './expense-shared';
import type { Queryable } from './postgres';
import { InputError } from './validation';

export async function expenseProductCatalog(empresaId: string, client: Queryable) {
  await lockCatalog(empresaId, client);
  const products = await listProducts(empresaId, client);
  return {
    byId: new Map(products.map(product => [product.id, product])),
    byName: new Map(products.map(product => [normalizeCatalogName(product.name), product])),
  };
}
export async function resolveExpenseProducts(empresaId: string, input: ExpenseInput, client: Queryable, previous?: ExpenseInput, importing = false, cachedCatalog?: Awaited<ReturnType<typeof expenseProductCatalog>>): Promise<ExpenseInput> {
  if (!input.items?.length) return input;
  const catalog = cachedCatalog ?? await expenseProductCatalog(empresaId, client);
  const items = [];
  for (const item of input.items) {
    let product: ProductOption | undefined = item.productId ? catalog.byId.get(item.productId)
      : catalog.byName.get(normalizeCatalogName(item.name));
    // Exported IDs belong to their source restaurant. Import resolves by name locally.
    if (importing && !product) product = catalog.byName.get(normalizeCatalogName(item.name));
    if (!product && importing) {
      const created = await insertCatalogEntry(empresaId, 'product', item.name, client, item.unit, item.packageContent || null);
      product = { ...created, defaultUnit: item.unit, packageContent: item.packageContent || null, archived: false };
      catalog.byId.set(product.id, product);
      catalog.byName.set(normalizeCatalogName(product.name), product);
    }
    const retained = previous?.items?.some(old => old.productId === product?.id);
    if (!product || (product.archived && !retained && !importing)) throw new InputError(`Selecione ou cadastre o produto “${item.name}” antes de salvar.`);
    items.push({ ...item, productId: product.id, name: product.name });
  }
  return { ...input, items };
}
