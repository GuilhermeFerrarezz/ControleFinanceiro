import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, copyFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import sqlite3 from 'sqlite3';
import { migrateDatabase } from '../src/lib/migrations';

async function query<T = Record<string, unknown>>(file: string, sql: string): Promise<T[]> {
  const db = new sqlite3.Database(file);
  try { return await new Promise<T[]>((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows as T[]))); }
  finally { await new Promise<void>((resolve, reject) => db.close(error => error ? reject(error) : resolve())); }
}

test('migrações e autenticação HTTP com banco isolado', { timeout: 180_000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'restaurante-auth-'));
  let stopServer = async () => {};
  t.after(async () => {
    await stopServer();
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    await rm(dir, { recursive: true, force: true });
  });
  await t.test('migração preserva banco existente e é idempotente', async () => {
    try { await access('database.sqlite'); } catch { return; }
    const copy = join(dir, 'legacy.sqlite');
    await copyFile('database.sqlite', copy);
    const before = await query(copy, 'SELECT id, nome, senha FROM usuarios ORDER BY id');
    await migrateDatabase(copy); await migrateDatabase(copy);
    assert.deepEqual(await query(copy, 'SELECT id, nome, senha FROM usuarios ORDER BY id'), before);
    assert.deepEqual(await query(copy, 'PRAGMA foreign_key_check'), []);
    const columns = await query<{ name: string; type: string }>(copy, 'PRAGMA table_info(usuarios)');
    assert.notEqual(columns.find(column => column.name === 'empresaId')?.type, 'INTEGER');
  });
  const storage = join(dir, 'test.sqlite');
  await t.test('migração reverte alterações quando há e-mails conflitantes', async () => {
    const conflict = join(dir, 'conflict.sqlite');
    await migrateDatabase(conflict);
    await query(conflict, 'DELETE FROM schema_migrations');
    await query(conflict, 'DROP INDEX usuarios_email_normalized');
    await query(conflict, `INSERT INTO usuarios (id,nome,email,senha,papel,createdAt,updatedAt) VALUES
      ('one','Um','duplicate@example.com','hash','admin','2026-01-01','2026-01-01'),
      ('two','Dois',' DUPLICATE@example.com ','hash','admin','2026-01-01','2026-01-01')`);
    const before = await query(conflict, 'SELECT * FROM usuarios ORDER BY id');
    await assert.rejects(migrateDatabase(conflict), /duplicados/);
    assert.deepEqual(await query(conflict, 'SELECT * FROM usuarios ORDER BY id'), before);
    assert.equal((await query(conflict, 'SELECT * FROM schema_migrations')).length, 0);
  });
  await migrateDatabase(storage);
  await migrateDatabase(storage);
  const portServer = createServer();
  portServer.listen(0, '127.0.0.1'); await once(portServer, 'listening');
  const address = portServer.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  await new Promise<void>(resolve => portServer.close(() => resolve()));
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port), '-H', '127.0.0.1'], {
    env: { ...process.env, NODE_ENV: 'production', DATABASE_STORAGE: storage, APP_ORIGIN: origin }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
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
    const users = await query<{ id: string; empresaId: string; papel: string; senha: string }>(storage, 'SELECT id, empresaId, papel, senha FROM usuarios');
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
    const tokens = await query<{ token: string }>(storage, 'SELECT token FROM "refresh-tokens"');
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
    await query(storage, `INSERT INTO usuarios (id,nome,email,senha,papel,empresaId,createdAt,updatedAt)
      SELECT '9e332ef0-f09c-4e74-87f5-36108e041f1f','Conta antiga','legacy@example.com',senha,'admin',NULL,createdAt,updatedAt FROM usuarios LIMIT 1`);
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
    await query(storage, `UPDATE empresas SET ativo = 0 WHERE id = (SELECT empresaId FROM usuarios WHERE email = 'owner@example.com')`);
    assert.equal((await fetch(`${origin}/api/v1/private`, { headers: { Cookie: secondCookie } })).status, 401);
    assert.equal((await post('/auth/login', credentials)).status, 403);
    await query(storage, 'UPDATE empresas SET ativo = 1');
  });
  await t.test('expiração e limitação de tentativas são aplicadas', async () => {
    await query(storage, `UPDATE "refresh-tokens" SET expiresAt = '2000-01-01 00:00:00.000 +00:00'`);
    assert.equal((await fetch(`${origin}/api/v1/private`, { headers: { Cookie: secondCookie } })).status, 401);
    for (let i = 0; i < 5; i++) assert.equal((await post('/auth/login', { email: 'unknown@example.com', senha: credentials.senha })).status, 401);
    assert.equal((await post('/auth/login', { email: ' UNKNOWN@example.com ', senha: credentials.senha })).status, 429);
  });
});
