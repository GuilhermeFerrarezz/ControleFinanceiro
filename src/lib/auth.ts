import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createRefreshToken, deleteRefreshToken, removeExpiredSessions, sessionIdentity } from '../models/RefreshToken';
import { userRestaurants } from './restaurants';
export { trustedOrigin } from './request-origin';

export const SESSION_COOKIE = 'session';
export const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(userId: string, remember: boolean) {
  const token = randomBytes(32).toString('base64url');
  const lifetime = remember ? 7 * 24 * 60 * 60 : 8 * 60 * 60;
  const restaurants = await userRestaurants(userId);
  await removeExpiredSessions();
  await createRefreshToken(hashToken(token), userId, restaurants[0]?.id || null, new Date(Date.now() + lifetime * 1000));
  return { token, lifetime };
}

export async function findSession(token?: string) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const user = await sessionIdentity(hashToken(token));
  if (!user) return null;
  const role = user.role ?? undefined;
  return { id: user.id, nome: user.nome, email: user.email, role,
    papel: role === 'owner' ? 'admin' : 'colaborador', empresaId: user.empresaId, empresaNome: user.empresaNome ?? undefined };
}
export async function currentUser() { return findSession((await cookies()).get(SESSION_COOKIE)?.value); }
export async function revokeSession(token?: string) {
  if (token) await deleteRefreshToken(hashToken(token));
}
export function clearSession(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, '', { ...cookieOptions, maxAge: 0 });
  response.cookies.set('refreshToken', '', { ...cookieOptions, maxAge: 0 });
  return response;
}
export function jsonError(erro: string, status: number) {
  return NextResponse.json({ erro }, { status, headers: { 'Cache-Control': 'no-store' } });
}
