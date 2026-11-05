import { db } from '../lib/db';
import type { Queryable } from '../lib/postgres';
import { EXPENSE_CATEGORIES, type CategoryOption } from '../lib/expense-shared';
import { normalizeCatalogName, type MerchantOption } from '../lib/catalog-shared';
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
export async function insertCatalogEntry(empresaId: string, kind: 'category' | 'merchant', name: string, client: Queryable) {
  await lockCatalog(empresaId, client);
  const normalized = normalizeCatalogName(name);
  if (kind === 'category') {
    const existing = (await listCategories(empresaId, client)).find(item => normalizeCatalogName(item.label) === normalized || item.id === normalized);
    if (existing) {
      await client.query("UPDATE restaurant_catalog SET deleted_at=NULL WHERE empresa_id=$1 AND kind='category' AND COALESCE(category_key,id::text)=$2", [empresaId, existing.id]);
      return { id: existing.id, name: existing.label };
    }
  }
  const { rows } = await client.query<MerchantOption>(`INSERT INTO restaurant_catalog (empresa_id,kind,name,normalized_name) VALUES ($1,$2,$3,$4)
    ON CONFLICT (empresa_id,kind,normalized_name) DO UPDATE SET deleted_at=NULL RETURNING id,name`, [empresaId, kind, name, normalized]);
  return rows[0];
}
export async function changeCatalogEntry(empresaId: string, kind: 'category' | 'merchant', id: string, previousName: string, name: string | null, client: Queryable) {
  await lockCatalog(empresaId, client);
  const categories = kind === 'category' ? await listCategories(empresaId, client) : [];
  const items = kind === 'category' ? categories.filter(item => !item.archived).map(item => ({ id: item.id, name: item.label })) : await listMerchants(empresaId, client);
  const existing = items.find(item => item.id === id);
  if (!existing) throw new InputError('Cadastro não encontrado. Atualize a página.');
  if (existing.name !== previousName) throw new InputError('Este cadastro foi alterado. Atualize a página antes de continuar.');
  if (name !== null && items.some(item => item.id !== id && (normalizeCatalogName(item.name) === normalizeCatalogName(name) || item.id === normalizeCatalogName(name)))) throw new InputError('Já existe um cadastro com esse nome.');
  const standard = EXPENSE_CATEGORIES.find(item => item.id === id);
  if (kind === 'category' && standard) {
    await client.query(`INSERT INTO restaurant_catalog (empresa_id,kind,name,normalized_name,category_key) VALUES ($1,'category',$2,$3,$4)
      ON CONFLICT (empresa_id,category_key) DO NOTHING`, [empresaId, existing.name, normalizeCatalogName(existing.name), id]);
  }
  if (name === null) await client.query('UPDATE restaurant_catalog SET deleted_at=CURRENT_TIMESTAMP WHERE empresa_id=$1 AND kind=$2 AND COALESCE(category_key,id::text)=$3', [empresaId, kind, id]);
  else await client.query('UPDATE restaurant_catalog SET name=$4,normalized_name=$5 WHERE empresa_id=$1 AND kind=$2 AND COALESCE(category_key,id::text)=$3', [empresaId, kind, id, name, normalizeCatalogName(name)]);
}
