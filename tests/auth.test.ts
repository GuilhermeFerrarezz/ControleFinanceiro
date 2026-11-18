import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { migrateDatabase } from '../src/lib/migrations';
import { createHash, randomBytes } from 'node:crypto';
import { issueAuthToken } from '../src/models/AuthToken';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';

import { isolatedDatabase, query } from './postgres-fixture';

test('schema e autenticação HTTP com PostgreSQL isolado', { timeout: 180_000 }, async t => {
  const fixture = await isolatedDatabase();
  const storage = fixture.pool;
  let stopServer = async () => {};
  t.after(async () => { try { await stopServer(); } finally { await fixture.cleanup(); } });
  await t.test('schema preserva registros e é idempotente', async () => {
    await query(storage, 'INSERT INTO empresas (nome) VALUES ($1)', ['Restaurante preservado']);
    const before = await query(storage, 'SELECT * FROM empresas');
    await migrateDatabase(storage); await migrateDatabase(storage);
    assert.deepEqual(await query(storage, 'SELECT * FROM empresas'), before);
    await query(storage, 'DELETE FROM empresas WHERE id=$1', [before[0].id]);
  });
  await t.test('restrições normalizam unicidade e transação reverte alterações', async () => {
    const client = await storage.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO empresas (nome) VALUES ($1)', ['Rollback']);
      await client.query('INSERT INTO usuarios (nome,email,senha) VALUES ($1,$2,$3)', ['Um','duplicate@example.com','hash']);
      await assert.rejects(client.query('INSERT INTO usuarios (nome,email,senha) VALUES ($1,$2,$3)', ['Dois',' DUPLICATE@example.com ','hash']), { code: '23505' });
      await client.query('ROLLBACK');
      assert.equal((await query(storage, 'SELECT id FROM usuarios')).length, 0);
      assert.equal((await query(storage, 'SELECT id FROM empresas')).length, 0);
    } finally { await client.query('ROLLBACK'); client.release(); }
  });
  const portServer = createServer();
  portServer.listen(0, '127.0.0.1'); await once(portServer, 'listening');
  const address = portServer.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  await new Promise<void>(resolve => portServer.close(() => resolve()));
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port), '-H', '127.0.0.1'], {
    env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: fixture.connectionString, APP_ORIGIN: '', RESEND_API_KEY: '', RESEND_FROM_EMAIL: '' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let output = '';
  server.stdout.on('data', chunk => { output = (output + chunk.toString()).slice(-8000); });
  server.stderr.on('data', chunk => { output = (output + chunk.toString()).slice(-8000); });
  stopServer = async () => {
    if (server.exitCode === null) { const exited = once(server, 'exit'); server.kill(); await exited; }
  };
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`Servidor não iniciou: ${output}`);
    try { if ((await fetch(`${origin}/login`, { signal: AbortSignal.timeout(3000) })).ok) { ready = true; break; } } catch { /* Wait for startup. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, `Servidor indisponível: ${output}`);
  const post = (path: string, body: unknown, cookie = '', requestOrigin = origin) => fetch(`${origin}/api/v1${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: requestOrigin, Cookie: cookie }, body: JSON.stringify(body),
  });
  const credentials = { email: 'owner@example.com', senha: 'uma-senha-longa-123' };
  let firstCookie = '';
  let secondCookie = '';
  let userId = '';
  await t.test('todos os endpoints de negócio recusam acesso anônimo e identidade forjada', async () => {
    const root = 'src/app/api/v1';
    const files = (await readdir(root, { recursive: true })).filter(file => file.endsWith('route.ts') && !file.startsWith('auth'));
    let checked = 0;
    for (const file of files) {
      const source = await readFile(join(root, file), 'utf8');
      const path = file.replaceAll('\\', '/').replace('/route.ts', '').replaceAll('[id]', '11111111-1111-4111-8111-111111111111');
      for (const [, method] of source.matchAll(/export async function (GET|POST|PATCH|DELETE)\(/g)) {
        for (const cookie of ['', 'session=forged; refreshToken=forged']) {
          const response = await fetch(`${origin}/api/v1/${path}?empresaId=forged&userId=forged`, {
            method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'user-id': 'forged', Authorization: 'Bearer forged' },
            ...(method === 'GET' ? {} : { body: '{}' }), redirect: 'manual',
          });
          assert.equal(response.status, 401, `${method} ${path} deve exigir sessão`);
          assert.match(response.headers.get('cache-control') || '', /no-store/);
          checked++;
        }
      }
    }
    assert.ok(checked >= 50, `Matriz incompleta: ${checked} verificações`);
    for (const page of ['home', 'dashboard', 'dashboard/team', 'dashboard/restaurant', 'dashboard/catalog', 'dashboard/inventory', 'dashboard/expenses', 'dashboard/revenue', 'dashboard/sheet', 'dashboard/profit', 'dashboard/help']) {
      const response = await fetch(`${origin}/${page}`, { redirect: 'manual' });
      assert.equal(response.status, 307); assert.match(response.headers.get('location') || '', /\/login$/);
    }
  });
  await t.test('páginas de recuperação são públicas e tokens são atômicos, temporários e de uso único', async recoveryTest => {
    for (const page of ['verify-email', 'forgot-password', 'reset-password']) assert.equal((await fetch(`${origin}/${page}`)).status, 200);
    const account = { email: 'recovery@example.com', senha: 'senha-anterior-123' };
    const signup = await post('/auth/register', { ...account, nomeUsuario: 'Recuperação', nomeEmpresa: 'Teste recuperação' });
    assert.equal(signup.status, 201);
    const signupBody = await signup.json();
    assert.equal(signupBody.emailSent, false); assert.equal(signupBody.emailDelivery, 'unavailable');
    const [user] = await query<{ id: string; email_verified_at: null }>(storage, 'SELECT id,email_verified_at FROM usuarios WHERE email=$1', [account.email]);
    assert.equal(user.email_verified_at, null);
    const [initial] = await query<{ token_hash: string; lifetime: number }>(storage, `SELECT token_hash,extract(epoch FROM expires_at-created_at)::float AS lifetime FROM auth_tokens WHERE user_id=$1`, [user.id]);
    assert.match(initial.token_hash, /^[0-9a-f]{64}$/); assert.ok(Math.abs(initial.lifetime - 86400) < 2);
    const resendResults = await Promise.all(Array.from({ length: 8 }, () => post('/auth/resend-verification', { email: account.email })));
    for (const response of resendResults) assert.equal(response.status, 200);
    assert.equal((await query(storage, 'SELECT token_hash FROM auth_tokens WHERE user_id=$1', [user.id]))[0].token_hash, initial.token_hash, 'cooldown não invalida o link já emitido');
    const cooldownKey = createHash('sha256').update(`email_verification:cooldown:${account.email}`).digest('hex');
    assert.ok((await query<{ count: number }>(storage, 'SELECT count FROM auth_rate_limits WHERE key=$1', [cooldownKey]))[0].count > 1);
    // Simulate elapsed cooldowns to exercise the longer per-email window.
    const emailKey = createHash('sha256').update(`email_verification:email:${account.email}`).digest('hex');
    await query(storage, 'INSERT INTO auth_rate_limits(key,count,window_start) VALUES ($1,3,$2) ON CONFLICT(key) DO UPDATE SET count=3,window_start=$2', [emailKey, Date.now()]);
    await query(storage, 'DELETE FROM auth_rate_limits WHERE key=$1', [cooldownKey]);
    assert.equal((await post('/auth/resend-verification', { email: account.email })).status, 200);
    assert.equal((await query(storage, 'SELECT token_hash FROM auth_tokens WHERE user_id=$1', [user.id]))[0].token_hash, initial.token_hash);
    const issue = async (type: 'email_verification' | 'password_reset') => {
      const client = await storage.connect();
      try {
        await client.query('BEGIN');
        const token = await issueAuthToken(user.id, type, client);
        await client.query('COMMIT');
        return token;
      } finally { await client.query('ROLLBACK'); client.release(); }
    };
    let token = await issue('email_verification');
    const unverifiedLogin = await post('/auth/login', account);
    assert.equal(unverifiedLogin.status, 200);
    const verificationCookie = (unverifiedLogin.headers.get('set-cookie') || '').split(';')[0];
    const beforeVerification = await (await fetch(`${origin}/api/v1/private`, { headers: { Cookie: verificationCookie } })).json();
    assert.equal(beforeVerification.user.emailVerified, false);
    assert.match(await (await fetch(`${origin}/dashboard`, { headers: { Cookie: verificationCookie } })).text(), /Seu e-mail ainda não foi confirmado/);
    const preview = await fetch(`${origin}/api/v1/auth/verify-email?token=${token}`, { redirect: 'manual' });
    assert.equal(preview.status, 303);
    assert.equal((await query(storage, 'SELECT id FROM auth_tokens WHERE user_id=$1', [user.id])).length, 1);
    await query(storage, "UPDATE auth_tokens SET expires_at='2000-01-01' WHERE user_id=$1", [user.id]);
    assert.equal((await post(`/auth/verify-email?token=${token}`, {})).status, 400);
    token = await issue('email_verification');
    assert.equal((await post('/auth/reset-password', { token, senha: 'senha-nova-123' })).status, 400);
    const verification = await Promise.all([post(`/auth/verify-email?token=${token}`, {}), post('/auth/verify-email', { token })]);
    assert.deepEqual(verification.map(r => r.status).sort(), [200,400]);
    assert.ok((await query(storage, 'SELECT email_verified_at FROM usuarios WHERE id=$1', [user.id]))[0].email_verified_at);
    const afterVerification = await (await fetch(`${origin}/api/v1/private`, { headers: { Cookie: verificationCookie } })).json();
    assert.equal(afterVerification.user.emailVerified, true);
    assert.doesNotMatch(await (await fetch(`${origin}/dashboard`, { headers: { Cookie: verificationCookie } })).text(), /Seu e-mail ainda não foi confirmado/);
    assert.equal((await query(storage, 'SELECT id FROM auth_tokens WHERE user_id=$1', [user.id])).length, 0);
    for (const [key, count] of [['auth-email:second', 2], ['auth-email:minute', 15], ['auth-email:day',100]] as const) {
      const hashedKey = createHash('sha256').update(key).digest('hex');
      await query(storage, 'INSERT INTO auth_rate_limits(key,count,window_start) VALUES ($1,$2,$3) ON CONFLICT(key) DO UPDATE SET count=$2,window_start=$3', [hashedKey, count, Date.now()]);
      assert.equal((await post('/auth/forgot-password', { email: account.email })).status, 200);
      assert.equal((await query(storage, 'SELECT id FROM auth_tokens WHERE user_id=$1', [user.id])).length, 0, 'quota global impede emissão de tokens');
      await query(storage, 'DELETE FROM auth_rate_limits WHERE key=$1', [hashedKey]);
      await query(storage, 'DELETE FROM auth_rate_limits WHERE key=$1', [createHash('sha256').update(`password_reset:cooldown:${account.email}`).digest('hex')]);
    }
    const unknown = await post('/auth/forgot-password', { email: 'missing@example.com' });
    const known = await post('/auth/forgot-password', { email: account.email });
    assert.equal(unknown.status, 200); assert.equal(known.status, 200); assert.deepEqual(await known.json(), await unknown.json());
    assert.equal((await post('/auth/forgot-password', { email: account.email }, '', 'https://hostil.invalid')).status, 403);
    token = await issue('password_reset');
    const [reset] = await query<{ token_hash: string; lifetime: number }>(storage, `SELECT token_hash,extract(epoch FROM expires_at-created_at)::float AS lifetime FROM auth_tokens WHERE user_id=$1`, [user.id]);
    assert.notEqual(reset.token_hash, token); assert.ok(Math.abs(reset.lifetime - 1800) < 2);
    await query(storage, "UPDATE auth_tokens SET expires_at='2000-01-01' WHERE user_id=$1", [user.id]);
    assert.equal((await post('/auth/reset-password', { token, senha: 'senha-nova-123' })).status, 400);
    const replaced = await issue('password_reset'); token = await issue('password_reset');
    assert.equal((await post('/auth/reset-password', { token: replaced, senha: 'senha-nova-123' })).status, 400);
    assert.equal((await post('/auth/reset-password', { token, senha: 'curta' })).status, 400);
    const login = await post('/auth/login', account);
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    const [other] = await query<{ id: string; senha: string }>(storage, `INSERT INTO usuarios(nome,email,senha) SELECT 'Outra conta','recovery-other@example.com',senha FROM usuarios WHERE id=$1 RETURNING id,senha`, [user.id]);
    const resets = await Promise.all([post('/auth/reset-password', { token, senha: 'senha-nova-123', userId: other.id, email: 'recovery-other@example.com' }), post('/auth/reset-password', { token, senha: 'senha-nova-123' })]);
    assert.deepEqual(resets.map(r => r.status).sort(), [200,400]);
    assert.equal((await query(storage, 'SELECT senha FROM usuarios WHERE id=$1', [other.id]))[0].senha, other.senha, 'o token só altera a conta à qual pertence');
    await query(storage, 'DELETE FROM usuarios WHERE id=$1', [other.id]);
    assert.equal((await fetch(`${origin}/api/v1/private`, { headers: { Cookie: cookie } })).status, 401);
    assert.equal((await post('/auth/login', account)).status, 401);
    assert.equal((await post('/auth/login', { ...account, senha: 'senha-nova-123' })).status, 200);
    await recoveryTest.test('login iniciado com senha antiga não sobrevive a uma troca concorrente', async () => {
      const lock = await storage.connect();
      const nextHash = await bcrypt.hash('senha-concorrente-123', 10);
      let pending: Promise<Response> | undefined;
      try {
        await lock.query('BEGIN');
        await lock.query('UPDATE usuarios SET senha=$1 WHERE id=$2', [nextHash, user.id]);
        await lock.query('DELETE FROM refresh_tokens WHERE user_id=$1', [user.id]);
        pending = post('/auth/login', { ...account, senha: 'senha-nova-123' });
        let waiting = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          const rows = await query(storage, "SELECT pid FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT senha%FROM usuarios WHERE id=%FOR UPDATE'");
          if (rows.length) { waiting = true; break; }
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.ok(waiting, 'Login deve aguardar o mesmo bloqueio usado pela recuperação');
        await lock.query('COMMIT');
        assert.equal((await pending).status, 401);
        assert.equal((await query(storage, 'SELECT id FROM refresh_tokens WHERE user_id=$1', [user.id])).length, 0);
      } finally { await lock.query('ROLLBACK'); lock.release(); if (pending) await pending; }
    });
    assert.equal((await query(storage, 'SELECT id FROM auth_tokens WHERE user_id=$1', [user.id])).length, 0);
    assert.equal((await post('/auth/verify-email', { token: randomBytes(32).toString('base64url') })).status, 400);
    // Leave the other authentication scenarios with their original empty database.
    await query(storage, 'DELETE FROM restaurant_members WHERE user_id=$1', [user.id]);
    await query(storage, 'DELETE FROM usuarios WHERE id=$1', [user.id]);
    await query(storage, "DELETE FROM empresas WHERE nome='Teste recuperação'");
  });
  await t.test('landing é pública e apresenta os acessos ao sistema', async () => {
    const response = await fetch(origin, { redirect: 'manual' });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /O controle, aqui/);
    assert.match(html, /href="\/register"/);
    const register = await (await fetch(`${origin}/register`)).text();
    assert.match(register, /minLength="6"/i);
  });
  await t.test('cookie falso não libera páginas nem API; headers de identidade são ignorados', async () => {
    const page = await fetch(`${origin}/dashboard`, { redirect: 'manual', headers: { Cookie: 'session=invalid; refreshToken=invalid' } });
    assert.equal(page.status, 307); assert.match(page.headers.get('location') || '', /\/login$/);
    assert.match(page.headers.get('set-cookie') || '', /Max-Age=0/);
    assert.equal((await fetch(`${origin}/login`, { headers: { Cookie: 'session=invalid' }, redirect: 'manual' })).status, 200);
    assert.equal((await fetch(`${origin}/api/v1/private`, { headers: { 'user-id': 'forged', Authorization: 'Bearer forged' } })).status, 401);
  });
  await t.test('validação, JSON inválido, tamanho e CSRF', async () => {
    assert.equal((await post('/auth/register', { nomeUsuario: ' ', nomeEmpresa: 'Teste', ...credentials })).status, 400);
    assert.equal((await post('/auth/register', { nomeUsuario: 'Nome', nomeEmpresa: 'Teste', email: 'invalid', senha: 'x' })).status, 400);
    assert.equal((await post('/auth/register', { nomeUsuario: 'Nome', nomeEmpresa: 'Teste', ...credentials, senha: 'curta' })).status, 400);
    assert.equal((await post('/auth/register', { nomeUsuario: 'Nome', nomeEmpresa: 'Teste', ...credentials, senha: '😀'.repeat(30) })).status, 400);
    assert.equal((await post('/auth/login', credentials, '', 'https://hostil.invalid')).status, 403);
    const malformed = await fetch(`${origin}/api/v1/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: '{' });
    assert.equal(malformed.status, 400);
    assert.equal((await post('/auth/register', { payload: 'x'.repeat(9000) })).status, 400);
  });
  await t.test('cadastro normaliza email e cria restaurante e administrador juntos', async () => {
    assert.equal((await post('/auth/register', { nomeUsuario: 'Proprietário', nomeEmpresa: 'Restaurante Teste', ...credentials, email: ' OWNER@Example.com ' })).status, 201);
    assert.equal((await post('/auth/register', { nomeUsuario: 'Outro', nomeEmpresa: 'Outro restaurante', ...credentials })).status, 409);
    const users = await query<{ id: string; empresaId: string; papel: string; senha: string }>(storage, 'SELECT id, empresa_id AS "empresaId", papel, senha FROM usuarios');
    assert.equal(users.length, 1); assert.ok(users[0].empresaId); assert.equal(users[0].papel, 'admin');
    assert.notEqual(users[0].senha, credentials.senha); userId = users[0].id;
    assert.equal((await query(storage, 'SELECT id FROM empresas')).length, 1);
  });
  await t.test('login inválido retorna 401 e logins repetidos criam sessões distintas', async () => {
    assert.equal((await post('/auth/login', { ...credentials, senha: 'senha-incorreta' })).status, 401);
    const [first, second] = await Promise.all([post('/auth/login', credentials), post('/auth/login', { ...credentials, remember: true })]);
    assert.equal(first.status, 200); assert.equal(second.status, 200);
    const cookie = first.headers.get('set-cookie') || '';
    firstCookie = cookie.split(';')[0]; secondCookie = (second.headers.get('set-cookie') || '').split(';')[0];
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=lax/i);
    assert.doesNotMatch(cookie.split(',')[0], /Max-Age/);
    assert.match(second.headers.get('set-cookie') || '', /Max-Age=604800/);
    assert.notEqual(firstCookie, secondCookie); assert.equal((await first.json()).accessToken, undefined);
    const tokens = await query<{ token: string }>(storage, 'SELECT token FROM refresh_tokens');
    assert.equal(tokens.length, 2); assert.ok(tokens.every(row => row.token.length === 64 && !firstCookie.includes(row.token)));
  });
  await t.test('sessão usa identidade do servidor e impede novo restaurante', async () => {
    const response = await fetch(`${origin}/api/v1/private`, { headers: { Cookie: firstCookie, 'user-id': 'forged' } });
    assert.equal(response.status, 200);
    const body = await response.json(); assert.equal(body.user.id, userId); assert.equal(body.user.empresaNome, 'Restaurante Teste'); assert.equal(body.user.senha, undefined);
    assert.equal((await fetch(`${origin}/dashboard`, { headers: { Cookie: firstCookie }, redirect: 'manual' })).status, 200);
    assert.equal((await post('/company', { nomeEmpresa: 'Duplicado' }, firstCookie)).status, 409);
    assert.equal((await post('/auth/refresh', {}, firstCookie)).status, 200);
  });
  await t.test('logout revoga imediatamente apenas a sessão correspondente', async () => {
    assert.equal((await post('/auth/logout', {}, firstCookie, 'https://hostil.invalid')).status, 403);
    const logout = await post('/auth/logout', {}, firstCookie);
    assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie') || '', /Max-Age=0/);
    assert.equal((await fetch(`${origin}/api/v1/private`, { headers: { Cookie: firstCookie } })).status, 401);
    assert.equal((await post('/auth/refresh', {}, firstCookie)).status, 401);
    assert.equal((await fetch(`${origin}/api/v1/private`, { headers: { Cookie: secondCookie } })).status, 200);
  });
  await t.test('conta antiga pode configurar restaurante sem alterar outro usuário', async () => {
    await query(storage, `INSERT INTO usuarios (id,nome,email,senha,papel,empresa_id,created_at,updated_at)
      SELECT '9e332ef0-f09c-4e74-87f5-36108e041f1f','Conta antiga','legacy@example.com',senha,'admin',NULL,created_at,updated_at FROM usuarios LIMIT 1`);
    const login = await post('/auth/login', { ...credentials, email: 'legacy@example.com' });
    assert.equal(login.status, 200);
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    const home = await fetch(`${origin}/dashboard`, { headers: { Cookie: cookie }, redirect: 'manual' });
    assert.equal(home.status, 307); assert.match(home.headers.get('location') || '', /\/home$/);
    assert.equal((await post('/company', { nomeEmpresa: 'Restaurante da conta antiga', empresaId: 'forged' }, cookie)).status, 201);
    assert.equal((await post('/company', { nomeEmpresa: 'Duplicado' }, cookie)).status, 409);
    const oldUser = await (await fetch(`${origin}/api/v1/private`, { headers: { Cookie: cookie } })).json();
    const owner = await (await fetch(`${origin}/api/v1/private`, { headers: { Cookie: secondCookie } })).json();
    assert.notEqual(oldUser.user.empresaId, owner.user.empresaId);
    assert.equal(owner.user.id, userId); assert.equal(owner.user.empresaNome, 'Restaurante Teste');
    await post('/auth/logout', {}, cookie);
  });
  await t.test('restaurante inativo bloqueia sessões existentes e novos logins', async () => {
    await query(storage, `UPDATE empresas SET ativo = FALSE WHERE id = (SELECT empresa_id FROM usuarios WHERE email = 'owner@example.com')`);
    assert.equal((await fetch(`${origin}/api/v1/private`, { headers: { Cookie: secondCookie } })).status, 401);
    assert.equal((await post('/auth/login', credentials)).status, 403);
    await query(storage, 'UPDATE empresas SET ativo = TRUE');
  });
  await t.test('dono gera convite pessoal, cadastro com 6 caracteres aceita como funcionário', async () => {
    assert.equal((await post('/invitations', { email: 'employee@example.com' })).status, 401);
    const response = await post('/invitations', { email: 'employee@example.com', role: 'owner', empresaId: 'forged' }, secondCookie);
    assert.equal(response.status, 201);
    const { path } = await response.json();
    const token = path.split('/').at(-1);
    assert.equal((await fetch(`${origin}${path}`)).status, 200);
    const stored = await query<{ tokenHash: string }>(storage, 'SELECT token_hash AS "tokenHash" FROM restaurant_invitations');
    assert.ok(stored.every(row => row.tokenHash !== token && row.tokenHash.length === 64));
    const ownerTeam = await fetch(`${origin}/dashboard/team`, { headers: { Cookie: secondCookie } });
    assert.equal(ownerTeam.status, 200);
    assert.match(await ownerTeam.text(), /employee@example.com/);
    const wrong = await post('/auth/register', { nomeUsuario: 'Intruso', email: 'wrong@example.com', senha: 'abc123', invitationToken: token });
    assert.equal(wrong.status, 403);
    assert.equal((await query(storage, "SELECT id FROM usuarios WHERE email = 'wrong@example.com'")).length, 0);
    assert.equal((await post('/auth/register', { nomeUsuario: 'Funcionário', email: 'employee@example.com', senha: 'abc123', invitationToken: token, papel: 'admin', role: 'owner' })).status, 201);
    const login = await post('/auth/login', { email: 'employee@example.com', senha: 'abc123' });
    assert.equal(login.status, 200);
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    const employee = await (await fetch(`${origin}/api/v1/private`, { headers: { Cookie: cookie } })).json();
    assert.equal(employee.user.role, 'employee');
    const owner = await (await fetch(`${origin}/api/v1/private`, { headers: { Cookie: secondCookie } })).json();
    assert.equal(employee.user.empresaId, owner.user.empresaId);
    assert.equal((await post('/invitations', { email: 'another@example.com' }, cookie)).status, 403);
    assert.equal((await post('/company', { nomeEmpresa: 'Tentativa' }, cookie)).status, 409);
    assert.equal((await post('/invitations/accept', { token }, cookie)).status, 410);
    const dashboard = await (await fetch(`${origin}/dashboard`, { headers: { Cookie: cookie } })).text();
    assert.doesNotMatch(dashboard, /id="invite-email"/);
    const employeeTeam = await fetch(`${origin}/dashboard/team`, { headers: { Cookie: cookie } });
    assert.equal(employeeTeam.status, 200);
    assert.doesNotMatch(await employeeTeam.text(), /owner@example.com/);
    await post('/auth/logout', {}, cookie);
  });
  await t.test('convites revogados e expirados não criam usuários', async () => {
    const invite = await post('/invitations', { email: 'revoked@example.com' }, secondCookie);
    assert.equal(invite.status, 201);
    const token = (await invite.json()).path.split('/').at(-1);
    const [row] = await query<{ id: string }>(storage, "SELECT id FROM restaurant_invitations WHERE email='revoked@example.com'");
    assert.equal((await fetch(`${origin}/api/v1/invitations/${row.id}`, { method: 'DELETE', headers: { Cookie: secondCookie, Origin: origin } })).status, 200);
    assert.equal((await post('/auth/register', { nomeUsuario: 'Revogado', email: 'revoked@example.com', senha: 'abc123', invitationToken: token })).status, 410);
    const expiring = await post('/invitations', { email: 'expired@example.com' }, secondCookie);
    const expiredToken = (await expiring.json()).path.split('/').at(-1);
    await query(storage, "UPDATE restaurant_invitations SET expires_at='2000-01-01' WHERE email='expired@example.com'");
    assert.equal((await post('/auth/register', { nomeUsuario: 'Expirado', email: 'expired@example.com', senha: 'abc123', invitationToken: expiredToken })).status, 410);
  });
  await t.test('mesma pessoa participa de restaurantes com papéis diferentes e troca com segurança', async () => {
    const login = await post('/auth/login', { ...credentials, email: 'legacy@example.com' });
    assert.equal(login.status, 200);
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    const otherOwner = await (await fetch(`${origin}/api/v1/private`, { headers: { Cookie: cookie } })).json();
    const originalOwner = await (await fetch(`${origin}/api/v1/private`, { headers: { Cookie: secondCookie } })).json();
    const invite = await post('/invitations', { email: credentials.email }, cookie);
    assert.equal(invite.status, 201);
    const { path } = await invite.json();
    const token = path.split('/').at(-1);
    assert.equal((await post('/invitations/accept', { token }, cookie)).status, 403);
    assert.equal((await post('/invitations/accept', { token }, secondCookie)).status, 200);
    const switched = await (await fetch(`${origin}/api/v1/private`, { headers: { Cookie: secondCookie } })).json();
    assert.equal(switched.user.empresaId, otherOwner.user.empresaId); assert.equal(switched.user.role, 'employee');
    assert.equal((await post('/invitations', { email: 'blocked@example.com' }, secondCookie)).status, 403);
    assert.equal((await post('/company/switch', { empresaId: 'forged' }, secondCookie)).status, 403);
    assert.equal((await post('/company/switch', { empresaId: originalOwner.user.empresaId }, secondCookie)).status, 200);
    const restored = await (await fetch(`${origin}/api/v1/private`, { headers: { Cookie: secondCookie } })).json();
    assert.equal(restored.user.role, 'owner');
    // A restaurant owner cannot revoke another restaurant's invitations.
    const [row] = await query<{ id: string }>(storage, "SELECT id FROM restaurant_invitations WHERE email='expired@example.com'");
    assert.equal((await fetch(`${origin}/api/v1/invitations/${row.id}`, { method: 'DELETE', headers: { Cookie: cookie, Origin: origin } })).status, 404);
    await post('/auth/logout', {}, cookie);
  });
  await t.test('reenviar convite normaliza e-mail e invalida o link anterior', async () => {
    const first = await post('/invitations', { email: 'resend@example.com' }, secondCookie);
    const second = await post('/invitations', { email: ' RESEND@EXAMPLE.COM ' }, secondCookie);
    assert.equal(first.status, 201); assert.equal(second.status, 201);
    const oldPath = (await first.json()).path;
    const newPath = (await second.json()).path;
    assert.notEqual(oldPath, newPath);
    const signup = { nomeUsuario: 'Novo funcionário', email: 'resend@example.com', senha: 'abc123' };
    assert.equal((await post('/auth/register', { ...signup, invitationToken: oldPath.split('/').at(-1) })).status, 410);
    assert.equal((await post('/auth/register', { ...signup, invitationToken: newPath.split('/').at(-1) })).status, 201);
    assert.equal((await post('/invitations', { email: signup.email }, secondCookie)).status, 409);
    const pending = await query(storage, "SELECT id FROM restaurant_invitations WHERE email='resend@example.com' AND accepted_at IS NULL AND revoked_at IS NULL");
    assert.equal(pending.length, 0);
  });
  await t.test('aceitação simultânea consome o convite uma única vez', async () => {
    const employeeLogin = await post('/auth/login', { email: 'employee@example.com', senha: 'abc123' });
    assert.equal(employeeLogin.status, 200);
    const employeeCookie = (employeeLogin.headers.get('set-cookie') || '').split(';')[0];
    const otherLogin = await post('/auth/login', { ...credentials, email: 'legacy@example.com' });
    assert.equal(otherLogin.status, 200);
    const otherCookie = (otherLogin.headers.get('set-cookie') || '').split(';')[0];
    const invite = await post('/invitations', { email: 'employee@example.com' }, otherCookie);
    assert.equal(invite.status, 201);
    const token = (await invite.json()).path.split('/').at(-1);
    const results = await Promise.all([post('/invitations/accept', { token }, employeeCookie), post('/invitations/accept', { token }, employeeCookie)]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 410]);
    const memberships = await query(storage, "SELECT id FROM restaurant_members WHERE user_id=(SELECT id FROM usuarios WHERE email='employee@example.com')");
    assert.equal(memberships.length, 2);
    await post('/auth/logout', {}, employeeCookie);
    await post('/auth/logout', {}, otherCookie);
  });
  await t.test('convite e cadastro pelo IP da rede usam a origem visível no celular', async () => {
    const lanHost = `192.168.1.50:${port}`;
    const lanOrigin = `http://${lanHost}`;
    // Preserve Host exactly: Node fetch can replace it with the connection target.
    const phonePost = (path: string, body: unknown, cookie = '', requestOrigin = lanOrigin) => new Promise<Response>((resolve, reject) => {
      const request = httpRequest(`${origin}/api/v1${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Host: lanHost, Origin: requestOrigin, Cookie: cookie, 'Sec-Fetch-Site': 'same-origin' },
      }, response => {
        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(Buffer.from(chunk)));
        response.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode })));
        response.on('error', reject);
      });
      request.on('error', reject);
      request.end(JSON.stringify(body));
    });
    const invitation = await phonePost('/invitations', { email: 'phone@example.com' }, secondCookie);
    assert.equal(invitation.status, 201, await invitation.clone().text());
    const { path } = await invitation.json();
    const token = path.split('/').at(-1);
    const page = await fetch(`${origin}/register?invite=${token}`, { headers: { Host: lanHost, 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36' } });
    assert.equal(page.status, 200); assert.match(await page.text(), /phone@example.com/);
    const signup = { nomeUsuario: 'Pessoa no celular', email: 'phone@example.com', senha: 'abc123', invitationToken: token };
    assert.equal((await phonePost('/auth/register', signup, '', 'https://hostil.invalid')).status, 403);
    const response = await phonePost('/auth/register', signup);
    assert.equal(response.status, 201, await response.clone().text());
    const [member] = await query<{ role: string }>(storage, "SELECT role FROM restaurant_members WHERE user_id=(SELECT id FROM usuarios WHERE email='phone@example.com')");
    assert.equal(member.role, 'employee');
  });
  await t.test('mudança concorrente de papel impede criar e revogar convites com autorização antiga', async () => {
    const identity = (await (await fetch(`${origin}/api/v1/private`, { headers: { Cookie: secondCookie } })).json()).user;
    const invitation = await post('/invitations', { email: 'role-review@example.com' }, secondCookie);
    assert.equal(invitation.status, 201);
    const [target] = await query<{ id: string }>(storage, "SELECT id FROM restaurant_invitations WHERE empresa_id=$1 AND email='role-review@example.com'", [identity.empresaId]);
    const operations = [
      () => post('/invitations', { email: 'blocked-role@example.com' }, secondCookie),
      () => fetch(`${origin}/api/v1/invitations/${target.id}`, { method: 'DELETE', headers: { Cookie: secondCookie, Origin: origin } }),
    ];
    for (const operation of operations) {
      const client = await storage.connect(); let pending: Promise<Response> | undefined;
      try {
        await client.query('BEGIN');
        await client.query("UPDATE restaurant_members SET role='employee' WHERE user_id=$1 AND empresa_id=$2", [identity.id, identity.empresaId]);
        pending = operation();
        let waiting = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          const locks = await query(storage, "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FROM restaurant_members m%WHERE m.user_id=$1%'");
          if (locks.length) { waiting = true; break; }
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.ok(waiting, 'A autorização deve aguardar a alteração do vínculo.');
        await client.query('COMMIT');
        assert.equal((await pending).status, 403);
      } finally {
        await client.query('ROLLBACK'); client.release(); await pending;
        await query(storage, "UPDATE restaurant_members SET role='owner' WHERE user_id=$1 AND empresa_id=$2", [identity.id, identity.empresaId]);
      }
    }
    assert.equal((await query(storage, "SELECT id FROM restaurant_invitations WHERE email='blocked-role@example.com'")).length, 0);
    assert.equal((await query(storage, 'SELECT id FROM restaurant_invitations WHERE id=$1 AND revoked_at IS NULL', [target.id])).length, 1);
  });
  await t.test('edição e exclusão exigem admin do restaurante e senha na exclusão', async () => {
    const account = { email: 'delete-owner@example.com', senha: 'senha-admin-123' };
    assert.equal((await post('/auth/register', { ...account, nomeUsuario: 'Admin', nomeEmpresa: 'Excluir' })).status, 201);
    const login = await post('/auth/login', account);
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    const identity = await (await fetch(`${origin}/api/v1/private`, { headers: { Cookie: cookie } })).json();
    const empresaId = identity.user.empresaId;
    const change = (method: string, body: object, auth = cookie, source = origin) => fetch(`${origin}/api/v1/company`, {
      method, headers: { Cookie: auth, Origin: source, 'Content-Type': 'application/json' }, body: JSON.stringify({ empresaId, ...body }),
    });
    assert.equal((await change('PATCH', { nomeEmpresa: 'Novo nome', cnpj: '' }, '')).status, 401);
    assert.equal((await change('PATCH', { nomeEmpresa: 'Novo nome', cnpj: '' }, cookie, 'https://hostil.invalid')).status, 403);
    assert.equal((await change('PATCH', { nomeEmpresa: 'Novo nome', cnpj: '' }, secondCookie)).status, 409);
    assert.equal((await change('PATCH', { nomeEmpresa: ' ', cnpj: '' })).status, 400);
    assert.equal((await change('PATCH', { nomeEmpresa: 'Novo nome', cnpj: '12.345.678/0001-90' })).status, 200);
    assert.deepEqual(await query(storage, 'SELECT nome,cnpj FROM empresas WHERE id=$1', [empresaId]), [{ nome: 'Novo nome', cnpj: '12345678000190' }]);
    const invite = await post('/invitations', { email: 'delete-employee@example.com' }, cookie);
    const token = (await invite.json()).path.split('/').at(-1);
    assert.equal((await post('/auth/register', { email: 'delete-employee@example.com', senha: 'abc123', nomeUsuario: 'Funcionário', invitationToken: token })).status, 201);
    const employeeLogin = await post('/auth/login', { email: 'delete-employee@example.com', senha: 'abc123' });
    const employeeCookie = (employeeLogin.headers.get('set-cookie') || '').split(';')[0];
    assert.equal((await change('PATCH', { nomeEmpresa: 'Proibido', cnpj: '' }, employeeCookie)).status, 403);
    assert.equal((await change('DELETE', { senha: account.senha }, employeeCookie)).status, 403);
    assert.equal((await change('DELETE', {})).status, 400);
    assert.equal((await change('DELETE', { senha: 'errada' })).status, 403);
    assert.equal((await query(storage, 'SELECT id FROM empresas WHERE id=$1', [empresaId])).length, 1);
    const [expense] = await query<{ id: string }>(storage, `INSERT INTO expenses
      (empresa_id,created_by,updated_by,request_id,description,amount_cents,date,category)
      VALUES ($1,$2,$2,gen_random_uuid(),'Teste de exclusão',1000,'2026-11-01','outros') RETURNING id`, [empresaId, identity.user.id]);
    await query(storage, "INSERT INTO expense_audit (expense_id,empresa_id,actor_id,action) VALUES ($1,$2,$3,'created')", [expense.id, empresaId, identity.user.id]);
    assert.equal((await change('DELETE', { senha: account.senha })).status, 200);
    for (const table of ['empresas', 'restaurant_members', 'restaurant_invitations', 'expenses', 'expense_audit']) {
      assert.equal((await query(storage, `SELECT id FROM ${table} WHERE ${table === 'empresas' ? 'id' : 'empresa_id'}=$1`, [empresaId])).length, 0);
    }
    for (const auth of [cookie, employeeCookie]) {
      const response = await fetch(`${origin}/api/v1/private`, { headers: { Cookie: auth } });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).user.empresaId, null);
    }
    assert.equal((await post('/company', { nomeEmpresa: 'Recomeço' }, cookie)).status, 201);
  });
  await t.test('esgotar os antigos contadores globais não bloqueia outras contas e cabeçalhos de segurança são aplicados', async () => {
    for (const key of ['login:global', 'register:global']) await query(storage,
      `INSERT INTO auth_rate_limits(key,count,window_start) VALUES ($1,99999,$2) ON CONFLICT(key) DO UPDATE SET count=99999,window_start=$2`,
      [createHash('sha256').update(key).digest('hex'), Date.now()]);
    const credentials = { email: 'not-globally-blocked@example.com', senha: 'test-password-123' };
    assert.equal((await post('/auth/register', { ...credentials, nomeUsuario: 'Pessoa legítima', nomeEmpresa: 'Casa independente' })).status, 201);
    const login = await post('/auth/login', credentials);
    assert.equal(login.status, 200);
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    const identity = (await (await fetch(`${origin}/api/v1/private`, { headers: { Cookie: cookie } })).json()).user;
    const exportKey = createHash('sha256').update(`exports:${identity.id}`).digest('hex');
    await query(storage, 'INSERT INTO auth_rate_limits(key,count,window_start) VALUES ($1,61,$2)', [exportKey, Date.now()]);
    assert.equal((await fetch(`${origin}/api/v1/expenses?format=csv`, { headers: { Cookie: cookie } })).status, 429);
    assert.equal((await fetch(`${origin}/api/v1/expenses`, { headers: { Cookie: cookie } })).status, 200);
    await query(storage, 'DELETE FROM auth_rate_limits WHERE key=$1', [exportKey]);
    const response = await fetch(`${origin}/login`);
    assert.ok(response.headers.get('content-security-policy')?.includes("object-src 'none'"));
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
  });
  await t.test('expiração e limitação de tentativas são aplicadas', async () => {
    await query(storage, `UPDATE refresh_tokens SET expires_at = '2000-01-01 00:00:00.000 +00:00'`);
    assert.equal((await fetch(`${origin}/api/v1/private`, { headers: { Cookie: secondCookie } })).status, 401);
    for (let i = 0; i < 5; i++) assert.equal((await post('/auth/login', { email: 'unknown@example.com', senha: credentials.senha })).status, 401);
    assert.equal((await post('/auth/login', { email: ' UNKNOWN@example.com ', senha: credentials.senha })).status, 429);
    const concurrent = await Promise.all(Array.from({ length: 6 }, () => post('/auth/login', { email: 'concurrent@example.com', senha: credentials.senha })));
    assert.deepEqual(concurrent.map(response => response.status).sort(), [401,401,401,401,401,429]);
  });
});
