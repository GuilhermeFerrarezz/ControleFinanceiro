import { Membership } from '../models/Membership';
import { Empresa } from '../models/Empresa';

export type RestaurantRole = 'owner' | 'employee';
export async function userRestaurants(userId: string) {
  const memberships = await Membership.findAll({ where: { userId }, order: [['createdAt', 'ASC'], ['id', 'ASC']] });
  const restaurants = await Promise.all(memberships.map(async membership => {
    const empresa = await Empresa.findByPk(membership.get('empresaId') as string);
    if (!empresa || !empresa.get('ativo')) return null;
    return { id: empresa.id, nome: empresa.nome, role: membership.get('role') as RestaurantRole };
  }));
  return restaurants.filter(restaurant => restaurant !== null);
}

export function inviteDestination(value: unknown) {
  return typeof value === 'string' && /^\/invite\/[A-Za-z0-9_-]{43}$/.test(value) ? value : '/dashboard';
}
