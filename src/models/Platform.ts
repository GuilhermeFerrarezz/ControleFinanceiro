import { db } from '../lib/db';
import type { Queryable } from '../lib/postgres';
import { InputError } from '../lib/validation';
import { randomBytes } from 'node:crypto';
import type { PlatformOverview, PlatformSettings, PlatformRestaurantMembers } from '../lib/platform-shared';
import { inTransaction } from '../lib/postgres';

// Caller must authorize the platform administrator before entering this repository.
export async function platformRestaurantMembers(id: string, page: number): Promise<PlatformRestaurantMembers | null> {
  return inTransaction(async client => {
    const restaurant = (await client.query<PlatformRestaurantMembers['restaurant']>(
      'SELECT id,nome,ativo FROM empresas WHERE id=$1', [id])).rows[0];
    if (!restaurant) return null;
    const { rows } = await client.query<PlatformRestaurantMembers['members'][number]>(
      `SELECT m.id,u.nome,u.email,m.role,u.ativo,(u.email_verified_at IS NOT NULL) AS "emailVerified"
       FROM restaurant_members m JOIN usuarios u ON u.id=m.user_id
       WHERE m.empresa_id=$1 AND u.deleted_at IS NULL
       ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END,lower(u.nome),m.id LIMIT 31 OFFSET $2`,
      [id, (page - 1) * 30]);
    return { restaurant, members: rows.slice(0, 30), page, hasNext: rows.length > 30 };
  }, true);
}

export class CapacityError extends InputError {}
export async function platformSettings(client: Queryable = db, lock = false) {
  return (await client.query<PlatformSettings>(`SELECT max_restaurants AS "maxRestaurants",max_users AS "maxUsers" FROM platform_settings WHERE id=1 ${lock ? 'FOR UPDATE' : ''}`)).rows[0];
}
// Hold the settings lock until the enclosing creation transaction commits.
export async function requireCapacity(kind: 'restaurants' | 'users', client: Queryable) {
  const settings = await platformSettings(client, true);
  const countQuery = kind === 'restaurants'
    ? 'SELECT count(*) AS count FROM empresas'
    : 'SELECT count(*) AS count FROM usuarios WHERE deleted_at IS NULL';
  const count = Number((await client.query<{ count: string }>(countQuery)).rows[0].count);
  const max = kind === 'restaurants' ? settings.maxRestaurants : settings.maxUsers;
  if (count >= max) throw new CapacityError(kind === 'restaurants' ? 'O limite de restaurantes foi atingido. Contate o administrador da plataforma.' : 'O limite de usuários foi atingido. Contate o administrador da plataforma.');
}
export async function platformAudit(actorId: string, action: string, targetId: string | null, before: unknown, after: unknown, client: Queryable) {
  await client.query('INSERT INTO platform_audit(actor_id,action,target_id,before,after) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)', [actorId,action,targetId,JSON.stringify(before),JSON.stringify(after)]);
}
export async function platformOverview(query: string, page: number): Promise<PlatformOverview> {
  const term = `%${query}%`;
  const offset = (page - 1) * 30;
  const [settings, totals, restaurants, users, audit] = await Promise.all([
    platformSettings(),
    db.query<{ restaurants: number; users: number; activeRestaurants: number; activeUsers: number }>(`SELECT (SELECT count(*)::int FROM empresas) AS restaurants,(SELECT count(*)::int FROM usuarios WHERE deleted_at IS NULL) AS users,(SELECT count(*)::int FROM empresas WHERE ativo) AS "activeRestaurants",(SELECT count(*)::int FROM usuarios WHERE ativo AND deleted_at IS NULL) AS "activeUsers"`),
    db.query<{ id: string; nome: string; ativo: boolean; owners: string; members: number }>(`SELECT e.id,e.nome,e.ativo,coalesce((SELECT string_agg(u.email,', ' ORDER BY u.email) FROM restaurant_members m JOIN usuarios u ON u.id=m.user_id WHERE m.empresa_id=e.id AND m.role='owner'),'') AS owners,(SELECT count(*)::int FROM restaurant_members m WHERE m.empresa_id=e.id) AS members FROM empresas e WHERE e.nome ILIKE $1 OR EXISTS(SELECT 1 FROM restaurant_members m JOIN usuarios u ON u.id=m.user_id WHERE m.empresa_id=e.id AND m.role='owner' AND u.email ILIKE $1) ORDER BY e.created_at,e.id LIMIT 31 OFFSET $2`, [term,offset]),
    db.query<{ id: string; nome: string; email: string; ativo: boolean; emailVerified: boolean }>(`SELECT id,nome,email,ativo,(email_verified_at IS NOT NULL) AS "emailVerified" FROM usuarios WHERE deleted_at IS NULL AND (nome ILIKE $1 OR email ILIKE $1) ORDER BY created_at,id LIMIT 31 OFFSET $2`, [term,offset]),
    db.query<{ id: string; action: string; targetId: string | null; createdAt: Date; before: unknown; after: unknown }>('SELECT id,action,target_id AS "targetId",created_at AS "createdAt",before,after FROM platform_audit ORDER BY created_at DESC,id DESC LIMIT 15'),
  ]);
  return { settings, totals: totals.rows[0], restaurants: restaurants.rows.slice(0,30), users: users.rows.slice(0,30), hasNext: restaurants.rows.length > 30 || users.rows.length > 30, audit: audit.rows, page, query };
}

