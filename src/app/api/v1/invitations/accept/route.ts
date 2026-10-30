import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { currentUser, hashToken, jsonError, SESSION_COOKIE, trustedOrigin } from '@/src/lib/auth';
import { InputError, readBody } from '@/src/lib/validation';
import { InvitationError, joinInvitation } from '@/src/lib/invitations';
import { sequelize } from '@/src/lib/db';
import { RefreshToken } from '@/src/models/RefreshToken';
export async function POST(request: Request) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta para aceitar o convite.', 401);
  try {
    const { token } = await readBody(request);
    const session = (await cookies()).get(SESSION_COOKIE)?.value || '';
    await sequelize.transaction(async transaction => {
      const empresaId = await joinInvitation(token, user.id, user.email, transaction);
      const [updated] = await RefreshToken.update({ empresaId }, { where: { token: hashToken(session), userId: user.id, expiresAt: { [Op.gt]: new Date() } }, transaction });
      if (!updated) throw new InvitationError('Sessão expirada. Entre novamente.', 401);
    });
    return NextResponse.json({ message: 'Você agora faz parte da equipe.' });
  } catch (error) { return jsonError(error instanceof InvitationError || error instanceof InputError ? error.message : 'Não foi possível aceitar o convite.', error instanceof InvitationError ? error.status : error instanceof InputError ? 400 : 500); }
}
