import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { findUsuarioByEmail } from '@/src/models/Usuario';
import { hasMemberships } from '@/src/models/Membership';
import { userRestaurants } from '@/src/lib/restaurants';
import { cookieOptions, createSession, jsonError, revokeSession, SESSION_COOKIE, trustedOrigin } from '@/src/lib/auth';
import { cookies } from 'next/headers';
import { emailValue, InputError, passwordValue, readBody } from '@/src/lib/validation';
import { consumeLimit } from '@/src/lib/rate-limit';

// A fixed hash keeps nonexistent accounts on the same bcrypt comparison path.
const dummyHash = bcrypt.hashSync('not-a-real-user-password', 10);
export async function POST(request: Request) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  try {
    if (!await consumeLimit('login:global', 100, 60_000)) return jsonError('Muitas tentativas. Aguarde um minuto.', 429);
    const body = await readBody(request);
    const email = emailValue(body.email);
    const senha = passwordValue(body.senha);
    if (body.remember !== undefined && typeof body.remember !== 'boolean') throw new InputError('Opção de sessão inválida.');
    if (!await consumeLimit(`login:${email}`, 5, 15 * 60_000)) return jsonError('Muitas tentativas. Aguarde 15 minutos.', 429);
    const usuario = await findUsuarioByEmail(email);
    const valid = await bcrypt.compare(senha, usuario ? usuario.senha : dummyHash);
    if (!usuario || !valid) return jsonError('Credenciais inválidas.', 401);
    const restaurants = await userRestaurants(usuario.id);
    if (!restaurants.length && await hasMemberships(usuario.id)) return jsonError('Conta indisponível. Contate o responsável pelo restaurante.', 403);
    const cookieStore = await cookies();
    const session = await createSession(usuario.id, body.remember === true);
    await revokeSession(cookieStore.get(SESSION_COOKIE)?.value);
    const response = NextResponse.json({ message: 'Login realizado.' }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(SESSION_COOKIE, session.token, { ...cookieOptions, ...(body.remember === true ? { maxAge: session.lifetime } : {}) });
    response.cookies.set('refreshToken', '', { ...cookieOptions, maxAge: 0 });
    return response;
  } catch (error) {
    if (error instanceof InputError) return jsonError(error.message, 400);
    return jsonError('Não foi possível entrar. Tente novamente.', 500);
  }
}
