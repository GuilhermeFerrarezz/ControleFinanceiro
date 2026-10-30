import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { RefreshToken } from '../models/RefreshToken';
import { Usuario } from '../models/Usuario';
import { Empresa } from '../models/Empresa';

export const SESSION_COOKIE = 'session';
export const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(userId: string, remember: boolean) {
  const token = randomBytes(32).toString('base64url');
  const lifetime = remember ? 7 * 24 * 60 * 60 : 8 * 60 * 60;
  await RefreshToken.destroy({ where: { expiresAt: { [Op.lte]: new Date() } } });
  await RefreshToken.create({ token: hashToken(token), userId, expiresAt: new Date(Date.now() + lifetime * 1000) });
  return { token, lifetime };
}

export async function findSession(token?: string) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const session = await RefreshToken.findOne({ where: { token: hashToken(token), expiresAt: { [Op.gt]: new Date() } } });
  if (!session) return null;
  const user = await Usuario.findByPk(session.get('userId') as string, { attributes: ['id', 'nome', 'email', 'papel', 'empresaId'] });
  if (!user) return null;
  const empresaId = user.get('empresaId') as string | null;
  const empresa = empresaId ? await Empresa.findByPk(empresaId) : null;
  if (empresaId && (!empresa || !empresa.get('ativo'))) return null;
  return { id: user.get('id') as string, nome: user.get('nome') as string, email: user.get('email') as string,
    papel: user.get('papel') as string, empresaId, empresaNome: empresa?.get('nome') as string | undefined };
}
export async function currentUser() { return findSession((await cookies()).get(SESSION_COOKIE)?.value); }
export async function revokeSession(token?: string) {
  if (token) await RefreshToken.destroy({ where: { token: hashToken(token) } });
}
export function clearSession(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, '', { ...cookieOptions, maxAge: 0 });
  response.cookies.set('refreshToken', '', { ...cookieOptions, maxAge: 0 });
  return response;
}
export function trustedOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  return (!origin || origin === expected) && request.headers.get('sec-fetch-site') !== 'cross-site';
}
export function jsonError(erro: string, status: number) {
  return NextResponse.json({ erro }, { status, headers: { 'Cache-Control': 'no-store' } });
}
