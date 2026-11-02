import { db } from '../lib/db';
import type { Queryable } from '../lib/postgres';
export interface IEmpresa { id: string; nome: string; cnpj: string | null; ativo: boolean }
export async function createEmpresa(nome: string, client: Queryable = db): Promise<IEmpresa> {
  const { rows } = await client.query<IEmpresa>('INSERT INTO empresas (nome) VALUES ($1) RETURNING id, nome, cnpj, ativo', [nome]);
  return rows[0];
}
export async function findEmpresa(id: string, client: Queryable = db) {
  return (await client.query<IEmpresa>('SELECT id, nome, cnpj, ativo FROM empresas WHERE id = $1', [id])).rows[0] ?? null;
}
export async function updateEmpresa(id: string, nome: string, cnpj: string | null, client: Queryable) {
  await client.query('UPDATE empresas SET nome=$2,cnpj=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1', [id, nome, cnpj]);
}
export async function deleteEmpresa(id: string, client: Queryable) {
  await client.query('DELETE FROM expense_audit WHERE empresa_id=$1', [id]);
  await client.query('DELETE FROM expenses WHERE empresa_id=$1', [id]);
  // Keep accounts and sessions usable, selecting another accessible restaurant when available.
  await client.query(`UPDATE refresh_tokens s SET empresa_id=(
    SELECT m.empresa_id FROM restaurant_members m JOIN empresas e ON e.id=m.empresa_id
    WHERE m.user_id=s.user_id AND e.ativo=TRUE AND e.id<>$1 ORDER BY m.created_at,m.id LIMIT 1
  ),updated_at=CURRENT_TIMESTAMP WHERE s.empresa_id=$1`, [id]);
  await client.query('DELETE FROM empresas WHERE id=$1', [id]);
}
