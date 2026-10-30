import { NextResponse } from 'next/server';
import { currentUser, jsonError, trustedOrigin } from '@/src/lib/auth';
import { emailValue, InputError, readBody } from '@/src/lib/validation';
import { createInvitation, InvitationError } from '@/src/lib/invitations';
import { consumeLimit } from '@/src/lib/rate-limit';
export async function POST(request: Request) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta para continuar.', 401);
  if (user.role !== 'owner' || !user.empresaId) return jsonError('Apenas o dono pode convidar funcionários.', 403);
  try {
    if (!await consumeLimit(`invitations:${user.id}`, 30, 3600_000)) return jsonError('Limite de convites atingido. Tente mais tarde.', 429);
    const email = emailValue((await readBody(request)).email);
    const token = await createInvitation(user.id, user.empresaId, email);
    return NextResponse.json({ path: `/invite/${token}` }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return jsonError(error instanceof Error && (error instanceof InputError || error instanceof InvitationError) ? error.message : 'Não foi possível criar o convite.', error instanceof InvitationError ? error.status : error instanceof InputError ? 400 : 500);
  }
}
