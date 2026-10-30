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
