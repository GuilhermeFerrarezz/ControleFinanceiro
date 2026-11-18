import { db } from '../lib/db';
import type { Queryable } from '../lib/postgres';
import { requireCapacity } from './Platform';
import { inTransaction } from '../lib/postgres';
import { EMAIL_ACCESS_SQL } from '../lib/email-verification-policy';
export interface IUsuario { id: string; nome: string; email: string; senha: string; papel: string; empresaId: string | null; emailVerifiedAt: Date | null; ativo: boolean; emailAccessAllowed: boolean }
const columns = `id, nome, email, senha, papel, empresa_id AS "empresaId", email_verified_at AS "emailVerifiedAt", ativo,${EMAIL_ACCESS_SQL} AS "emailAccessAllowed"`;
export async function findUsuarioByEmail(email: string, client: Queryable = db) {
  return (await client.query<IUsuario>(`SELECT ${columns} FROM usuarios u WHERE lower(btrim(email)) = $1 AND deleted_at IS NULL`, [email])).rows[0] ?? null;
}
export async function createUsuario(input: { nome: string; email: string; senha: string; papel: string; empresaId?: string }, client: Queryable = db): Promise<IUsuario> {
  if (client === db) return inTransaction(transaction => createUsuario(input, transaction));
  await requireCapacity('users', client);
  return (await client.query<IUsuario>(`INSERT INTO usuarios AS u (nome,email,senha,papel,empresa_id) VALUES ($1,$2,$3,$4,$5) RETURNING ${columns}`,
    [input.nome, input.email, input.senha, input.papel, input.empresaId ?? null])).rows[0];
}
export async function assignFirstEmpresa(userId: string, empresaId: string, client: Queryable) {
  return (await client.query("UPDATE usuarios SET empresa_id=$1, papel='admin', updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND empresa_id IS NULL RETURNING id", [empresaId, userId])).rowCount === 1;
}
