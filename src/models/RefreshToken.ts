import { db } from '../lib/db';
import type { Queryable } from '../lib/postgres';
import type { RestaurantRole } from './Membership';
export interface IRefreshToken { id: string; token: string; userId: string; empresaId: string | null; expiresAt: Date }
export interface ISessionIdentity { id: string; nome: string; email: string; empresaId: string | null; empresaNome: string | null; role: RestaurantRole | null }
export async function createRefreshToken(token: string, userId: string, empresaId: string | null, expiresAt: Date) {
  await db.query('INSERT INTO refresh_tokens (token,user_id,empresa_id,expires_at) VALUES ($1,$2,$3,$4)', [token, userId, empresaId, expiresAt]);
}
export async function removeExpiredSessions() { await db.query('DELETE FROM refresh_tokens WHERE expires_at <= CURRENT_TIMESTAMP'); }
export async function deleteRefreshToken(token: string) { await db.query('DELETE FROM refresh_tokens WHERE token=$1', [token]); }
export async function sessionIdentity(token: string) {
  return (await db.query<ISessionIdentity>(`SELECT u.id,u.nome,u.email,s.empresa_id AS "empresaId",e.nome AS "empresaNome",m.role
    FROM refresh_tokens s JOIN usuarios u ON u.id=s.user_id
    LEFT JOIN empresas e ON e.id=s.empresa_id
    LEFT JOIN restaurant_members m ON m.user_id=u.id AND m.empresa_id=s.empresa_id
    WHERE s.token=$1 AND s.expires_at > CURRENT_TIMESTAMP
      AND (s.empresa_id IS NULL OR (e.ativo=TRUE AND m.id IS NOT NULL))`, [token])).rows[0] ?? null;
}
export async function setSessionEmpresa(token: string, userId: string, empresaId: string, client: Queryable = db) {
  return (await client.query(`UPDATE refresh_tokens SET empresa_id=$1,updated_at=CURRENT_TIMESTAMP
    WHERE token=$2 AND user_id=$3 AND expires_at > CURRENT_TIMESTAMP RETURNING id`, [empresaId, token, userId])).rowCount === 1;
}
