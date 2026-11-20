import 'server-only';
import type { AuthTokenType } from '../models/AuthToken';
import { emailValue } from './validation';

function deliverySettings() {
  const configured = process.env.RESEND_SANDBOX_TO?.trim();
  if (configured && process.env.VERCEL_ENV === 'production') throw new Error('Sandbox de e-mail não permitido em Production.');
  let sandboxTo: string | undefined;
  if (configured) {
    try { sandboxTo = emailValue(configured); }
    catch { throw new Error('RESEND_SANDBOX_TO inválido.'); }
  }
  return {
    sandboxTo,
    // Resend's shared sender only accepts the account owner's test inbox.
    from: sandboxTo ? 'Saldo da Casa <onboarding@resend.dev>' : process.env.RESEND_FROM_EMAIL?.trim(),
  };
}

const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

export function validateAuthEmailConfiguration(request: Request) {
  authEmailLink('email_verification','',request);
  const { from } = deliverySettings();
  if (process.env.NODE_ENV==='development' && !process.env.RESEND_API_KEY?.trim()) return;
  if (!process.env.RESEND_API_KEY?.trim() || !from) throw new Error('Envio de e-mail não configurado.');
}

export function authEmailLink(type: AuthTokenType, token: string, request: Request) {
  // Production links must never derive their origin from a client-controlled Host.
  const configured = process.env.APP_ORIGIN?.trim();
  if (!configured && process.env.NODE_ENV !== 'development') throw new Error('Configure APP_ORIGIN para enviar e-mails.');
  const origin = new URL(configured || request.url);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || (configured && (origin.pathname!=='/' || origin.search || origin.hash)) ||
    (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:')) throw new Error('APP_ORIGIN inválida.');
  const link = new URL(type === 'email_verification' ? '/verify-email' : '/reset-password', origin);
  // Fragments are not sent in HTTP requests, access logs or Referer headers.
  // The form reads this once into memory and removes it from browser history.
  link.hash = new URLSearchParams({token}).toString();
  return link.toString();
}

export async function sendAuthEmail(email: string, type: AuthTokenType, token: string, request: Request) {
  validateAuthEmailConfiguration(request);
  const link = authEmailLink(type, token, request);
  const verification = type === 'email_verification';
  if (process.env.NODE_ENV === 'development' && !process.env.RESEND_API_KEY?.trim()) {
    console.log(`[auth:${type}] ${link}`);
    return 'development' as const;
  }
  const { from, sandboxTo } = deliverySettings();
  const recipient = emailValue(email);
  const title = verification ? 'Confirme seu e-mail' : 'Redefina sua senha';
  const sandboxNote = sandboxTo ? `Ambiente de testes. Conta solicitante: ${recipient}. Esta mensagem foi direcionada para a caixa de testes.` : '';
  const text = `${title} no Saldo da Casa.${sandboxNote ? `\n\n${sandboxNote}` : ''}\n\n${link}\n\nEste link expira em ${verification ? '24 horas' : '30 minutos'} e só pode ser usado uma vez. Se você não fez esta solicitação, ignore este e-mail.`;
  const html = `<html lang="pt-BR"><body style="margin:0;background:#f5f4e8;font-family:Arial,sans-serif;color:#264b39"><main style="max-width:520px;margin:40px auto;padding:32px;background:#fffefa;border-radius:12px"><p style="font-weight:bold">SALDO DA CASA</p>${sandboxNote ? `<p style="padding:12px;background:#f5f4e8;border-radius:6px">${escapeHtml(sandboxNote)}</p>` : ''}<h1>${title}</h1><p>${verification ? 'Sua conta foi criada. Confirme seu endereço para concluir esta etapa.' : 'Recebemos uma solicitação para redefinir sua senha.'}</p><p style="margin:32px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#264b39;color:#fff;padding:16px 24px;border-radius:7px;text-decoration:none">${verification ? 'Confirmar meu e-mail' : 'Redefinir minha senha'}</a></p><p>O link expira em ${verification ? '24 horas' : '30 minutos'} e só pode ser usado uma vez.</p><p>Se você não fez esta solicitação, ignore este e-mail.</p></main></body></html>`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [sandboxTo || recipient], subject: `${sandboxTo ? '[Sandbox] ' : ''}${title} | Saldo da Casa`, text, html }),
    signal: AbortSignal.timeout(10_000),
  });
  // Never log provider responses: they may contain addresses or the original link.
  // Release the HTTP body/connection even for rejected deliveries.
  await response.body?.cancel();
  if (!response.ok) throw new Error('Falha no envio transacional.');
  return 'sent' as const;
}
