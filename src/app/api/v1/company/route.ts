import { NextResponse } from 'next/server';
import { currentUser, hashToken, jsonError, SESSION_COOKIE, trustedOrigin } from '@/src/lib/auth';
import { cookies } from 'next/headers';
import { Membership } from '@/src/models/Membership';
import { RefreshToken } from '@/src/models/RefreshToken';
import { InputError, readBody, textValue } from '@/src/lib/validation';
import { sequelize } from '@/src/lib/db';
import { Empresa } from '@/src/models/Empresa';
import { Usuario } from '@/src/models/Usuario';
export async function POST(request: Request) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  const user = await currentUser();
  if (!user) return jsonError('Sessão inválida ou expirada.', 401);
  if (user.empresaId) return jsonError('Sua conta já possui um restaurante.', 409);
  try {
    const nome = textValue((await readBody(request)).nomeEmpresa, 'O nome do restaurante');
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    await sequelize.transaction(async transaction => {
      const empresa = await Empresa.create({ nome }, { transaction });
      const [updated] = await Usuario.update({ empresaId: empresa.get('id'), papel: 'admin' }, { where: { id: user.id, empresaId: null }, transaction });
      if (!updated) throw new InputError('Sua conta já possui um restaurante.');
      await Membership.create({ userId: user.id, empresaId: empresa.get('id'), role: 'owner' }, { transaction });
      await RefreshToken.update({ empresaId: empresa.get('id') }, { where: { token: hashToken(token || ''), userId: user.id }, transaction });
    });
    return NextResponse.json({ message: 'Restaurante criado.' }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof InputError ? error.message : 'Não foi possível criar o restaurante.', error instanceof InputError ? 400 : 500);
  }
}
