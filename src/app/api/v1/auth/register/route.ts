import { NextResponse } from 'next/server';
import { UniqueConstraintError, fn, col, where } from 'sequelize';
import bcrypt from 'bcryptjs';
import { sequelize } from '@/src/lib/db';
import { Usuario } from '@/src/models/Usuario';
import { Empresa } from '@/src/models/Empresa';
import { jsonError, trustedOrigin } from '@/src/lib/auth';
import { emailValue, InputError, passwordValue, readBody, textValue } from '@/src/lib/validation';
import { consumeLimit } from '@/src/lib/rate-limit';
import { Membership } from '@/src/models/Membership';
import { InvitationError, joinInvitation } from '@/src/lib/invitations';

export async function POST(request: Request) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  try {
    if (!await consumeLimit('register:global', 20, 60 * 60_000)) return jsonError('Limite de cadastros atingido. Tente mais tarde.', 429);
    const body = await readBody(request);
    const nome = textValue(body.nomeUsuario, 'O nome');
    const invited = body.invitationToken !== undefined;
    const empresaNome = invited ? null : textValue(body.nomeEmpresa, 'O nome do restaurante');
    const email = emailValue(body.email);
    const senha = passwordValue(body.senha, true);
    const existing = await Usuario.findOne({ where: where(fn('lower', fn('trim', col('email'))), email) });
    if (existing) return jsonError('Este e-mail já está registrado.', 409);
    const senhaHash = await bcrypt.hash(senha, 10);
    await sequelize.transaction(async transaction => {
      if (invited) {
        const user = await Usuario.create({ nome, email, senha: senhaHash, papel: 'colaborador' }, { transaction });
        await joinInvitation(body.invitationToken, user.get('id') as string, email, transaction);
        return;
      }
      const empresa = await Empresa.create({ nome: empresaNome }, { transaction });
      const user = await Usuario.create({ nome, email, senha: senhaHash, papel: 'admin', empresaId: empresa.get('id') }, { transaction });
      await Membership.create({ userId: user.get('id'), empresaId: empresa.get('id'), role: 'owner' }, { transaction });
    });
    return NextResponse.json({ message: invited ? 'Conta criada e convite aceito!' : 'Conta e restaurante criados com sucesso!' }, { status: 201 });
  } catch (error) {
    if (error instanceof InputError) return jsonError(error.message, 400);
    if (error instanceof InvitationError) return jsonError(error.message, error.status);
    if (error instanceof UniqueConstraintError) return jsonError('Este e-mail já está registrado.', 409);
    return jsonError('Não foi possível criar a conta. Tente novamente.', 500);
  }
}
