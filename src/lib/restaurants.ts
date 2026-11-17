import { listUserRestaurants } from '../models/Membership';
export type { RestaurantRole } from '../models/Membership';
export const userRestaurants = listUserRestaurants;

export function inviteDestination(value: unknown) {
  return value === '/admin' ? '/admin' : typeof value === 'string' && /^\/invite\/[A-Za-z0-9_-]{43}$/.test(value) ? value : '/dashboard';
}
