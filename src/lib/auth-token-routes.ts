import { NextResponse } from 'next/server';
import { jsonError, trustedOrigin } from './auth';
import { requestAuthEmail, completeAuthToken } from './account-recovery';
import { emailValue, InputError, passwordValue, readBody } from './validation';
import { consumeLimit } from './rate-limit';
import { SecurityLimitError, trustedClientAddress } from './security-limits';
import type { AuthTokenType } from '../models/AuthToken';
import { allowAuthEmail } from './auth-email-limits';

export const AUTH_EMAIL_MESSAGE = 'Se o e-mail estiver cadastrado e precisar desta ação, enviaremos as instruções.';
export async function requestEmailRoute(request: Request, type: AuthTokenType) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  try {
    const address = trustedClientAddress(request);
    if (address && !await consumeLimit(`${type}:source:${address}`, 20, 3600_000)) return genericResponse();
    const body = await readBody(request);
    const email = emailValue(body.email);
    if (await allowAuthEmail(email, type)) await requestAuthEmail(email, type, request);
  } catch (error) {
    // Same response for unknown accounts, throttling and provider failures.
    if (!(error instanceof InputError)) console.error(`[auth:${type}] Não foi possível processar o envio.`);
  }
  return genericResponse();
}
function genericResponse() {
  return NextResponse.json({ message: AUTH_EMAIL_MESSAGE }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function completeTokenRoute(request: Request, type: AuthTokenType) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  try {
    const body = await readBody(request);
    const address = trustedClientAddress(request);
    if (address && !await consumeLimit(`${type}:complete:${address}`, 30, 15 * 60_000)) throw new SecurityLimitError('Muitas tentativas. Tente mais tarde.');
    const token = type === 'email_verification' ? new URL(request.url).searchParams.get('token') ?? body.token : body.token;
    await completeAuthToken(token, type, type === 'password_reset' ? passwordValue(body.senha, true) : undefined);
    return NextResponse.json({ message: type === 'email_verification' ? 'E-mail confirmado com sucesso!' : 'Senha redefinida. Entre com sua nova senha.' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof SecurityLimitError) return jsonError(error.message, 429);
    if (error instanceof InputError) return jsonError(error.message, 400);
    return jsonError('Não foi possível concluir. Tente novamente.', 500);
  }
}
