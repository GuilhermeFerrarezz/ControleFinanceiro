import { db } from '../lib/db';
import type { Queryable } from '../lib/postgres';
import { EXPENSE_CATEGORIES, type CategoryOption } from '../lib/expense-shared';
import { normalizeCatalogName, type MerchantOption } from '../lib/catalog-shared';
export async function listCategories(empresaId: string, client: Queryable = db): Promise<CategoryOption[]> {
  const { rows } = await client.query<{ id: string; name: string }>("SELECT id,name FROM restaurant_catalog WHERE empresa_id=$1 AND kind='category' ORDER BY name,id", [empresaId]);
  const colors = ['#567b9b', '#9c6a8f', '#b48245', '#4a8b7b', '#7b79a8', '#9b745d'];
  return [...EXPENSE_CATEGORIES, ...rows.map(row => ({ id: row.id, label: row.name, color: colors[parseInt(row.id.slice(0, 6), 16) % colors.length] }))];
}
export async function listMerchants(empresaId: string, client: Queryable = db) {
  return (await client.query<MerchantOption>("SELECT id,name FROM restaurant_catalog WHERE empresa_id=$1 AND kind='merchant' ORDER BY name,id", [empresaId])).rows;
}
export async function insertCatalogEntry(empresaId: string, kind: 'category' | 'merchant', name: string, client: Queryable) {
  const normalized = normalizeCatalogName(name);
  if (kind === 'category') {
    const standard = EXPENSE_CATEGORIES.find(item => normalizeCatalogName(item.label) === normalized || item.id === normalized);
    if (standard) return { id: standard.id, name: standard.label };
  }
  const { rows } = await client.query<MerchantOption>(`INSERT INTO restaurant_catalog (empresa_id,kind,name,normalized_name) VALUES ($1,$2,$3,$4)
    ON CONFLICT (empresa_id,kind,normalized_name) DO UPDATE SET normalized_name=EXCLUDED.normalized_name RETURNING id,name`, [empresaId, kind, name, normalized]);
  return rows[0];
}
