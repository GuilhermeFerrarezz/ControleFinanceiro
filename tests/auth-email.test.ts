import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendAuthEmail, authEmailLink } from '../src/lib/auth-email';

test('produção rejeita sandbox em runtime e libera o corpo da resposta do provedor', async t => {
  const keys = ['NODE_ENV', 'VERCEL_ENV', 'APP_ORIGIN', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'RESEND_SANDBOX_TO'];
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  t.after(() => { for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; } });
  Object.assign(process.env, { NODE_ENV: 'production', VERCEL_ENV: 'production', APP_ORIGIN: 'https://app.example.com',
    RESEND_API_KEY: 'fake-test-key', RESEND_FROM_EMAIL: 'Saldo <auth@example.com>', RESEND_SANDBOX_TO: 'sandbox@example.com' });
  let cancelled = false;
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 422 });
  });
  const request = new Request('https://app.example.com');
  await assert.rejects(sendAuthEmail('person@example.com', 'password_reset', 'a'.repeat(43), request), /Sandbox/);
  assert.equal(requests, 0);
  delete process.env.RESEND_SANDBOX_TO;
  await assert.rejects(sendAuthEmail('person@example.com', 'password_reset', 'a'.repeat(43), request), /Falha no envio/);
  assert.equal(requests, 1);
  assert.equal(cancelled, true);
});

test('envio Resend e fallback local protegem o token e a origem do link', async t => {
  const keys = ['NODE_ENV', 'APP_ORIGIN', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'RESEND_SANDBOX_TO'];
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  t.after(() => { for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; } });
  const env: Record<string, string | undefined> = process.env;
  env.NODE_ENV = 'development'; delete env.RESEND_API_KEY; delete env.APP_ORIGIN; delete env.RESEND_SANDBOX_TO;
  const logs: unknown[][] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => { logs.push(args); });
  const request = new Request('http://localhost:3000/api/v1/auth/register');
  const token = 'a'.repeat(43);
  assert.equal(await sendAuthEmail('person@example.com', 'email_verification', token, request), 'development');
  assert.match(String(logs[0]), /http:\/\/localhost:3000\/verify-email#token=/);
  await sendAuthEmail('person@example.com', 'password_reset', token, request);
  assert.match(String(logs[1]), /http:\/\/localhost:3000\/reset-password#token=/);
  env.NODE_ENV = 'production';
  await assert.rejects(sendAuthEmail('person@example.com', 'password_reset', token, request));
  assert.equal(logs.length, 2);
  env.APP_ORIGIN = 'https://contas.example.com'; env.RESEND_API_KEY = 'fake-test-key'; env.RESEND_FROM_EMAIL = 'Saldo <auth@example.com>';
  let body: Record<string, unknown> = {};
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer fake-test-key');
    body = JSON.parse(init.body as string);
    return new Response('{}', { status: 200 });
  });
  await sendAuthEmail('person@example.com', 'password_reset', token, request);
  assert.deepEqual(body.to, ['person@example.com']);
  assert.equal(body.from, 'Saldo <auth@example.com>');
  assert.match(String(body.text), /https:\/\/contas.example.com\/reset-password#token=/);
  assert.match(String(body.text), /30 minutos/);
  assert.match(String(body.html), /Redefinir minha senha/);
  assert.match(String(body.html), /https:\/\/contas.example.com\/reset-password#token=/);
  assert.equal(await sendAuthEmail('person@example.com', 'email_verification', token, request), 'sent');
  assert.match(String(body.html), /Confirmar meu e-mail/);
  assert.match(String(body.text), /24 horas/);
  assert.equal(logs.length, 2);
  t.mock.method(globalThis, 'fetch', async () => new Response('private provider details', { status: 422 }));
  await assert.rejects(sendAuthEmail('person@example.com', 'password_reset', token, request), /Falha no envio/);
  env.APP_ORIGIN = 'http://contas.example.com';
  assert.throws(() => authEmailLink('email_verification', token, request), /inválida/);
  for (const origin of ['https://app.example.com/path','https://app.example.com/?x=1','https://app.example.com/#fragment','https://name:secret@app.example.com/']) {
    env.APP_ORIGIN=origin;assert.throws(()=>authEmailLink('email_verification',token,request),/inválida/);
  }
  env.APP_ORIGIN='https://app.example.com';
  const safe=authEmailLink('password_reset',token,new Request('https://hostil.invalid/'));
  assert.equal(new URL(safe).origin,'https://app.example.com');
  assert.equal(new URL(safe).search,'');
});

test('sandbox redireciona os dois tipos sem domínio e fecha o envio quando o destino é inválido', async t => {
  const keys = ['NODE_ENV', 'APP_ORIGIN', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'RESEND_SANDBOX_TO'];
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  t.after(() => { for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; } });
  const env: Record<string, string | undefined> = process.env;
  env.NODE_ENV = 'production'; env.APP_ORIGIN = 'https://sandbox.example.com';
  env.RESEND_API_KEY = 'fake-test-key'; env.RESEND_SANDBOX_TO = ' SANDBOX-OWNER@example.com ';
  delete env.RESEND_FROM_EMAIL;
  const deliveries: Record<string, unknown>[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://api.resend.com/emails');
    deliveries.push(JSON.parse(init.body as string));
    return new Response('{}', { status: 200 });
  });
  const request = new Request('https://untrusted.invalid/api/v1/auth/register');
  for (const [index, type] of (['email_verification', 'password_reset'] as const).entries()) {
    const account = index ? 'other<em>@example.com' : 'first@example.com';
    const token = (index ? 'b' : 'a').repeat(43);
    assert.equal(await sendAuthEmail(account, type, token, request), 'sent');
    const mail = deliveries[index];
    assert.deepEqual(mail.to, ['sandbox-owner@example.com']);
    assert.equal(mail.from, 'Saldo da Casa <onboarding@resend.dev>');
    assert.equal(mail.cc, undefined); assert.equal(mail.bcc, undefined);
    assert.match(String(mail.subject), /^\[Sandbox\]/);
    assert.ok(String(mail.text).includes(`Conta solicitante: ${account}`));
    assert.ok(String(mail.text).includes(`#token=${token}`));
    assert.match(String(mail.text), /https:\/\/sandbox.example.com/);
  }
  assert.match(String(deliveries[1].html), /other&lt;em&gt;@example.com/);
  assert.doesNotMatch(String(deliveries[1].html), /other<em>/);
  for (const invalid of ['invalid', 'one@example.com,two@example.com', 'one@example.com\nBcc: other@example.com']) {
    env.RESEND_SANDBOX_TO = invalid;
    await assert.rejects(sendAuthEmail('first@example.com', 'email_verification', 'a'.repeat(43), request), /RESEND_SANDBOX_TO inválido/);
  }
  assert.equal(deliveries.length, 2, 'configuração inválida não pode enviar ao destinatário original');
  env.RESEND_SANDBOX_TO = '';
  await assert.rejects(sendAuthEmail('first@example.com', 'email_verification', 'a'.repeat(43), request), /não configurado/);
  env.RESEND_FROM_EMAIL = 'Saldo <auth@example.com>';
  await sendAuthEmail('first@example.com', 'email_verification', 'a'.repeat(43), request);
  assert.deepEqual(deliveries[2].to, ['first@example.com']);
  assert.equal(deliveries[2].from, 'Saldo <auth@example.com>');
  assert.doesNotMatch(String(deliveries[2].subject), /Sandbox/);
});
