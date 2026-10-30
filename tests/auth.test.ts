import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { migrateDatabase } from '../src/lib/migrations';

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
    env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: fixture.connectionString, APP_ORIGIN: '' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
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
  await t.test('expiração e limitação de tentativas são aplicadas', async () => {
    await query(storage, `UPDATE refresh_tokens SET expires_at = '2000-01-01 00:00:00.000 +00:00'`);
    assert.equal((await fetch(`${origin}/api/v1/private`, { headers: { Cookie: secondCookie } })).status, 401);
    for (let i = 0; i < 5; i++) assert.equal((await post('/auth/login', { email: 'unknown@example.com', senha: credentials.senha })).status, 401);
    assert.equal((await post('/auth/login', { email: ' UNKNOWN@example.com ', senha: credentials.senha })).status, 429);
    const concurrent = await Promise.all(Array.from({ length: 6 }, () => post('/auth/login', { email: 'concurrent@example.com', senha: credentials.senha })));
    assert.deepEqual(concurrent.map(response => response.status).sort(), [401,401,401,401,401,429]);
  });
});