export class AccountDeletionError extends InputError {
  constructor(message: string, public status: number) { super(message); }
}
// The caller holds the platform settings and actor locks, verifies the password
// and excludes the configured administrator before entering this repository.
export async function deletePlatformAccount(userId: string, expectedActive: boolean, replacementPassword: string, actorId: string, client: Queryable) {
  const user = (await client.query<{ ativo: boolean; email: string; deleted_at: Date | null }>('SELECT ativo,email,deleted_at FROM usuarios WHERE id=$1 FOR UPDATE',[userId])).rows[0];
  if (!user || user.deleted_at) throw new AccountDeletionError('Conta não encontrada ou já excluída.',404);
  if (user.ativo!==expectedActive) throw new AccountDeletionError('A situação da conta mudou. Atualize o painel.',409);
  // Lock restaurants before checking other owners. Admin changes are serialized
  // by platform_settings, including concurrent deletions of two co-owners.
  await client.query(`SELECT e.id FROM empresas e JOIN restaurant_members m ON m.empresa_id=e.id WHERE m.user_id=$1 AND m.role='owner' ORDER BY e.id FOR UPDATE OF e`,[userId]);
  const soleOwner = await client.query(`SELECT m.id FROM restaurant_members m WHERE m.user_id=$1 AND m.role='owner' AND NOT EXISTS(
    SELECT 1 FROM restaurant_members other JOIN usuarios u ON u.id=other.user_id
    WHERE other.empresa_id=m.empresa_id AND other.role='owner' AND other.user_id<>$1 AND u.ativo AND u.deleted_at IS NULL) LIMIT 1`,[userId]);
  if (soleOwner.rowCount) throw new AccountDeletionError('Esta conta é a única dona de um restaurante. Mantenha-a suspensa ou transfira a responsabilidade para outro dono ativo antes de excluir.',409);
  const email = `deleted-${randomBytes(24).toString('hex')}@example.invalid`;
  await client.query('DELETE FROM refresh_tokens WHERE user_id=$1',[userId]);
  await client.query('DELETE FROM auth_tokens WHERE user_id=$1',[userId]);
  // Old invitations must never let a newly registered account with the same
  // email inherit access, and recipient addresses are removed from invitations.
  await client.query(`UPDATE restaurant_invitations SET email=$2,revoked_at=COALESCE(revoked_at,clock_timestamp()),updated_at=clock_timestamp() WHERE lower(btrim(email))=$1`,[user.email.trim().toLowerCase(),email]);
  await client.query(`UPDATE restaurant_invitations SET revoked_at=clock_timestamp(),updated_at=clock_timestamp() WHERE invited_by=$1 AND accepted_at IS NULL AND revoked_at IS NULL`,[userId]);
  const referenced = (await client.query<{ value: boolean }>(`SELECT (
    EXISTS(SELECT 1 FROM expenses WHERE created_by=$1 OR updated_by=$1) OR
    EXISTS(SELECT 1 FROM expense_audit WHERE actor_id=$1) OR
    EXISTS(SELECT 1 FROM inventory_movements WHERE actor_id=$1) OR
    EXISTS(SELECT 1 FROM restaurant_invitations WHERE invited_by=$1) OR
    EXISTS(SELECT 1 FROM platform_audit WHERE actor_id=$1)) AS value`,[userId])).rows[0].value;
  await client.query('DELETE FROM restaurant_members WHERE user_id=$1',[userId]);
  const mode = referenced ? 'anonymized' as const : 'removed' as const;
  if (referenced) {
    await client.query(`UPDATE usuarios SET nome='Usuário excluído',email=$2,senha=$3,papel='colaborador',empresa_id=NULL,email_verified_at=NULL,ativo=FALSE,deleted_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1`,[userId,email,replacementPassword]);
  } else {
    await client.query('DELETE FROM usuarios WHERE id=$1',[userId]);
  }
  // Keep only identifiers and operational status, never the removed email/name.
  await platformAudit(actorId,'user_deleted',userId,{ativo:user.ativo},{deleted:true,mode},client);
  return {deletionMode:mode};
}
