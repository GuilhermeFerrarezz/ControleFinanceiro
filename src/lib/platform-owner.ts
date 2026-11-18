import 'server-only';

export type PlatformRole = 'ADMIN' | 'USER';

// An immutable identity configured by the server operator, never by public forms.
export function isPlatformOwner(userId: string) {
  const configured = process.env.PLATFORM_ADMIN_USER_ID?.trim().toLowerCase();
  return !!configured && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(configured) && configured === userId.toLowerCase();
}

export function platformRole(userId: string, emailVerified: boolean): PlatformRole {
  return isPlatformOwner(userId) && emailVerified ? 'ADMIN' : 'USER';
}
