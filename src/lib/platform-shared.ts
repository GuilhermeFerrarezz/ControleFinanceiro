// Public DTOs only. This module must remain safe for browser imports.
export type PlatformSettings = { maxRestaurants: number; maxUsers: number };
export type PlatformRestaurantMembers = {
  restaurant: { id: string; nome: string; ativo: boolean };
  members: { id: string; nome: string; email: string; role: 'owner' | 'employee'; ativo: boolean; emailVerified: boolean }[];
  page: number;
  hasNext: boolean;
};
export type PlatformOverview = {
  settings: PlatformSettings;
  totals: { restaurants: number; users: number; activeRestaurants: number; activeUsers: number };
  restaurants: { id: string; nome: string; ativo: boolean; owners: string; members: number }[];
  users: { id: string; nome: string; email: string; ativo: boolean; emailVerified: boolean }[];
  hasNext: boolean;
  audit: { id: string; action: string; targetId: string | null; createdAt: Date | string; before: unknown; after: unknown }[];
  page: number;
  query: string;
};
