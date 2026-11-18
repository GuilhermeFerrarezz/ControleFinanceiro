import { after, NextResponse } from 'next/server';
import { setTimeout } from 'node:timers/promises';
import bcrypt from 'bcryptjs';
import { inTransaction, isUniqueViolation } from '@/src/lib/postgres';
import { createUsuario, findUsuarioByEmail } from '@/src/models/Usuario';
import { createEmpresa } from '@/src/models/Empresa';
import { jsonError, trustedOrigin } from '@/src/lib/auth';
import { emailValue, InputError, passwordValue, readBody, textValue } from '@/src/lib/validation';
import { consumeLimit } from '@/src/lib/rate-limit';
import { createMembership } from '@/src/models/Membership';
import { InvitationError, joinInvitation, validInvitation } from '@/src/lib/invitations';
import { limitAuthSource, SecurityLimitError, withPasswordBudget } from '@/src/lib/security-limits';
import { issueAuthToken } from '@/src/models/AuthToken';
import { sendAuthEmail } from '@/src/lib/auth-email';
import { allowAuthEmail, withAuthEmailBudget, withRecoveryRequestBudget } from '@/src/lib/auth-email-limits';
import { CapacityError } from '@/src/models/Platform';

export const maxDuration = 30;

async function registrationResponse(startedAt: number) {
  // Equal status/body and a minimum response time for new, existing and full
  // registrations. Provider latency must never identify an existing address.
  await setTimeout(Math.max(0, 500 - (performance.now() - startedAt)));
  return NextResponse.json({ message: 'Se o cadastro puder ser concluído, enviaremos um link para confirmar seu e-mail. Se já possui uma conta, entre ou recupere sua senha. Caso não receba o link, contate o administrador.' }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  const startedAt = performance.now();
  try {
    await limitAuthSource(request, 'register');
    const body = await readBody(request);
    const nome = textValue(body.nomeUsuario, 'O nome');
    const invited = body.invitationToken !== undefined;
    const empresaNome = invited ? null : textValue(body.nomeEmpresa, 'O nome do restaurante');
    const email = emailValue(body.email);
    const senha = passwordValue(body.senha, true);
    if (!await consumeLimit(`register:${email}`, 5, 3600_000)) throw new SecurityLimitError('Muitas tentativas para este e-mail. Tente mais tarde.');
    // Validate the invitation independently of whether the address exists.
    if (invited) {
      const valid = await validInvitation(body.invitationToken);
      if (!valid) throw new InvitationError('Este convite expirou ou já foi utilizado.', 410);
      if (valid.invitation.email !== email) throw new InvitationError('Entre com o e-mail que recebeu o convite.', 403);
    }
    const senhaHash = await withPasswordBudget(() => bcrypt.hash(senha, 10));
    const existing = await findUsuarioByEmail(email);
    if (existing) return registrationResponse(startedAt);
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
    after(async () => {
      try {
        await withRecoveryRequestBudget(async () => {
          if (await allowAuthEmail(email, 'email_verification')) await withAuthEmailBudget(() => sendAuthEmail(email, 'email_verification', token, request));
        });
      } catch {
        console.error('[auth:email_verification] Não foi possível enviar a confirmação.');
      }
    });
    return registrationResponse(startedAt);
  } catch (error) {
    if (error instanceof SecurityLimitError) return jsonError(error.message, 429);
    if (error instanceof CapacityError || isUniqueViolation(error)) return registrationResponse(startedAt);
    if (error instanceof InputError) return jsonError(error.message, 400);
    if (error instanceof InvitationError) return jsonError(error.message, error.status);
    return jsonError('Não foi possível criar a conta. Tente novamente.', 500);
  }
}
