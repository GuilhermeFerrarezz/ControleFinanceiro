import { db } from '../lib/db';
import type { Queryable } from '../lib/postgres';
import { InputError } from '../lib/validation';

export class CapacityError extends InputError {}
export type PlatformSettings = { maxRestaurants: number; maxUsers: number };
export async function platformSettings(client: Queryable = db, lock = false) {
  return (await client.query<PlatformSettings>(`SELECT max_restaurants AS "maxRestaurants",max_users AS "maxUsers" FROM platform_settings WHERE id=1 ${lock ? 'FOR UPDATE' : ''}`)).rows[0];
}
// Hold the settings lock until the enclosing creation transaction commits.
export async function requireCapacity(kind: 'restaurants' | 'users', client: Queryable) {
  const settings = await platformSettings(client, true);
  const table = kind === 'restaurants' ? 'empresas' : 'usuarios';
  const count = Number((await client.query<{ count: string }>(`SELECT count(*) AS count FROM ${table}`)).rows[0].count);
  const max = kind === 'restaurants' ? settings.maxRestaurants : settings.maxUsers;
  if (count >= max) throw new CapacityError(kind === 'restaurants' ? 'O limite de restaurantes foi atingido. Contate o administrador da plataforma.' : 'O limite de usuários foi atingido. Contate o administrador da plataforma.');
}
export async function platformAudit(actorId: string, action: string, targetId: string | null, before: unknown, after: unknown, client: Queryable) {
  await client.query('INSERT INTO platform_audit(actor_id,action,target_id,before,after) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)', [actorId,action,targetId,JSON.stringify(before),JSON.stringify(after)]);
}
export async function platformOverview(query: string, page: number) {
  const term = `%${query}%`;
  const offset = (page - 1) * 30;
  const [settings, totals, restaurants, users, audit] = await Promise.all([
    platformSettings(),
    db.query<{ restaurants: number; users: number; activeRestaurants: number; activeUsers: number }>(`SELECT (SELECT count(*)::int FROM empresas) AS restaurants,(SELECT count(*)::int FROM usuarios) AS users,(SELECT count(*)::int FROM empresas WHERE ativo) AS "activeRestaurants",(SELECT count(*)::int FROM usuarios WHERE ativo) AS "activeUsers"`),
    db.query<{ id: string; nome: string; ativo: boolean; owners: string; members: number }>(`SELECT e.id,e.nome,e.ativo,coalesce((SELECT string_agg(u.email,', ' ORDER BY u.email) FROM restaurant_members m JOIN usuarios u ON u.id=m.user_id WHERE m.empresa_id=e.id AND m.role='owner'),'') AS owners,(SELECT count(*)::int FROM restaurant_members m WHERE m.empresa_id=e.id) AS members FROM empresas e WHERE e.nome ILIKE $1 OR EXISTS(SELECT 1 FROM restaurant_members m JOIN usuarios u ON u.id=m.user_id WHERE m.empresa_id=e.id AND m.role='owner' AND u.email ILIKE $1) ORDER BY e.created_at,e.id LIMIT 31 OFFSET $2`, [term,offset]),
    db.query<{ id: string; nome: string; email: string; ativo: boolean; emailVerified: boolean }>(`SELECT id,nome,email,ativo,(email_verified_at IS NOT NULL) AS "emailVerified" FROM usuarios WHERE nome ILIKE $1 OR email ILIKE $1 ORDER BY created_at,id LIMIT 31 OFFSET $2`, [term,offset]),
    db.query<{ id: string; action: string; targetId: string | null; createdAt: Date; before: unknown; after: unknown }>('SELECT id,action,target_id AS "targetId",created_at AS "createdAt",before,after FROM platform_audit ORDER BY created_at DESC,id DESC LIMIT 15'),
  ]);
  return { settings, totals: totals.rows[0], restaurants: restaurants.rows.slice(0,30), users: users.rows.slice(0,30), hasNext: restaurants.rows.length > 30 || users.rows.length > 30, audit: audit.rows, page, query };
}
export type PlatformOverview = Awaited<ReturnType<typeof platformOverview>>;
