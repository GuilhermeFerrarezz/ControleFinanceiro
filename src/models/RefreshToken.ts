import { db } from '../lib/db';
import type { Queryable } from '../lib/postgres';
import type { RestaurantRole } from './Membership';
import { inTransaction } from '../lib/postgres';
export interface IRefreshToken { id: string; token: string; userId: string; empresaId: string | null; expiresAt: Date }
export interface ISessionIdentity { id: string; nome: string; email: string; emailVerified: boolean; empresaId: string | null; empresaNome: string | null; role: RestaurantRole | null }
export async function createRefreshToken(token: string, userId: string, empresaId: string | null, expiresAt: Date, expectedPasswordHash: string) {
  return inTransaction(async client => {
    // Match restaurant deletion's lock order: restaurant before identity. Do
    // not hold a user lock while waiting for a restaurant being deleted.
    if (empresaId && !(await client.query(`SELECT e.id FROM empresas e JOIN restaurant_members m ON m.empresa_id=e.id WHERE e.id=$1 AND e.ativo AND m.user_id=$2 FOR SHARE OF e,m`, [empresaId,userId])).rowCount) return false;
    // Serialize with password reset: a comparison made before reset cannot
    // create a fresh session after reset has revoked the existing sessions.
    const user = (await client.query<{ senha: string; ativo: boolean }>('SELECT senha,ativo FROM usuarios WHERE id=$1 FOR UPDATE', [userId])).rows[0];
    if (!user?.ativo || user.senha !== expectedPasswordHash) return false;
    await client.query('INSERT INTO refresh_tokens (token,user_id,empresa_id,expires_at) VALUES ($1,$2,$3,$4)', [token, userId, empresaId, expiresAt]);
    return true;
  });
}
export async function removeExpiredSessions() { await db.query('DELETE FROM refresh_tokens WHERE expires_at <= CURRENT_TIMESTAMP'); }
export async function deleteRefreshToken(token: string) { await db.query('DELETE FROM refresh_tokens WHERE token=$1', [token]); }
export async function sessionIdentity(token: string) {
  return (await db.query<ISessionIdentity>(`SELECT u.id,u.nome,u.email,(u.email_verified_at IS NOT NULL) AS "emailVerified",s.empresa_id AS "empresaId",e.nome AS "empresaNome",m.role
    FROM refresh_tokens s JOIN usuarios u ON u.id=s.user_id
    LEFT JOIN empresas e ON e.id=s.empresa_id
    LEFT JOIN restaurant_members m ON m.user_id=u.id AND m.empresa_id=s.empresa_id
    WHERE s.token=$1 AND s.expires_at > CURRENT_TIMESTAMP AND u.ativo=TRUE
      AND (s.empresa_id IS NULL OR (e.ativo=TRUE AND m.id IS NOT NULL))`, [token])).rows[0] ?? null;
}
export async function setSessionEmpresa(token: string, userId: string, empresaId: string, client: Queryable = db) {
  return (await client.query(`UPDATE refresh_tokens SET empresa_id=$1,updated_at=CURRENT_TIMESTAMP
    WHERE token=$2 AND user_id=$3 AND expires_at > CURRENT_TIMESTAMP
    AND EXISTS(SELECT 1 FROM usuarios WHERE id=$3 AND ativo)
    AND EXISTS(SELECT 1 FROM empresas e JOIN restaurant_members m ON m.empresa_id=e.id WHERE e.id=$1 AND e.ativo AND m.user_id=$3) RETURNING id`, [empresaId, token, userId])).rowCount === 1;
}
