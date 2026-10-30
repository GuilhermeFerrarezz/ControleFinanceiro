import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { currentUser, hashToken, jsonError, SESSION_COOKIE, trustedOrigin } from '@/src/lib/auth';
import { InputError, readBody } from '@/src/lib/validation';
import { userRestaurants } from '@/src/lib/restaurants';
import { RefreshToken } from '@/src/models/RefreshToken';
export async function POST(request: Request) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta para continuar.', 401);
  try {
    const { empresaId } = await readBody(request);
    if (!(await userRestaurants(user.id)).some(restaurant => restaurant.id === empresaId)) return jsonError('Você não possui acesso a este restaurante.', 403);
    const token = (await cookies()).get(SESSION_COOKIE)?.value || '';
    await RefreshToken.update({ empresaId }, { where: { token: hashToken(token), userId: user.id } });
    return NextResponse.json({ message: 'Restaurante selecionado.' });
  } catch (error) { return jsonError(error instanceof InputError ? error.message : 'Não foi possível trocar de restaurante.', error instanceof InputError ? 400 : 500); }
}
