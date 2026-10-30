import { db } from '../lib/db';
import type { Queryable } from '../lib/postgres';
export interface IInvitation { id: string; empresaId: string; invitedBy: string; email: string; tokenHash: string; expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null }
const columns = 'i.id,i.empresa_id AS "empresaId",i.invited_by AS "invitedBy",i.email,i.token_hash AS "tokenHash",i.expires_at AS "expiresAt",i.accepted_at AS "acceptedAt",i.revoked_at AS "revokedAt"';
export async function findValidInvitation(hash: string, client: Queryable = db, lock = false) {
  return (await client.query<IInvitation & { empresaNome: string }>(`SELECT ${columns},e.nome AS "empresaNome"
    FROM restaurant_invitations i JOIN empresas e ON e.id=i.empresa_id
    WHERE i.token_hash=$1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > CURRENT_TIMESTAMP AND e.ativo=TRUE
    ${lock ? 'FOR UPDATE OF i' : ''}`, [hash])).rows[0] ?? null;
}
export async function acceptInvitation(id: string, client: Queryable) {
  return (await client.query(`UPDATE restaurant_invitations SET accepted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
    WHERE id=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP RETURNING id`, [id])).rowCount === 1;
}
export async function revokePendingInvitations(empresaId: string, email: string, client: Queryable) {
  await client.query(`UPDATE restaurant_invitations SET revoked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
    WHERE empresa_id=$1 AND lower(btrim(email))=$2 AND accepted_at IS NULL AND revoked_at IS NULL`, [empresaId, email]);
}
export async function insertInvitation(empresaId: string, invitedBy: string, email: string, hash: string, expiresAt: Date, client: Queryable) {
  await client.query('INSERT INTO restaurant_invitations (empresa_id,invited_by,email,token_hash,expires_at) VALUES ($1,$2,$3,$4,$5)', [empresaId, invitedBy, email, hash, expiresAt]);
}
export async function listInvitations(empresaId: string) {
  return (await db.query<IInvitation>(`SELECT ${columns} FROM restaurant_invitations i WHERE empresa_id=$1
    AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP ORDER BY created_at DESC,id`, [empresaId])).rows;
}
export async function revokeInvitation(id: string, empresaId: string) {
  return (await db.query(`UPDATE restaurant_invitations SET revoked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
    WHERE id=$1 AND empresa_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id`, [id, empresaId])).rowCount === 1;
}
export async function lockInvitationCreation(empresaId: string, email: string, client: Queryable) {
  // Serialize only invitations for this restaurant and email; unrelated writers stay concurrent.
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`${empresaId}:${email}`]);
}
