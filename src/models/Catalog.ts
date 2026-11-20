import { isDeepStrictEqual } from 'node:util';
import type { PackageContent } from '../lib/expense-shared';
import { db } from '../lib/db';
import type { Queryable } from '../lib/postgres';
import { EXPENSE_CATEGORIES, type CategoryOption } from '../lib/expense-shared';
import { BASIC_PRODUCTS, normalizeCatalogName, type CatalogKind, type ProductOption, type MerchantOption } from '../lib/catalog-shared';
import { InputError } from '../lib/validation';
export async function lockCatalog(empresaId: string, client: Queryable) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`catalog:${empresaId}`]);
}
export async function listCategories(empresaId: string, client: Queryable = db): Promise<CategoryOption[]> {
  const { rows } = await client.query<{ id: string; name: string; key: string | null; archived: boolean }>(`SELECT id,name,category_key AS key,(deleted_at IS NOT NULL) AS archived FROM restaurant_catalog WHERE empresa_id=$1 AND kind='category' ORDER BY name,id`, [empresaId]);
  const colors = ['#567b9b', '#9c6a8f', '#b48245', '#4a8b7b', '#7b79a8', '#9b745d'];
  return [...EXPENSE_CATEGORIES.map(item => {
    const override = rows.find(row => row.key === item.id);
    return override ? { ...item, label: override.name, archived: override.archived } : { ...item };
  }), ...rows.filter(row => !row.key).map(row => ({ id: row.id, label: row.name, archived: row.archived, color: colors[parseInt(row.id.slice(0, 6), 16) % colors.length] }))];
}
export async function listMerchants(empresaId: string, client: Queryable = db) {
  return (await client.query<MerchantOption>("SELECT id,name FROM restaurant_catalog WHERE empresa_id=$1 AND kind='merchant' AND deleted_at IS NULL ORDER BY name,id", [empresaId])).rows;
}
export async function listStorageLocations(empresaId: string, client: Queryable = db) {
  return (await client.query<MerchantOption>("SELECT id,name FROM restaurant_catalog WHERE empresa_id=$1 AND kind='storage' AND deleted_at IS NULL ORDER BY name,id", [empresaId])).rows;
}
export async function insertCatalogEntry(empresaId: string, kind: CatalogKind, name: string, client: Queryable, defaultUnit: ProductOption['defaultUnit'] = 'un', packageContent: PackageContent | null = null) {
  await lockCatalog(empresaId, client);
  const normalized = normalizeCatalogName(name);
  if (kind === 'category') {
    const existing = (await listCategories(empresaId, client)).find(item => normalizeCatalogName(item.label) === normalized || item.id === normalized);
    if (existing) {
      await client.query("UPDATE restaurant_catalog SET deleted_at=NULL WHERE empresa_id=$1 AND kind='category' AND COALESCE(category_key,id::text)=$2", [empresaId, existing.id]);
      return { id: existing.id, name: existing.label };
    }
  }
  const { rows } = await client.query<ProductOption>(`INSERT INTO restaurant_catalog (empresa_id,kind,name,normalized_name,default_unit,package_content) VALUES ($1,$2,$3,$4,$5,$6::jsonb)
    ON CONFLICT (empresa_id,kind,normalized_name) DO UPDATE SET deleted_at=NULL RETURNING id,name,default_unit AS "defaultUnit",package_content AS "packageContent"`, [empresaId, kind, name, normalized,defaultUnit,packageContent ? JSON.stringify(packageContent) : null]);
  return rows[0];
}
export async function changeCatalogEntry(empresaId: string, kind: CatalogKind, id: string, previousName: string, name: string | null, client: Queryable, productDetails?: { defaultUnit: ProductOption['defaultUnit']; packageContent: PackageContent | null; previous?: { defaultUnit: string; packageContent: PackageContent | null } }) {
  await lockCatalog(empresaId, client);
  const categories = kind === 'category' ? await listCategories(empresaId, client) : [];
  const items = kind === 'category' ? categories.filter(item => !item.archived).map(item => ({ id: item.id, name: item.label })) : kind === 'product' ? (await listProducts(empresaId, client)).filter(item => !item.archived) : kind === 'storage' ? await listStorageLocations(empresaId, client) : await listMerchants(empresaId, client);
  const existing = items.find(item => item.id === id);
  if (!existing) throw new InputError('Cadastro não encontrado. Atualize a página.');
  if (existing.name !== previousName) throw new InputError('Este cadastro foi alterado. Atualize a página antes de continuar.');
  if (name !== null && items.some(item => item.id !== id && (normalizeCatalogName(item.name) === normalizeCatalogName(name) || item.id === normalizeCatalogName(name)))) throw new InputError('Já existe um cadastro com esse nome.');
  if (kind === 'product' && productDetails?.previous) {
    const current = existing as ProductOption;
    if (current.defaultUnit !== productDetails.previous.defaultUnit || !isDeepStrictEqual(current.packageContent || null, productDetails.previous.packageContent)) throw new InputError('Este produto foi alterado. Atualize a página antes de continuar.');
  }
  const standard = EXPENSE_CATEGORIES.find(item => item.id === id);
  if (kind === 'category' && standard) {
    await client.query(`INSERT INTO restaurant_catalog (empresa_id,kind,name,normalized_name,category_key) VALUES ($1,'category',$2,$3,$4)
      ON CONFLICT (empresa_id,category_key) DO NOTHING`, [empresaId, existing.name, normalizeCatalogName(existing.name), id]);
  }
  if (name === null) await client.query('UPDATE restaurant_catalog SET deleted_at=CURRENT_TIMESTAMP WHERE empresa_id=$1 AND kind=$2 AND COALESCE(category_key,id::text)=$3', [empresaId, kind, id]);
  else if (kind === 'product' && productDetails) await client.query('UPDATE restaurant_catalog SET name=$4,normalized_name=$5,default_unit=$6,package_content=$7::jsonb WHERE empresa_id=$1 AND kind=$2 AND id::text=$3', [empresaId,kind,id,name,normalizeCatalogName(name),productDetails.defaultUnit,productDetails.packageContent ? JSON.stringify(productDetails.packageContent) : null]);
  else await client.query('UPDATE restaurant_catalog SET name=$4,normalized_name=$5 WHERE empresa_id=$1 AND kind=$2 AND COALESCE(category_key,id::text)=$3', [empresaId, kind, id, name, normalizeCatalogName(name)]);
}

export async function listProducts(empresaId: string, client: Queryable = db): Promise<ProductOption[]> {
  return (await client.query<ProductOption>(`SELECT p.id,p.name,p.default_unit AS "defaultUnit",p.package_content AS "packageContent",(p.deleted_at IS NOT NULL) AS archived,s.unit AS "stockUnit"
    FROM restaurant_catalog p LEFT JOIN inventory_products s ON s.empresa_id=p.empresa_id AND s.product_id=p.id WHERE p.empresa_id=$1 AND p.kind='product' ORDER BY p.normalized_name,p.id`, [empresaId])).rows;
}
export async function seedProducts(empresaId: string, client: Queryable) {
  await client.query(`INSERT INTO restaurant_catalog (empresa_id,kind,name,normalized_name,default_unit)
    SELECT $1,'product',name,normalized,unit FROM jsonb_to_recordset($2::jsonb) AS p(name text,normalized text,unit text)
    ON CONFLICT (empresa_id,kind,normalized_name) DO NOTHING`, [empresaId, JSON.stringify(BASIC_PRODUCTS.map(item => ({ name: item.name, normalized: normalizeCatalogName(item.name), unit: item.defaultUnit })))]);
}
