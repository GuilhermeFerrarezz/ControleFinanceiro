import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { findUsuarioByEmail } from '@/src/models/Usuario';
import { hasMemberships } from '@/src/models/Membership';
import { userRestaurants } from '@/src/lib/restaurants';
import { clearSession, cookieOptions, createSession, jsonError, revokeSession, SESSION_COOKIE, trustedOrigin } from '@/src/lib/auth';
import { cookies } from 'next/headers';
import { emailValue, InputError, passwordValue, readBody } from '@/src/lib/validation';
import { consumeLimit } from '@/src/lib/rate-limit';
import { honeypotResponse, limitAuthSource, SecurityLimitError, withPasswordBudget } from '@/src/lib/security-limits';
import { isPlatformOwner } from '@/src/lib/platform-owner';

// A fixed hash keeps nonexistent accounts on the same bcrypt comparison path.
const dummyHash = '$2b$10$3LnUHxDX4h02syyACpW/TOsU7eVPPewFfWkp1wdeatH.DHN8GAcl.';
export async function POST(request: Request) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  try {
    const body = await readBody(request);
    const ignored = honeypotResponse(body);
    if (ignored) return ignored;
    await limitAuthSource(request, 'login');
    const email = emailValue(body.email);
    const senha = passwordValue(body.senha);
    if (body.remember !== undefined && typeof body.remember !== 'boolean') throw new InputError('Opção de sessão inválida.');
    if (!await consumeLimit(`login:${email}`, 5, 15 * 60_000)) return jsonError('Muitas tentativas. Aguarde 15 minutos.', 429);
    const usuario = await findUsuarioByEmail(email);
    const valid = await withPasswordBudget(() => bcrypt.compare(senha, usuario ? usuario.senha : dummyHash));
    if (!usuario?.ativo || !valid) return jsonError('Credenciais inválidas.', 401);
    if (!usuario.emailAccessAllowed) return clearSession(NextResponse.json({ erro: 'Confirme seu e-mail para continuar. O prazo de 7 dias após o cadastro terminou.', code: 'EMAIL_VERIFICATION_REQUIRED' }, { status: 403, headers: { 'Cache-Control': 'no-store' } }));
    const restaurants = await userRestaurants(usuario.id);
    if (!restaurants.length && await hasMemberships(usuario.id) && !isPlatformOwner(usuario.id)) return jsonError('Conta indisponível. Contate o responsável pelo restaurante.', 403);
    const cookieStore = await cookies();
    const session = await createSession(usuario.id, body.remember === true, usuario.senha);
    if (!session) return jsonError('Credenciais inválidas.', 401);
    await revokeSession(cookieStore.get(SESSION_COOKIE)?.value);
    const response = NextResponse.json({ message: 'Login realizado.' }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(SESSION_COOKIE, session.token, { ...cookieOptions, ...(body.remember === true ? { maxAge: session.lifetime } : {}) });
    response.cookies.set('refreshToken', '', { ...cookieOptions, maxAge: 0 });
    return response;
  } catch (error) {
    if (error instanceof SecurityLimitError) return jsonError(error.message, 429);
    if (error instanceof InputError) return jsonError(error.message, 400);
    return jsonError('Não foi possível entrar. Tente novamente.', 500);
  }
}
