import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { isolatedDatabase, query } from './postgres-fixture';

test('gastos, resumos e permissões por restaurante', { timeout: 180000 }, async t => {
  const fixture = await isolatedDatabase();
  let stop = async () => {};
  t.after(async () => { try { await stop(); } finally { await fixture.cleanup(); } });
  const portServer = createServer(); portServer.listen(0, '127.0.0.1'); await once(portServer, 'listening');
  const address = portServer.address(); assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  await new Promise<void>(resolve => portServer.close(() => resolve()));
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(address.port), '-H', '127.0.0.1'], {
    env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: fixture.connectionString, APP_ORIGIN: origin }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; server.stdout.on('data', data => { output = (output + data.toString()).slice(-5000); }); server.stderr.on('data', data => { output = (output + data.toString()).slice(-5000); });
  stop = async () => { if (server.exitCode === null) { const closed = once(server, 'exit'); server.kill(); await closed; } };
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(output);
    try { if ((await fetch(`${origin}/login`, { signal: AbortSignal.timeout(3000) })).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, output);
  const api = (path: string, cookie = '', method = 'GET', body?: unknown, requestOrigin = origin) => fetch(`${origin}/api/v1${path}`, {
    method, headers: { Cookie: cookie, Origin: requestOrigin, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const register = async (email: string) => {
    assert.equal((await api('/auth/register', '', 'POST', { nomeUsuario: 'Dono', nomeEmpresa: email.startsWith('other') ? 'Outra casa' : 'Casa principal', email, senha: 'abc123' })).status, 201);
  };
  const login = async (email: string) => { const response = await api('/auth/login', '', 'POST', { email, senha: 'abc123' }); assert.equal(response.status, 200); return (response.headers.get('set-cookie') || '').split(';')[0]; };
  await register('owner@expenses.invalid'); await register('other@expenses.invalid');
  const owner = await login('owner@expenses.invalid'); const other = await login('other@expenses.invalid');
  const invitation = await api('/invitations', owner, 'POST', { email: 'employee@expenses.invalid' }); assert.equal(invitation.status, 201);
  const token = (await invitation.json()).path.split('/').at(-1);
  assert.equal((await api('/auth/register', '', 'POST', { nomeUsuario: 'Funcionário', email: 'employee@expenses.invalid', senha: 'abc123', invitationToken: token })).status, 201);
  const employee = await login('employee@expenses.invalid');
  const ownerUser = (await (await api('/private', owner)).json()).user;
  const employeeUser = (await (await api('/private', employee)).json()).user;
  const period = 'start=2026-10-01&end=2026-10-07';
  const body = { description: 'Hortifruti da semana', amountCents: 12590, date: '2026-10-01', category: 'alimentos', merchant: 'Mercado Central', status: 'paid', paymentMethod: 'pix', notes: 'Compra da cozinha' };
  const firstRequest = randomUUID(); let firstId = ''; let employeeId = '';
  const create = (cookie: string, data: Record<string, unknown> = {}) => api('/expenses', cookie, 'POST', { ...body, requestId: randomUUID(), ...data });
  const list = async (cookie = owner, query = period) => { const response = await api(`/expenses?${query}`, cookie); assert.equal(response.status, 200, await response.clone().text()); return response.json(); };
  await t.test('exige autenticação, origem válida e dados consistentes', async () => {
    assert.equal((await api('/expenses')).status, 401);
    assert.equal((await api('/expenses', owner, 'POST', body, 'https://hostil.invalid')).status, 403);
    for (const data of [{ amountCents: 0 }, { amountCents: -1 }, { amountCents: 10.1 }, { amountCents: '100' }, { date: '2026-02-30' }, { category: 'fraude' }, { requestId: 'invalid' }]) assert.equal((await create(owner, data)).status, 400);
  });
  await t.test('cria em centavos e impede duplicidade de envio', async () => {
    const response = await create(owner, { requestId: firstRequest, empresaId: 'forged', createdBy: employeeUser.id });
    assert.equal(response.status, 201, await response.clone().text()); firstId = (await response.json()).id;
    assert.equal((await create(owner, { requestId: firstRequest })).status, 200);
    assert.equal((await create(owner, { requestId: firstRequest, amountCents: 100 })).status, 409);
    assert.equal((await create(employee, { requestId: firstRequest })).status, 409);
    const expense = (await list()).expenses[0];
    assert.equal(expense.createdBy, ownerUser.id); assert.equal(expense.amountCents, 12590); assert.equal(expense.canManage, true);
    const own = await create(employee, { description: 'Diária da cozinha', amountCents: 5000, category: 'funcionarios', date: '2026-10-02', status: 'pending' });
    assert.equal(own.status, 201); employeeId = (await own.json()).id;
    assert.equal((await create(owner, { description: 'Período anterior', date: '2026-09-25', amountCents: 10000 })).status, 201);
  });
  await t.test('resumo e gráficos usam todos os gastos filtrados e preenchem dias sem gasto', async () => {
    const data = await list();
    assert.equal(data.count, 2); assert.equal(data.summary.totalCents, 17590); assert.equal(data.summary.paidCents, 12590); assert.equal(data.summary.pendingCents, 5000);
    assert.equal(data.summary.previousTotalCents, 10000); assert.equal(data.summary.changePercent, 75.9); assert.equal(data.summary.averageDailyCents, 2513);
    assert.equal(data.series.length, 7); assert.equal(data.series[2].totalCents, 0); assert.equal(data.categories.length, 2);
    const paid = await list(owner, `${period}&status=paid`); assert.equal(paid.count, 1); assert.equal(paid.summary.pendingCents, 0);
    assert.equal((await list(owner, `${period}&category=funcionarios`)).summary.totalCents, 5000);
    assert.equal((await list(owner, `${period}&q=Mercado`)).count, 2);
    assert.equal((await list(owner, `${period}&q=%25`)).count, 0);
    assert.equal((await api('/expenses?start=2026-10-30&end=2026-10-01', owner)).status, 400);
  });
  await t.test('restaurantes permanecem isolados em consultas, alterações e exportações', async () => {
    assert.equal((await list(other)).count, 0);
    assert.equal((await list(other, `${period}&empresaId=${ownerUser.empresaId}`)).count, 0);
    assert.equal((await api(`/expenses/${firstId}`, other, 'PATCH', { ...body, version: 1 })).status, 404);
    assert.equal((await api(`/expenses/${firstId}`, other, 'DELETE', { version: 1 })).status, 404);
    const csv = await (await api(`/expenses?${period}&format=csv`, other)).text(); assert.doesNotMatch(csv, /Hortifruti/);
  });
  await t.test('funcionários alteram apenas os próprios gastos e o dono pode administrar todos', async () => {
    assert.equal((await api(`/expenses/${firstId}`, employee, 'PATCH', { ...body, version: 1 })).status, 403);
    assert.equal((await api(`/expenses/${firstId}`, employee, 'DELETE', { version: 1 })).status, 403);
    const data = { ...body, description: 'Diária corrigida', category: 'funcionarios', amountCents: 6000, date: '2026-10-02' };
    assert.equal((await api(`/expenses/${employeeId}`, employee, 'PATCH', { ...data, version: 1 })).status, 200);
    assert.equal((await api(`/expenses/${employeeId}`, employee, 'PATCH', { ...data, version: 1 })).status, 409);
    assert.equal((await api(`/expenses/${employeeId}`, owner, 'PATCH', { ...data, amountCents: 6500, version: 2 })).status, 200);
    assert.equal((await list()).summary.totalCents, 19090);
  });
  await t.test('edições simultâneas não sobrescrevem alterações e exclusão atualiza os totais', async () => {
    const results = await Promise.all([api(`/expenses/${firstId}`, owner, 'PATCH', { ...body, amountCents: 13000, version: 1 }), api(`/expenses/${firstId}`, owner, 'PATCH', { ...body, amountCents: 13000, version: 1 })]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    assert.equal((await api(`/expenses/${employeeId}`, employee, 'DELETE', { version: 3 })).status, 200);
    assert.equal((await list()).count, 1); assert.equal((await list()).summary.totalCents, 13000);
    assert.equal((await api(`/expenses/${employeeId}`, owner, 'DELETE', { version: 3 })).status, 404);
    const audit = await query<{ action: string }>(fixture.pool, 'SELECT action FROM expense_audit WHERE expense_id=$1 ORDER BY created_at', [employeeId]);
    assert.deepEqual(audit.map(row => row.action), ['created', 'updated', 'updated', 'deleted']);
  });
  await t.test('paginação mantém totais globais e CSV exporta os registros filtrados com segurança', async () => {
    for (let i = 0; i < 17; i++) assert.equal((await create(owner, { description: `Gasto adicional ${i}`, amountCents: 1, category: 'outros' })).status, 201);
    assert.equal((await create(owner, { description: '=HYPERLINK("teste")', merchant: '@Fornecedor', amountCents: 101, notes: 'Texto com ; separador\ne quebra' })).status, 201);
    const first = await list(); const second = await list(owner, `${period}&page=2`);
    assert.equal(first.count, 19); assert.equal(first.expenses.length, 15); assert.equal(second.expenses.length, 4);
    assert.equal(first.summary.totalCents, 13118); assert.equal(second.summary.totalCents, first.summary.totalCents);
    assert.equal((await list(owner, `${period}&page=999`)).filters.page, 2);
    const page = await fetch(`${origin}/dashboard/expenses?${period}`, { headers: { Cookie: owner } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Gasto adicional 16/);
    const response = await api(`/expenses?${period}&format=csv`, owner); assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /text\/csv/);
    const csv = await response.text(); assert.match(csv, /"'=HYPERLINK\(""teste""\)"/); assert.match(csv, /"'@Fornecedor"/); assert.match(csv, /0,01/); assert.match(csv, /Gasto adicional 16/);
  });
  await t.test('criação concorrente com a mesma chave gera um único gasto e uma auditoria', async () => {
    const requestId = randomUUID();
    const responses = await Promise.all([create(owner, { requestId }), create(owner, { requestId })]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]);
    const ids = await Promise.all(responses.map(response => response.json().then(data => data.id)));
    assert.equal(ids[0], ids[1]);
    const audit = await query(fixture.pool, 'SELECT id FROM expense_audit WHERE expense_id=$1', [ids[0]]);
    assert.equal(audit.length, 1);
  });
  await t.test('aspas e comandos SQL em campos e buscas são tratados como dados', async () => {
    const payload = "Fornecedor d'Ávila'); DROP TABLE expenses; --";
    const created = await create(owner, { merchant: payload, description: 'Compra com aspas', amountCents: 9999999999 });
    assert.equal(created.status, 201);
    const id = (await created.json()).id;
    const data = await list(owner, `${period}&q=${encodeURIComponent(payload)}`);
    assert.equal(data.count, 1); assert.equal(data.expenses[0].id, id);
    assert.equal(data.expenses[0].amountCents, 9999999999);
    assert.equal((await list(owner, `${period}&q=${encodeURIComponent("' OR 1=1 --")}`)).count, 0);
    assert.equal((await list(owner, `${period}&q=${encodeURIComponent('\\')}`)).count, 0);
    assert.equal((await api(`/expenses?${period}&category=${encodeURIComponent("' OR 1=1 --")}`, owner)).status, 400);
    assert.ok((await list()).count > 1);
  });

});
