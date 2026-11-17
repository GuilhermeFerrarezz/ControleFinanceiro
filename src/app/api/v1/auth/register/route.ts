import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { inTransaction, isUniqueViolation } from '@/src/lib/postgres';
import { createUsuario, findUsuarioByEmail } from '@/src/models/Usuario';
import { createEmpresa } from '@/src/models/Empresa';
import { jsonError, trustedOrigin } from '@/src/lib/auth';
import { emailValue, InputError, passwordValue, readBody, textValue } from '@/src/lib/validation';
import { consumeLimit } from '@/src/lib/rate-limit';
import { createMembership } from '@/src/models/Membership';
import { InvitationError, joinInvitation } from '@/src/lib/invitations';
import { limitAuthSource, SecurityLimitError, withPasswordBudget } from '@/src/lib/security-limits';
import { issueAuthToken } from '@/src/models/AuthToken';
import { sendAuthEmail } from '@/src/lib/auth-email';
import { allowAuthEmail, withAuthEmailBudget } from '@/src/lib/auth-email-limits';

export async function POST(request: Request) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  try {
    await limitAuthSource(request, 'register');
    const body = await readBody(request);
    const nome = textValue(body.nomeUsuario, 'O nome');
    const invited = body.invitationToken !== undefined;
    const empresaNome = invited ? null : textValue(body.nomeEmpresa, 'O nome do restaurante');
    const email = emailValue(body.email);
    const senha = passwordValue(body.senha, true);
    if (!await consumeLimit(`register:${email}`, 5, 3600_000)) throw new SecurityLimitError('Muitas tentativas para este e-mail. Tente mais tarde.');
    const existing = await findUsuarioByEmail(email);
    if (existing) return jsonError('Este e-mail já está registrado.', 409);
    const senhaHash = await withPasswordBudget(() => bcrypt.hash(senha, 10));
    const token = await inTransaction(async transaction => {
      if (invited) {
        const user = await createUsuario({ nome, email, senha: senhaHash, papel: 'colaborador' }, transaction);
        await joinInvitation(body.invitationToken, user.id, email, transaction);
        return issueAuthToken(user.id, 'email_verification', transaction);
      }
      const empresa = await createEmpresa(empresaNome!, transaction);
      const user = await createUsuario({ nome, email, senha: senhaHash, papel: 'admin', empresaId: empresa.id }, transaction);
      await createMembership(user.id, empresa.id, 'owner', transaction);
      return issueAuthToken(user.id, 'email_verification', transaction);
    });
    let emailDelivery: 'sent' | 'development' | 'unavailable' = 'unavailable';
    try {
      if (await allowAuthEmail(email, 'email_verification')) emailDelivery = await withAuthEmailBudget(() => sendAuthEmail(email, 'email_verification', token, request));
    }
    catch {
      console.error('[auth:email_verification] Conta criada, mas não foi possível enviar a confirmação.');
    }
    return NextResponse.json({ message: emailDelivery === 'sent' ? 'Conta criada! Confira seu e-mail para confirmar seu endereço.' : emailDelivery === 'development' ? 'Conta criada! O link de confirmação está no terminal de desenvolvimento.' : 'Conta criada. Não conseguimos enviar o e-mail agora. Solicite um novo link em instantes.', emailSent: emailDelivery === 'sent', emailDelivery }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof SecurityLimitError) return jsonError(error.message, 429);
    if (error instanceof InputError) return jsonError(error.message, 400);
    if (error instanceof InvitationError) return jsonError(error.message, error.status);
    if (isUniqueViolation(error)) return jsonError('Este e-mail já está registrado.', 409);
    return jsonError('Não foi possível criar a conta. Tente novamente.', 500);
  }
}
