import { db } from '../lib/db';
import type { Queryable } from '../lib/postgres';
export type RestaurantRole = 'owner' | 'employee';
export interface IMembership { id: string; userId: string; empresaId: string; role: RestaurantRole }
export interface IRestaurantAccess { id: string; nome: string; role: RestaurantRole }
export async function createMembership(userId: string, empresaId: string, role: RestaurantRole, client: Queryable = db) {
  // Invitation retries must never downgrade an existing owner's membership.
  await client.query('INSERT INTO restaurant_members (user_id,empresa_id,role) VALUES ($1,$2,$3) ON CONFLICT (user_id,empresa_id) DO NOTHING', [userId, empresaId, role]);
}
export async function findMembership(userId: string, empresaId: string, client: Queryable = db) {
  return (await client.query<IMembership>('SELECT id,user_id AS "userId",empresa_id AS "empresaId",role FROM restaurant_members WHERE user_id=$1 AND empresa_id=$2', [userId, empresaId])).rows[0] ?? null;
}
export async function hasMemberships(userId: string) {
  return (await db.query<{ exists: boolean }>('SELECT EXISTS (SELECT 1 FROM restaurant_members WHERE user_id=$1)', [userId])).rows[0].exists;
}
export async function listUserRestaurants(userId: string) {
  return (await db.query<IRestaurantAccess>(`SELECT e.id,e.nome,m.role FROM restaurant_members m JOIN empresas e ON e.id=m.empresa_id
    WHERE m.user_id=$1 AND e.ativo=TRUE ORDER BY m.created_at,m.id`, [userId])).rows;
}
export async function listTeam(empresaId: string) {
  return (await db.query<{ id: string; nome: string; email: string; role: RestaurantRole }>(`SELECT m.id,u.nome,u.email,m.role
    FROM restaurant_members m JOIN usuarios u ON u.id=m.user_id WHERE m.empresa_id=$1 ORDER BY m.created_at,m.id`, [empresaId])).rows;
}
