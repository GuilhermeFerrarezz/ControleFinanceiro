import JSZip from 'jszip';
import { parseExpenseCsv, expenseCsv } from '../src/lib/expense-csv';
import type { IExpense } from '../src/models/Expense';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { isolatedDatabase, query } from './postgres-fixture';
import ExcelJS from 'exceljs';

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
  await t.test('ajuda exige sessão e orienta donos e funcionários com atalhos para as telas', async () => {
    const anonymous = await fetch(`${origin}/dashboard/help`, { redirect: 'manual' });
    assert.equal(anonymous.status, 307);
    assert.ok(anonymous.headers.get('location')?.endsWith('/login'));
    for (const [cookie, role] of [[owner, 'Dono'], [employee, 'Funcionário']]) {
      const response = await fetch(`${origin}/dashboard/help`, { headers: { Cookie: cookie } });
      assert.equal(response.status, 200);
      const html = await response.text();
      for (const text of ['Como podemos ajudar?', 'Sua rotina em quatro passos', 'Qual é a sua dúvida?',
        'Importar e exportar', 'Como consultar quantidades e preços dos insumos?', 'Ação do dono']) assert.ok(html.includes(text), text);
      assert.match(html, new RegExp(`Seu acesso: <!-- -->${role}`));
      assert.match(html, /<a(?=[^>]*href="\/dashboard\/help")(?=[^>]*aria-current="page")[^>]*>/);
      for (const href of ['/dashboard/expenses', '/dashboard/catalog', '/dashboard/revenue', '/dashboard/profit', '/dashboard/sheet', '/dashboard/team']) assert.ok(html.includes(`href="${href}"`));
    }
  });
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
    assert.equal(data.summary.previousTotalCents, 10000); assert.equal(data.summary.changePercent, '75.9'); assert.equal(data.summary.averageDailyCents, 2513);
    assert.equal(data.series.length, 7); assert.equal(data.series[2].totalCents, 0); assert.equal(data.categories.length, 2);
    const paid = await list(owner, `${period}&status=paid`); assert.equal(paid.count, 1); assert.equal(paid.summary.pendingCents, 0);
    assert.equal((await list(owner, `${period}&category=funcionarios`)).summary.totalCents, 5000);
    assert.equal((await list(owner, `${period}&q=Mercado`)).count, 2);
    assert.equal((await list(owner, `${period}&q=%25`)).count, 0);
    assert.equal((await api('/expenses?start=2026-10-30&end=2026-10-01', owner)).status, 400);
  });
  await t.test('planilha soma valores por dia e categoria e respeita o restaurante ativo', async () => {
    const url = `${origin}/dashboard/sheet?${period}`;
    const response = await fetch(url, { headers: { Cookie: owner } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<th scope="col" data-sheet-column="alimentos">Alimentos<\/th>/);
    assert.match(html, /<th scope="row">01\/10\/2026<\/th><td><a [^>]*detailCategory=alimentos[^>]*>R\$\s125,90<\/a><\/td>/);
    assert.match(html, /<th scope="row">03\/10\/2026<\/th><td>—<\/td>/);
    const laterPage = await fetch(`${origin}/dashboard/sheet?start=2026-09-25&end=2026-10-31&page=2&sort=highest`, { headers: { Cookie: owner } });
    assert.equal(laterPage.status, 200);
    const laterHtml = await laterPage.text();
    assert.match(laterHtml, /<th scope="col">Dia<\/th><th scope="col" data-sheet-column="alimentos">Alimentos<\/th><th scope="col" data-sheet-column="funcionarios">Funcionários<\/th>/);
    assert.match(laterHtml, /<tfoot><tr><th scope="row">Total do período<\/th><td>R\$\s225,90<\/td><td>R\$\s50,00<\/td>.*<td>R\$\s275,90<\/td><td>—<\/td><td>—<\/td><\/tr><\/tfoot>/);
    const exportUrl = '/expenses/sheet?start=2026-09-25&end=2026-10-31&page=2&sort=manual';
    const exportBody = { empresaId: ownerUser.empresaId, columns: ['funcionarios', 'alimentos'] };
    assert.equal((await api(exportUrl, other, 'POST', exportBody)).status, 409);
    const exportResponse = await api(exportUrl, owner, 'POST', exportBody);
    assert.equal(exportResponse.status, 200, await exportResponse.clone().text());
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await exportResponse.arrayBuffer());
    const exported = book.getWorksheet('Planilha de gastos')!;
    assert.equal(exported.getCell('B1').value, 'Funcionários');
    assert.equal(exported.getCell('C1').value, 'Alimentos');
    assert.deepEqual(exported.getCell('A2').value, new Date('2026-09-25T00:00:00Z'));
    assert.equal(exported.getCell('C2').value, 100);
    assert.equal(exported.rowCount, 39);
    assert.equal(exported.getRow(39).getCell(exported.columnCount - 2).value, 275.9);
    const otherHtml = await (await fetch(url, { headers: { Cookie: other } })).text();
    assert.doesNotMatch(otherHtml, /125,90/);
    const detailUrl = url + '&detailDate=2026-10-01&detailCategory=alimentos';
    const detailHtml = await (await fetch(detailUrl, { headers: { Cookie: owner } })).text();
    assert.match(detailHtml, /<summary><strong>Hortifruti da semana<\/strong>/);
    assert.match(detailHtml, /<dd>Compra da cozinha<\/dd>/);
    const otherDetail = await (await fetch(detailUrl, { headers: { Cookie: other } })).text();
    assert.doesNotMatch(otherDetail, /Compra da cozinha/);
    const anonymous = await fetch(url, { redirect: 'manual' });
    assert.equal(anonymous.headers.get('location'), '/login');
  });
  await t.test('registra faturamento diário, preserva valores na importação e calcula o resultado com todos os gastos', async () => {
    const empresaId = ownerUser.empresaId;
    const input = { mode: 'save', empresaId, date: '2026-10-01', totalCents: 19000 };
    assert.equal((await api('/revenue', employee, 'POST', input)).status, 403);
    assert.equal((await api('/revenue', other, 'POST', input)).status, 409);
    assert.equal((await api('/revenue', owner, 'POST', input, 'https://hostil.invalid')).status, 403);
    assert.equal((await api('/revenue', owner, 'POST', { ...input, totalCents: -1 })).status, 400);
    assert.equal((await api('/revenue', owner, 'POST', input)).status, 200);
    assert.equal((await api('/revenue', owner, 'POST', { ...input, totalCents: 20000 })).status, 200);
    const csv = 'Data;Faturamento (R$)\n01/10/2026;999,00\n02/10/2026;0,00';
    const preview = await api('/revenue', owner, 'POST', { mode: 'preview', empresaId, csv });
    assert.equal(preview.status, 200);
    assert.equal((await preview.json()).count, 2);
    const before = await list(owner, period);
    assert.equal(before.finance.recordedDays, 1);
    const imported = await api('/revenue', owner, 'POST', { mode: 'import', empresaId, csv });
    assert.equal(imported.status, 200, await imported.clone().text());
    assert.deepEqual(await imported.json(), { saved: 1, skipped: 1 });
    const filtered = await list(owner, `${period}&category=funcionarios`);
    assert.equal(filtered.summary.totalCents, 5000);
    assert.equal(filtered.finance.expenseCents, 17590);
    assert.equal(filtered.finance.revenueCents, 20000);
    assert.equal(filtered.finance.profitCents, 2410);
    assert.equal(filtered.finance.series[1].revenueCents, 0);
    assert.equal(filtered.finance.series[1].profitCents, -5000);
    assert.equal(filtered.finance.series[2].profitCents, null);
    assert.equal((await list(other, period)).finance.recordedDays, 0);
    const exported = await (await api(`/revenue?${period}`, owner)).text();
    assert.match(exported, /"01\/10\/2026";"200,00"/);
    assert.match(exported, /"02\/10\/2026";"0,00"/);
    const repeat = await api('/revenue', owner, 'POST', { mode: 'import', empresaId, csv: exported });
    assert.deepEqual(await repeat.json(), { saved: 0, skipped: 2 });
    const workbook = new ExcelJS.Workbook();
    const xlsx = await api(`/expenses?${period}&format=xlsx`, owner);
    assert.equal(xlsx.status, 200);
    await workbook.xlsx.load(await xlsx.arrayBuffer());
    const revenue = workbook.getWorksheet('Faturamento')!;
    assert.equal(revenue.getCell('B2').value, 200);
    assert.equal(revenue.getCell('D2').value, 74.1);
    assert.equal(revenue.getCell('B3').value, 0);
    const sheet = await fetch(`${origin}/dashboard/sheet?${period}`, { headers: { Cookie: owner } });
    assert.match(await sheet.text(), /<td>R\$\s200,00<\/td><td>R\$\s24,10<\/td><\/tr><\/tfoot>/);
    const deletion = { empresaId, date: input.date, totalCents: 20000, confirm: true };
    assert.equal((await api('/revenue', employee, 'DELETE', deletion)).status, 403);
    assert.equal((await api('/revenue', other, 'DELETE', deletion)).status, 409);
    assert.equal((await api('/revenue', owner, 'DELETE', { ...deletion, confirm: false })).status, 400);
    assert.equal((await api('/revenue', owner, 'DELETE', { ...deletion, totalCents: 19000 })).status, 409);
    assert.equal((await api('/revenue', owner, 'DELETE', deletion)).status, 200);
    const after = await list(owner, period);
    assert.equal(after.finance.recordedDays, 1);
    assert.equal(after.finance.series[0].revenueCents, null);
    assert.equal(after.finance.series[1].revenueCents, 0);
    assert.equal(after.summary.totalCents, 17590);
  });
  await t.test('faturamento salva, edita, importa e exporta refeições e pedidos', async () => {
    const empresaId = ownerUser.empresaId;
    const input = { mode: 'save', empresaId, date: '2026-10-04', totalCents: 10000, mealsSold: 12, orderCount: 8, deliveryMeals: 7, dineInMeals: 5 };
    assert.equal((await api('/revenue', owner, 'POST', input)).status, 200);
    assert.equal((await api('/revenue', employee, 'POST', input)).status, 403);
    for (const counts of [{ mealsSold: -1 }, { orderCount: 1.5 }, { mealsSold: 2147483648 }, { deliveryMeals: -1 }, { dineInMeals: 1.5 }]) {
      assert.equal((await api('/revenue', owner, 'POST', { ...input, ...counts })).status, 400);
    }
    const exported = await (await api(`/revenue?${period}`, owner)).text();
    const rows = (await import('../src/lib/revenue-csv')).parseRevenueCsv(exported);
    assert.deepEqual(rows.find(row => row.date === input.date), { date: input.date, totalCents: 10000, mealsSold: 12, orderCount: 8, deliveryMeals: 7, dineInMeals: 5 });
    assert.equal((await api('/revenue', owner, 'DELETE', { ...input, deliveryMeals: 6, confirm: true })).status, 409);
    assert.equal((await api('/revenue', owner, 'DELETE', { ...input, dineInMeals: 4, confirm: true })).status, 409);
    const page = await fetch(`${origin}/dashboard/revenue?${period}`, { headers: { Cookie: owner } });
    const html = await page.text();
    for (const title of ['Evolução dos pedidos', 'Evolução dos marmitex delivery', 'Evolução das refeições no restaurante', 'Total antigo sem divisão']) assert.ok(html.includes(title));
    assert.match(html, /Marmitex delivery de [^"]+Total de 7\./);
    assert.match(html, /Refeições no restaurante de [^"]+Total de 5\./);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await (await api(`/expenses?${period}&format=xlsx`, owner)).arrayBuffer());
    const sheet = workbook.getWorksheet('Faturamento')!;
    const row = sheet.getRows(2, sheet.rowCount - 1)!.find(row => row.getCell(1).value instanceof Date && (row.getCell(1).value as Date).toISOString().startsWith(input.date))!;
    assert.equal(row.getCell(5).value, 12);
    assert.equal(row.getCell(6).value, 8);
    assert.equal(row.getCell(7).value, 7);
    assert.equal(row.getCell(8).value, 5);
    assert.equal((await api('/revenue', owner, 'POST', { ...input, mealsSold: 0, orderCount: null, deliveryMeals: 0, dineInMeals: null })).status, 200);
    assert.equal((await api('/revenue', owner, 'DELETE', { ...input, confirm: true })).status, 409);
    assert.equal((await api('/revenue', owner, 'DELETE', { ...input, mealsSold: 0, orderCount: null, deliveryMeals: 0, dineInMeals: null, confirm: true })).status, 200);
    const csv = 'Data;Faturamento;Refeições/marmitex vendidos;Número de pedidos;Marmitex delivery;Refeições no restaurante\n04/10/2026;100,00;20;10;8;12';
    assert.equal((await api('/revenue', owner, 'POST', { mode: 'import', empresaId, csv })).status, 200);
    const imported = (await import('../src/lib/revenue-csv')).parseRevenueCsv(await (await api(`/revenue?${period}`, owner)).text());
    assert.equal(imported.find(row => row.date === input.date)?.mealsSold, 20);
    assert.equal(imported.find(row => row.date === input.date)?.orderCount, 10);
    assert.equal(imported.find(row => row.date === input.date)?.deliveryMeals, 8);
    assert.equal(imported.find(row => row.date === input.date)?.dineInMeals, 12);
    assert.equal((await api('/revenue', owner, 'DELETE', { ...input, mealsSold: 20, orderCount: 10, deliveryMeals: 8, dineInMeals: 12, confirm: true })).status, 200);
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


  await t.test('importação CSV tem prévia, autoria da sessão e reenvio sem duplicação',async()=>{
    const csv='Data;Descrição;Valor;Categoria;Lançado por\n12/01/2030;Compra importada;99,90;Alimentos;Dono falso\n10/11/2031;Limpeza importada;80,10;Produtos e limpeza;Outro dono';
    assert.equal((await api('/expenses/import','','POST',{csv,mode:'preview'})).status,401);
    assert.equal((await api('/expenses/import',owner,'POST',{csv,mode:'import'},'https://hostil.invalid')).status,403);
    const preview=await api('/expenses/import',employee,'POST',{csv,mode:'preview'});assert.equal(preview.status,200,await preview.clone().text());
    const plan=await preview.json();assert.equal(plan.ready,2);assert.equal(plan.totalErrors,0);assert.equal(plan.totalCents,18000);assert.deepEqual(plan.unknownCategories,[]);
    const first=await api('/expenses/import',employee,'POST',{csv,mode:'import',empresaId:'forged',createdBy:ownerUser.id});
    assert.equal(first.status,200,await first.clone().text());assert.equal((await first.json()).imported,2);
    const data=await list(owner,'start=2030-01-01&end=2031-12-31');assert.equal(data.count,2);assert.equal(data.summary.totalCents,18000);
    assert.equal(data.seriesInterval,'month');assert.equal(data.series.length,24);assert.equal(data.daysWithExpenses,2);
    assert.ok(data.expenses.every((row:{createdBy:string})=>row.createdBy===employeeUser.id));
    const repeated=await Promise.all([api('/expenses/import',owner,'POST',{csv,mode:'import'}),api('/expenses/import',employee,'POST',{csv,mode:'import'})]);
    for(const result of repeated){assert.equal(result.status,200);assert.equal((await result.json()).imported,0);}
    assert.equal((await list(other,'start=2030-01-01&end=2031-12-31')).count,0);
    const bad='Data;Descrição;Valor;Categoria\n12/01/2030;Não salvar parcial;5,00;Alimentos\n31/02/2030;Inválido;10,00;Alimentos';
    const errors=await (await api('/expenses/import',employee,'POST',{csv:bad,mode:'preview'})).json();assert.equal(errors.totalErrors,1);assert.equal(errors.errors[0].line,3);
    assert.equal((await api('/expenses/import',employee,'POST',{csv:bad,mode:'import'})).status,400);
    assert.equal((await list(owner,'start=2030-01-01&end=2031-12-31')).count,2);
    const exported=await (await api('/expenses?start=2030-01-01&end=2031-12-31&format=csv',owner)).text();
    assert.match(exported,/Data: 12\/01\/2030/);
    const roundTrip=await (await api('/expenses/import',owner,'POST',{csv:exported,mode:'preview'})).json();assert.equal(roundTrip.ready,0);assert.equal(roundTrip.duplicates,2);
  });
  await t.test('falha durante importação reverte os gastos e a auditoria do arquivo inteiro',async()=>{
    await query(fixture.pool,`CREATE FUNCTION reject_test_csv() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.description='Bloquear de propósito' THEN RAISE EXCEPTION 'Falha simulada'; END IF; RETURN NEW; END $$`);
    await query(fixture.pool,'CREATE TRIGGER reject_test_csv BEFORE INSERT ON expenses FOR EACH ROW EXECUTE FUNCTION reject_test_csv()');
    try{
      const csv='Data;Descrição;Valor;Categoria\n01/01/2032;Linha que deve reverter;10;Alimentos\n02/01/2032;Bloquear de propósito;10;Alimentos';
      assert.equal((await api('/expenses/import',owner,'POST',{csv,mode:'import'})).status,500);
      assert.equal((await list(owner,'start=2032-01-01&end=2032-12-31')).count,0);
    }finally{await query(fixture.pool,'DROP TRIGGER reject_test_csv ON expenses');await query(fixture.pool,'DROP FUNCTION reject_test_csv()');}
  });
  await t.test('planilha formatada, PDF e gráficos aceitam períodos de vários anos',async()=>{
    const range='start=2000-01-01&end=2100-12-31';
    const all=await list(owner,range);assert.equal(all.seriesInterval,'year');assert.equal(all.series.length,101);
    assert.equal(all.series.reduce((sum:number,row:{totalCents:number})=>sum+row.totalCents,0),all.summary.totalCents);
    const workbookResponse=await api('/expenses?start=2030-01-01&end=2031-12-31&format=xlsx',owner);assert.equal(workbookResponse.status,200);
    const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await workbookResponse.arrayBuffer());
    const sheet=workbook.getWorksheet('Lançamentos')!;assert.ok(sheet.getColumn(1).width!>=16);assert.equal(sheet.getCell('A2').numFmt,'dd/mm/yyyy');
    assert.ok(sheet.getCell('A2').value instanceof Date);assert.equal(sheet.getCell('C2').type,ExcelJS.ValueType.Number);
    assert.equal((await api('/expenses/report?'+range)).status,401);
    for(const cookie of [owner,other]){const pdf=await api('/expenses/report?'+range,cookie);assert.equal(pdf.status,200,await pdf.clone().text());assert.match(pdf.headers.get('content-type')||'',/application\/pdf/);const bytes=Buffer.from(await pdf.arrayBuffer());assert.equal(bytes.subarray(0,5).toString(),'%PDF-');}
  });
  await t.test('filtra e exporta um ano e restaura seu CSV sem duplicar lançamentos', async () => {
    assert.equal((await api('/demo-data',owner,'POST',{action:'restore'})).status,404);
    const rows = Array.from({length:12}, (_, index) =>
      `01/${String(index+1).padStart(2,'0')}/2025;Compra mensal ${index+1};10;Alimentos`);
    const csv = ['Data;Descrição;Valor;Categoria', ...rows].join('\n');
    const imported = await api('/expenses/import',owner,'POST',{csv,mode:'import'});
    assert.equal(imported.status,200);
    assert.equal((await imported.json()).imported,12);
    const examples = await query<{id:string}>(fixture.pool,
      "SELECT id FROM expenses WHERE empresa_id=$1 AND date BETWEEN '2025-01-01' AND '2025-12-31'",[ownerUser.empresaId]);
    const annual = await list(owner,'year=2025');
    assert.equal(annual.count,12); assert.equal(annual.filters.start,'2025-01-01'); assert.equal(annual.filters.end,'2025-12-31');
    assert.equal(annual.series.length,12); assert.equal(annual.seriesInterval,'month'); assert.ok(annual.years.includes(2025));
    assert.ok(annual.expenses.every((row:{date:string})=>row.date.startsWith('2025-')));
    assert.equal(annual.categories.reduce((sum:number,row:{totalCents:number})=>sum+row.totalCents,0),annual.summary.totalCents);
    assert.equal((await list(other,'year=2025')).count,0);
    assert.equal((await api('/expenses?year=2025%20OR%201=1',owner)).status,400);
    const csv2025=await (await api('/expenses?year=2025&format=csv',owner)).text();
    assert.match(csv2025, /Data: \d{2}\/01\/2025/); assert.doesNotMatch(csv2025, /Data: \d{2}\/\d{2}\/2026/);

    await query(fixture.pool,'UPDATE expenses SET deleted_at=now() WHERE id=ANY($1::uuid[])',[examples.map(item=>item.id)]);
    const review=await (await api('/expenses/import',owner,'POST',{csv:csv2025,mode:'preview'})).json();
    assert.equal(review.ready,12);assert.equal(review.duplicates,0);
    assert.equal((await api('/expenses/import',employee,'POST',{csv:csv2025,mode:'import'})).status,400);
    for(let cycle=0;cycle<2;cycle++) {
      const imports=await Promise.all([api('/expenses/import',owner,'POST',{csv:csv2025,mode:'import'}),api('/expenses/import',owner,'POST',{csv:csv2025,mode:'import'})]);
      const counts=[];
      for(const response of imports){assert.equal(response.status,200);counts.push((await response.json()).imported);}
      assert.deepEqual(counts.sort((a,b)=>a-b),[0,12]);
      const restored=await list(owner,'year=2025');assert.equal(restored.count,12);
      assert.ok(restored.expenses.every((row:{id:string;createdBy:string})=>examples.some(item=>item.id===row.id)&&row.createdBy===ownerUser.id));
      const audits=await query(fixture.pool,"SELECT id FROM expense_audit WHERE empresa_id=$1 AND after->>'source'='csv-restore'",[ownerUser.empresaId]);
      assert.equal(audits.length,(cycle+1)*12);
      await query(fixture.pool,'UPDATE expenses SET deleted_at=now() WHERE id=ANY($1::uuid[])',[examples.map(item=>item.id)]);
    }
  });
  await t.test('importação identifica IDs repetidos, inclusive após alterar o conteúdo',async()=>{
    const id=randomUUID();
    const csv=`Data;Descrição;Valor;Categoria;ID\n01/01/2033;Importação com ID externo;10;Alimentos;${id}\n01/01/2033;Importação com ID externo;20;Alimentos;${id}`;
    const preview=await (await api('/expenses/import',owner,'POST',{csv,mode:'preview'})).json();
    assert.equal(preview.ready,1);assert.equal(preview.duplicates,1);assert.equal(preview.totalCents,1000);
    const imported=await api('/expenses/import',owner,'POST',{csv,mode:'import'});
    assert.equal(imported.status,200);assert.equal((await imported.json()).imported,1);
    const replay=await api('/expenses/import',owner,'POST',{csv:csv.replaceAll(';10;',';30;'),mode:'import'});
    assert.equal(replay.status,200);assert.equal((await replay.json()).imported,0);
    assert.equal((await list(owner,'year=2033')).count,1);
  });
  await t.test('CSV sem IDs restaura importação excluída e conserva repetições legítimas',async()=>{
    const csv='Data;Descrição;Valor;Categoria\n01/01/2034;Gasto para restaurar;15;Alimentos\n01/01/2034;Gasto para restaurar;15;Alimentos';
    for(let cycle=0;cycle<2;cycle++) {
      const preview=await (await api('/expenses/import',employee,'POST',{csv,mode:'preview'})).json();assert.equal(preview.ready,2);
      const response=await api('/expenses/import',employee,'POST',{csv,mode:'import'});assert.equal(response.status,200);assert.equal((await response.json()).imported,2);
      const expenses=(await list(owner,'year=2034')).expenses;assert.equal(expenses.length,2);
      for(const row of expenses)assert.equal((await api(`/expenses/${row.id}`,employee,'DELETE',{version:row.version})).status,200);
    }
  });
  await t.test('cadastros por restaurante alimentam busca, categorias, relatórios e importação', async () => {
    const entry = { empresaId: ownerUser.empresaId, kind: 'merchant', name: 'Atacadão' };
    assert.equal((await api('/catalog')).status, 401);
    assert.equal((await api('/catalog', '', 'POST', entry)).status, 401);
    assert.equal((await api('/catalog', other, 'POST', entry)).status, 409);
    assert.equal((await api('/catalog', owner, 'POST', entry, 'https://hostil.invalid')).status, 403);
    assert.equal((await api('/catalog', owner, 'POST', { ...entry, name: ' ' })).status, 400);
    assert.equal((await api('/catalog', owner, 'POST', { ...entry, kind: 'invalid' })).status, 400);
    const created = await api('/catalog', owner, 'POST', entry);
    assert.equal(created.status, 200); const merchant = await created.json();
    const duplicate = await api('/catalog', employee, 'POST', { ...entry, name: '  ATACADAO  ' });
    assert.equal(duplicate.status, 200); assert.deepEqual(await duplicate.json(), merchant);
    const parallel = await Promise.all(['Feira Local','feira local'].map(name=>api('/catalog',owner,'POST',{...entry,name})));
    assert.equal((await parallel[0].json()).id, (await parallel[1].json()).id);
    const categoryResponse = await api('/catalog', employee, 'POST', { ...entry, kind: 'category', name: 'Marketing digital' });
    assert.equal(categoryResponse.status, 200); const category = await categoryResponse.json();
    const defaultResponse = await api('/catalog', owner, 'POST', { ...entry, kind: 'category', name: 'ALIMENTOS' });
    assert.equal((await defaultResponse.json()).id, 'alimentos');
    const catalog = await (await api('/catalog', employee)).json();
    assert.equal(catalog.merchants.filter((row: { name: string })=>row.name==='Atacadão').length, 1);
    assert.ok(catalog.categories.some((row: { id: string })=>row.id===category.id));
    const otherCatalog = await (await api('/catalog', other)).json();
    assert.equal(otherCatalog.merchants.length, 0);
    assert.ok(!otherCatalog.categories.some((row: { id: string })=>row.id===category.id));
    assert.equal((await create(other,{category:category.id})).status,400);
    assert.equal((await create(owner,{category:randomUUID()})).status,400);
    const expense = await create(employee, { category: category.id, merchant: merchant.name, description:'Campanha de lançamento', date:'2039-01-01' });
    assert.equal(expense.status,201); const expenseId = (await expense.json()).id;
    assert.equal((await create(employee,{merchant:'Local avulso',date:'2039-01-02'})).status,201);
    assert.equal((await (await api('/catalog',owner)).json()).merchants.length,2);
    const params = `start=2039-01-01&end=2039-01-31&category=${category.id}`;
    for (const q of ['Atac','Campanha']) {
      const data=await list(owner,`${params}&q=${q}`);
      assert.equal(data.count,1); assert.equal(data.categories[0].category,category.id);
      assert.ok(data.categoryOptions.some((row:{label:string})=>row.label==='Marketing digital'));
    }
    const dashboard = await fetch(`${origin}/dashboard?${params}`,{headers:{Cookie:owner}});
    assert.equal(dashboard.status,200); const html=await dashboard.text();
    assert.match(html,/id="filter-search"/); assert.match(html,/Marketing digital/);
    assert.equal((await fetch(`${origin}/dashboard/catalog`,{headers:{Cookie:employee}})).status,200);
    const csv = await (await api(`/expenses?${params}&format=csv`,owner)).text();
    assert.match(csv,/Marketing digital/);
    const preview=await api('/expenses/import',owner,'POST',{csv,mode:'preview'});
    assert.equal(preview.status,200); const review=await preview.json();
    assert.equal(review.totalErrors,0); assert.equal(review.preview[0].categoryLabel,'Marketing digital');
    const freshCsv='Data;Descrição;Valor;Categoria;Local\n02/01/2039;Anúncio novo;20;Marketing digital;Atacadão';
    const imported=await api('/expenses/import',employee,'POST',{csv:freshCsv,mode:'import'});
    assert.equal(imported.status,200); assert.equal((await imported.json()).imported,1);
    const xlsx=await api(`/expenses?${params}&format=xlsx`,owner);
    assert.equal(xlsx.status,200); const workbook=new ExcelJS.Workbook();
    await workbook.xlsx.load(await xlsx.arrayBuffer());
    assert.equal(workbook.getWorksheet('Lançamentos')!.getCell('D2').text,'Marketing digital');
    assert.equal(workbook.getWorksheet('Resumo')!.getCell('B4').text,'Marketing digital');
    assert.equal((await api(`/expenses/report?${params}`,owner)).status,200);
    assert.equal((await api(`/expenses/${expenseId}`,employee,'PATCH',{...body,category:category.id,version:1})).status,200);
  });
  await t.test('edição e exclusão de cadastros preservam lançamentos e isolam restaurantes', async () => {
    const base={empresaId:ownerUser.empresaId,kind:'category',name:'Categoria editável'};
    const category=await (await api('/catalog',owner,'POST',base)).json();
    const created=await create(owner,{category:category.id,date:'2040-01-01',merchant:'Local original'});
    assert.equal(created.status,201);const id=(await created.json()).id;
    const update={...base,id:category.id,previousName:category.name,name:'Categoria renomeada'};
    assert.equal((await api('/catalog','','PATCH',update)).status,401);
    assert.equal((await api('/catalog',other,'PATCH',update)).status,409);
    assert.equal((await api('/catalog',owner,'PATCH',update,'https://hostil.invalid')).status,403);
    assert.equal((await api('/catalog',owner,'PATCH',{...update,name:'Alimentos'})).status,400);
    assert.equal((await api('/catalog',employee,'PATCH',update)).status,200);
    assert.equal((await api('/catalog',owner,'PATCH',update)).status,400);
    const params='start=2040-01-01&end=2040-01-01';
    assert.match(await (await api(`/expenses?${params}&format=csv`,owner)).text(),/Categoria renomeada/);
    const deletion={...update,previousName:'Categoria renomeada',confirm:true};
    assert.equal((await api('/catalog',owner,'DELETE',{...deletion,confirm:false})).status,400);
    assert.equal((await api('/catalog',owner,'DELETE',deletion)).status,200);
    const data=await list(owner,params);assert.equal(data.count,1);
    assert.equal(data.categoryOptions.find((item:{id:string})=>item.id===category.id).archived,true);
    const reset = await list(owner, `${params}&category=${category.id}&merchant=Local%20exclu%C3%ADdo`);
    assert.equal(reset.filters.category, '');
    assert.equal(reset.filters.merchant, '');
    assert.equal(reset.count, 1);
    const sheet = await fetch(`${origin}/dashboard/sheet?${params}`, { headers: { Cookie: owner } });
    assert.equal(sheet.status, 200);
    const sheetHtml = await sheet.text();
    assert.match(sheetHtml, /<th scope="col" data-sheet-column="[^"]+">Categoria renomeada<small>Arquivada<\/small><\/th>/);
    assert.doesNotMatch(sheetHtml, new RegExp(`<option value="${category.id}"`));
    assert.equal((await create(owner,{category:category.id})).status,400);
    assert.equal((await api(`/expenses/${id}`,owner,'PATCH',{...body,category:category.id,date:'2040-01-01',version:1})).status,200);
    const standard={empresaId:ownerUser.empresaId,kind:'category',id:'alimentos',previousName:'Alimentos',name:'Insumos da cozinha'};
    assert.equal((await api('/catalog',owner,'PATCH',standard)).status,200);
    assert.equal((await (await api('/catalog',other)).json()).categories.find((item:{id:string})=>item.id==='alimentos').label,'Alimentos');
    assert.equal((await api('/catalog',owner,'DELETE',{...standard,previousName:standard.name,confirm:true})).status,200);
    assert.equal((await create(owner)).status,400);
    const restored=await (await api('/catalog',owner,'POST',{...base,name:standard.name})).json();assert.equal(restored.id,'alimentos');
    assert.equal((await api('/catalog',owner,'PATCH',{...standard,previousName:standard.name,name:'Alimentos'})).status,200);
    const merchant=await (await api('/catalog',owner,'POST',{...base,kind:'merchant',name:'Local original'})).json();
    const merchantEdit={empresaId:ownerUser.empresaId,kind:'merchant',id:merchant.id,previousName:merchant.name,name:'Local novo'};
    assert.equal((await api('/catalog',owner,'PATCH',merchantEdit)).status,200);
    assert.equal((await api('/catalog',owner,'DELETE',{...merchantEdit,previousName:'Local novo',confirm:true})).status,200);
    assert.ok(!(await (await api('/catalog',owner)).json()).merchants.some((item:{id:string})=>item.id===merchant.id));
    assert.equal((await list(owner, `${params}&merchant=Local%20novo`)).filters.merchant, '');
    const restoredMerchant=await (await api('/catalog',owner,'POST',{...base,kind:'merchant',name:'Local novo'})).json();
    assert.equal(restoredMerchant.id,merchant.id);
  });
  await t.test('importação só cadastra categorias autorizadas e reverte tudo quando há erros', async () => {
    const csv='Data;Descrição;Valor;Categoria\n01/02/2040;Assinatura mensal;30;Serviços digitais\n02/02/2040;Outra assinatura;20;SERVICOS DIGITAIS';
    const before=await query(fixture.pool,"SELECT id FROM restaurant_catalog WHERE empresa_id=$1",[ownerUser.empresaId]);
    let preview=await (await api('/expenses/import',owner,'POST',{csv,mode:'preview'})).json();
    assert.equal(preview.unknownCategories.length,1);assert.equal(preview.totalErrors,2);
    assert.equal(preview.categoryPending,2);assert.deepEqual(preview.errors,[]);
    const mixed=await (await api('/expenses/import',owner,'POST',{csv:csv+'\n03/02/2040;Valor incorreto;abc;Alimentos',mode:'preview'})).json();
    assert.equal(mixed.categoryPending,2);assert.equal(mixed.totalErrors,3);assert.equal(mixed.errors.length,1);assert.equal(mixed.errors[0].line,4);
    const createCategories=preview.unknownCategories;
    preview=await (await api('/expenses/import',owner,'POST',{csv,mode:'preview',createCategories})).json();
    assert.equal(preview.totalErrors,0);assert.equal(preview.ready,2);
    assert.equal(preview.categoryPending,0);
    assert.equal((await query(fixture.pool,"SELECT id FROM restaurant_catalog WHERE empresa_id=$1",[ownerUser.empresaId])).length,before.length);
    assert.equal((await api('/expenses/import',owner,'POST',{csv,mode:'import'})).status,400);
    assert.equal((await api('/expenses/import',owner,'POST',{csv,mode:'import',createCategories:true})).status,400);
    const invalid='Data;Descrição;Valor;Categoria\n01/02/2040;Novo serviço;30;Categoria temporária\n02/02/2040;Valor inválido;abc;Categoria temporária';
    assert.equal((await api('/expenses/import',owner,'POST',{csv:invalid,mode:'import',createCategories:['Categoria temporária']})).status,400);
    assert.equal((await query(fixture.pool,"SELECT id FROM restaurant_catalog WHERE empresa_id=$1 AND name='Categoria temporária'",[ownerUser.empresaId])).length,0);
    const result=await api('/expenses/import',employee,'POST',{csv,mode:'import',createCategories});
    assert.equal(result.status,200);assert.equal((await result.json()).imported,2);
    const repeat=await api('/expenses/import',owner,'POST',{csv,mode:'import',createCategories});
    assert.equal(repeat.status,200);assert.equal((await repeat.json()).imported,0);
    const catalog=(await (await api('/catalog',owner)).json()).categories;
    const category=catalog.find((item:{label:string})=>item.label.toLowerCase().includes('digitais'));
    assert.ok(category);
    assert.equal((await list(other,'start=2040-02-01&end=2040-02-02')).count,0);
  });
  await t.test('admin exclui um período inteiro com confirmação, isolamento e auditoria', async () => {
    const deletion = { empresaId: ownerUser.empresaId, start: '2038-02-01', end: '2038-02-28', confirm: true };
    const ids: string[] = [];
    for (let index = 0; index < 18; index++) {
      const response = await create(index % 2 ? employee : owner, {
        date: index % 2 ? deletion.start : deletion.end,
        description: `Exclusão do período ${index}`, category: index % 2 ? 'outros' : 'alimentos',
        status: index % 2 ? 'pending' : 'paid',
      });
      assert.equal(response.status, 201); ids.push((await response.json()).id);
    }
    const outside = await create(owner, { date: '2038-03-01' });
    const outsideId = (await outside.json()).id;
    const anotherRestaurant = await create(other, { date: deletion.start });
    const otherId = (await anotherRestaurant.json()).id;
    const alreadyDeleted = await create(owner, { date: deletion.start });
    const oldId = (await alreadyDeleted.json()).id;
    assert.equal((await api(`/expenses/${oldId}`, owner, 'DELETE', { version: 1 })).status, 200);
    assert.equal((await api('/expenses', '', 'DELETE', deletion)).status, 401);
    assert.equal((await api('/expenses', employee, 'DELETE', deletion)).status, 403);
    assert.equal((await api('/expenses', other, 'DELETE', deletion)).status, 409);
    assert.equal((await api('/expenses', owner, 'DELETE', deletion)).status, 400);
    assert.equal((await api('/expenses', owner, 'DELETE', { ...deletion, senha: 'incorreta' })).status, 403);
    assert.equal((await api('/expenses', owner, 'DELETE', deletion, 'https://hostil.invalid')).status, 403);
    for (const invalid of [
      { confirm: false }, { confirm: 'true' }, { start: '' }, { end: null },
      { start: '2038-02-30' }, { start: '2038-03-01' },
    ]) assert.equal((await api('/expenses', owner, 'DELETE', { ...deletion, ...invalid })).status, 400);
    const before = await list(owner, 'start=2038-02-01&end=2038-02-28');
    assert.equal(before.count, 18);
    const adminPage = await (await fetch(`${origin}/dashboard/expenses`, { headers: { Cookie: owner } })).text();
    const employeePage = await (await fetch(`${origin}/dashboard/expenses`, { headers: { Cookie: employee } })).text();
    assert.match(adminPage, /Excluir lançamentos do período/);
    assert.match(adminPage, /delete-period-password/);
    assert.doesNotMatch(employeePage, /Excluir lançamentos do período/);
    // Concurrent retries must not delete/audit the same record twice.
    const responses = await Promise.all([
      api('/expenses', owner, 'DELETE', { ...deletion, senha: 'abc123', category: 'alimentos', page: 1 }),
      api('/expenses', owner, 'DELETE', { ...deletion, senha: 'abc123' }),
    ]);
    for (const response of responses) assert.equal(response.status, 200, await response.clone().text());
    const results = await Promise.all(responses.map(response => response.json()));
    assert.deepEqual(results.map(result => result.deleted).sort((a, b) => a - b), [0, 18]);
    const after = await list(owner, 'start=2038-02-01&end=2038-02-28');
    assert.equal(after.count, 0); assert.equal(after.summary.totalCents, 0);
    const audits = await query<{ actorId: string; before: { version: number }; after: { version: number; deletedAt: string } }>(fixture.pool,
      `SELECT actor_id AS "actorId",before,after FROM expense_audit WHERE expense_id=ANY($1::uuid[]) AND action='deleted'`, [ids]);
    assert.equal(audits.length, 18);
    for (const audit of audits) {
      assert.equal(audit.actorId, ownerUser.id); assert.equal(audit.before.version, 1);
      assert.equal(audit.after.version, 2); assert.ok(audit.after.deletedAt);
    }
    assert.equal((await query(fixture.pool, "SELECT id FROM expense_audit WHERE expense_id=$1 AND action='deleted'", [oldId])).length, 1);
    assert.equal((await query(fixture.pool, 'SELECT id FROM expenses WHERE id=ANY($1::uuid[]) AND deleted_at IS NULL', [[outsideId, otherId]])).length, 2);
    assert.equal((await api('/expenses', owner, 'DELETE', { ...deletion, senha: 'abc123', start: '2038-03-01', end: '2038-03-01' })).status, 200);
    assert.equal((await query(fixture.pool, 'SELECT id FROM expenses WHERE id=$1 AND deleted_at IS NULL', [outsideId])).length, 0);
  });
  await t.test('identificadores de outro restaurante não liberam painel, exportações ou troca de sessão', async () => {
    const otherUser = (await (await api('/private', other)).json()).user;
    const marker = 'SEGREDO-OUTRO-RESTAURANTE-2051';
    const created = await create(other, { date: '2051-04-01', description: marker });
    assert.equal(created.status, 201);
    const id = (await created.json()).id;
    const range = 'start=2051-04-01&end=2051-04-01';
    assert.equal((await list(other, range)).count, 1);
    for (const cookie of [owner, employee]) {
      assert.equal((await api('/company/switch', cookie, 'POST', { empresaId: otherUser.empresaId })).status, 403);
      for (const path of ['/expenses?' + range, '/expenses?' + range + '&format=csv', '/expenses/report?' + range, '/catalog']) {
        assert.equal((await api(path + (path.includes('?') ? '&' : '?') + 'expectedEmpresaId=' + otherUser.empresaId, cookie)).status, 409);
      }
      const json = await api('/expenses?' + range + '&empresaId=' + otherUser.empresaId, cookie);
      assert.equal(json.status, 200);
      const data = await json.json();
      assert.equal(data.count, 0); assert.deepEqual(data.products, []);
      const csv = await api('/expenses?' + range + '&format=csv&empresaId=' + otherUser.empresaId, cookie);
      assert.equal(csv.status, 200); assert.ok(!(await csv.text()).includes(marker));
      assert.equal((await api('/expenses/sheet?' + range, cookie, 'POST', { empresaId: otherUser.empresaId, columns: ['alimentos'] })).status, 409);
      assert.equal((await api(`/expenses/${id}`, cookie, 'PATCH', { ...body, version: 1 })).status, 404);
      assert.equal((await api(`/expenses/${id}`, cookie, 'DELETE', { version: 1 })).status, 404);
    }
    assert.equal((await list(other, range)).count, 1);
    // Failed reauthentication cannot delete any remaining rows, even after a correct password.
    const deletion = { empresaId: ownerUser.empresaId, start: '2051-04-01', end: '2051-04-01', confirm: true };
    assert.equal((await create(owner, { date: deletion.start })).status, 201);
    for (let attempt = 0; attempt < 2; attempt++) await api('/expenses', owner, 'DELETE', { ...deletion, senha: 'incorreta' });
    assert.equal((await api('/expenses', owner, 'DELETE', { ...deletion, senha: 'abc123' })).status, 429);
    assert.equal((await list(owner, range)).count, 1);
  });
  await t.test('auditoria financeira reconcilia centavos entre banco, filtros, gráficos e Excel', async () => {
    await register('audit@expenses.invalid');
    const cookie = await login('audit@expenses.invalid');
    const actor = (await (await api('/private', cookie)).json()).user;
    const dates = ['2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01', '2024-03-02'];
    const categories = ['Alimentos', 'Funcionários', 'Bebidas'];
    const amounts = Array.from({ length: 300 }, (_, index) => index % 17 === 0 ? 9999999999 : index * 37 + 1);
    const entries = amounts.map((cents, index) => `${dates[index % 5]};Auditoria ${index};${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')};${categories[index % 3]};${index % 2 ? 'A pagar' : 'Pago'}`);
    entries.push('2024-02-26;Fora antes;0,16;Alimentos;Pago', '2024-03-03;Fora depois;99999999,99;Alimentos;Pago');
    const csv = ['Data;Descrição;Valor;Categoria;Situação', ...entries].join('\n');
    const imported = await api('/expenses/import', cookie, 'POST', { mode: 'import', csv });
    assert.equal(imported.status, 200, await imported.clone().text());
    const expected = amounts.reduce((sum, value) => sum + BigInt(value), BigInt(0));
    const sales = [0, 12345, 1, 9999999999];
    for (const [index, cents] of sales.entries()) {
      assert.equal((await api('/revenue', cookie, 'POST', { mode: 'save', empresaId: actor.empresaId, date: dates[index], totalCents: cents })).status, 200);
    }
    const range = 'start=2024-02-27&end=2024-03-02';
    const data = await list(cookie, range);
    assert.equal(BigInt(data.summary.totalCents), expected);
    assert.equal(data.count, 300);
    assert.equal(BigInt(data.summary.paidCents) + BigInt(data.summary.pendingCents), expected);
    for (const collection of [data.categories, data.series]) {
      assert.equal(collection.reduce((sum: bigint, row: { totalCents: number }) => sum + BigInt(row.totalCents), BigInt(0)), expected);
    }
    assert.equal(data.summary.averageDailyCents, Number(expected / BigInt(5) + (expected % BigInt(5) >= BigInt(3) ? BigInt(1) : BigInt(0))));
    const revenue = sales.reduce((sum, value) => sum + BigInt(value), BigInt(0));
    assert.equal(BigInt(data.finance.revenueCents), revenue);
    assert.equal(BigInt(data.finance.profitCents), revenue - expected);
    assert.equal(data.finance.recordedDays, 4);
    for (const [index, date] of dates.entries()) {
      const cost = amounts.reduce((sum, value, position) => position % 5 === index ? sum + BigInt(value) : sum, BigInt(0));
      const point = data.finance.series[index];
      assert.equal(point.date, date);
      assert.equal(BigInt(point.expenseCents), cost);
      assert.equal(point.profitCents, index < sales.length ? Number(BigInt(sales[index]) - cost) : null);
    }
    const paid = await list(cookie, range + '&status=paid');
    assert.equal(paid.summary.totalCents, data.summary.paidCents);
    assert.deepEqual(paid.finance, data.finance);
    const stored = await query<{ cents: string }>(fixture.pool, `SELECT SUM(amount_cents)::text AS cents FROM expenses WHERE empresa_id=$1 AND date BETWEEN '2024-02-27' AND '2024-03-02' AND deleted_at IS NULL`, [actor.empresaId]);
    assert.equal(stored[0].cents, String(expected));
    const response = await api('/expenses/sheet?' + range, cookie, 'POST', { empresaId: actor.empresaId, columns: ['alimentos', 'funcionarios', 'bebidas'] });
    assert.equal(response.status, 200, await response.clone().text());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await response.arrayBuffer());
    const sheet = workbook.getWorksheet('Planilha de gastos')!;
    assert.equal(Math.round(Number(sheet.getRow(7).getCell(sheet.columnCount - 2).value) * 100), Number(expected));
    assert.equal(Math.round(Number(sheet.getRow(7).getCell(sheet.columnCount).value) * 100), Number(revenue - expected));
  });
  await t.test('produtos persistem, somam além da paginação e respeitam edição, exclusão e restaurante', async () => {
    const items = [{ name: 'Carne bovina', quantity: 1.25, unit: 'kg', amountCents: 4500 }, { name: 'Arroz', quantity: 2, unit: 'pacote', amountCents: 2000 }];
    const catalog = (await (await api('/catalog', owner)).json()).products;
    const registered = items.map(item => ({ ...item, productId: catalog.find((product: { name: string }) => product.name === item.name).id }));
    const purchase = { description: 'Compra BH', date: '2040-05-10', amountCents: 10000, items };
    const requestId = randomUUID();
    const created = await create(owner, { ...purchase, requestId });
    assert.equal(created.status, 201, await created.clone().text());
    const id = (await created.json()).id;
    assert.equal((await create(owner, { ...purchase, requestId })).status, 200);
    assert.equal((await create(owner, { ...purchase, requestId, items: [{ ...items[0], quantity: 2 }] })).status, 409);
    assert.equal((await create(owner, { ...purchase, requestId, items: [] })).status, 409);
    for (let index = 0; index < 15; index++) assert.equal((await create(owner, purchase)).status, 201);
    assert.equal((await create(owner, { ...purchase, items: [], amountCents: 1000 })).status, 201);
    const range = 'start=2040-05-01&end=2040-05-31';
    let data = await list(owner, range);
    assert.equal(data.expenses.length, 15);
    assert.equal(data.count, 17);
    assert.equal(data.summary.totalCents, 161000);
    const meat = data.products.find((item: { name: string }) => item.name === 'Carne bovina');
    assert.equal(meat.quantity, 20); assert.equal(meat.unit, 'kg'); assert.equal(meat.amountCents, 72000); assert.equal(meat.purchases, 16); assert.equal(meat.productId, registered[0].productId); assert.equal(meat.averagePriceCents, '3600');
    assert.equal((await list(owner, range + '&q=Carne')).count, 16);
    assert.equal((await list(owner, range + '&q=%25')).count, 0);
    assert.deepEqual((await list(other, range)).products, []);
    const csv = await (await api('/expenses?' + range + '&format=csv', owner)).text();
    assert.match(csv, /Carne bovina/);
    const changed = [{ name: 'carne bovina', quantity: 500, unit: 'g', amountCents: 3000 }];
    assert.equal((await api(`/expenses/${id}`, owner, 'PATCH', { ...body, ...purchase, items: changed, version: 1 })).status, 200);
    data = await list(owner, range);
    assert.equal(data.products.find((item: { name: string }) => item.name === 'Carne bovina').quantity, 19.25);
    assert.equal(data.products.some((item: { unit: string }) => item.unit === 'g'), false);
    const audit = await query<{ before: { items: unknown }; after: { items: unknown } }>(fixture.pool, "SELECT before,after FROM expense_audit WHERE expense_id=$1 AND action='updated'", [id]);
    assert.deepEqual(audit[0].before.items, registered); assert.deepEqual(audit[0].after.items, [{ ...changed[0], name: 'Carne bovina', productId: registered[0].productId }]);
    assert.equal((await api(`/expenses/${id}`, owner, 'DELETE', { version: 2 })).status, 200);
    data = await list(owner, range);
    assert.equal(data.products.find((item: { name: string }) => item.name === 'Carne bovina').quantity, 18.75);
    assert.equal(data.products.some((item: { unit: string }) => item.unit === 'g'), false);
  });
  await t.test('cadastro de produtos vem pronto, evita duplicados e mantém gráficos após renomear e excluir', async () => {
    const catalog = (await (await api('/catalog', owner)).json()).products;
    const rice = catalog.find((item: { name: string }) => item.name === 'Arroz');
    const beans = catalog.find((item: { name: string }) => item.name === 'Feijão');
    assert.equal(rice.defaultUnit, 'kg'); assert.ok(beans);
    assert.equal((await (await api('/catalog', owner, 'POST', { empresaId: ownerUser.empresaId, kind: 'product', name: '  FEIJAO ' })).json()).id, beans.id);
    const payload = { empresaId: ownerUser.empresaId, kind: 'product', name: 'Filé de tilápia', defaultUnit: 'kg' };
    assert.equal((await api('/catalog', other, 'POST', payload)).status, 409);
    assert.equal((await api('/catalog', owner, 'POST', { ...payload, defaultUnit: 'invalid' })).status, 400);
    const product = await (await api('/catalog', employee, 'POST', payload)).json();
    assert.equal(product.defaultUnit, 'kg');
    const otherProducts = (await (await api('/catalog', other)).json()).products;
    assert.ok(!otherProducts.some((item: { id: string }) => item.id === product.id));
    const foreignRice = otherProducts.find((item: { name: string }) => item.name === 'Arroz');
    const purchase = { date: '2041-06-10', amountCents: 5000, items: [{ productId: product.id, name: product.name, unit: 'kg', quantity: 2, amountCents: 4000 }] };
    assert.equal((await create(owner, { ...purchase, items: [{ ...purchase.items[0], productId: foreignRice.id }] })).status, 400);
    assert.equal((await create(owner, { ...purchase, items: [{ ...purchase.items[0], productId: undefined, name: 'Não cadastrado' }] })).status, 400);
    const response = await create(owner, purchase); assert.equal(response.status, 201);
    const id = (await response.json()).id;
    const update = { ...payload, id: product.id, previousName: product.name, name: 'Tilápia em filé' };
    assert.equal((await api('/catalog', owner, 'PATCH', update)).status, 200);
    const range = 'start=2041-06-01&end=2041-06-30';
    let data = await list(owner, range);
    assert.equal(data.products[0].productId, product.id); assert.equal(data.products[0].name, update.name);
    assert.equal(data.products[0].amountCents, 4000); assert.equal(data.productDaily[0].totalCents, 4000);
    assert.equal((await list(owner, range + '&q=' + encodeURIComponent('Tilápia em filé'))).count, 1);
    const html = await (await fetch(`${origin}/dashboard?${range}`, { headers: { Cookie: owner } })).text();
    assert.match(html, /O peso de cada produto/); assert.match(html, /Produtos que mais pesam na conta/); assert.match(html, /Evolução das compras detalhadas/);
    assert.equal((await api('/catalog', employee, 'DELETE', { ...update, previousName: update.name, confirm: true })).status, 200);
    assert.equal((await create(owner, purchase)).status, 400);
    assert.equal((await api(`/expenses/${id}`, owner, 'PATCH', { ...body, ...purchase, version: 1, notes: 'Preserva produto arquivado' })).status, 200);
    data = await list(owner, range); assert.equal(data.products[0].amountCents, 4000);
    const restored = await (await api('/catalog', owner, 'POST', { ...payload, name: update.name })).json();
    assert.equal(restored.id, product.id);
  });
  await t.test('lançamentos mostram ritmo e lista; detalhes por produto permanecem na visão geral', async () => {
    const html = await (await fetch(`${origin}/dashboard/expenses?${period}`, { headers: { Cookie: owner } })).text();
    assert.match(html, /O ritmo dos gastos/); assert.match(html, /Lançamentos do período/);
    assert.doesNotMatch(html, /id="product-summary-title"/); assert.doesNotMatch(html, /id="categories-title"/);
  });
  await t.test('CSV, Excel e PDF preservam compras detalhadas, exemplos e totais na ida e volta', async () => {
    const custom = await (await api('/catalog', owner, 'POST', { empresaId: ownerUser.empresaId, kind: 'product', name: '=Ingrediente "especial"; caseiro', defaultUnit: 'kg' })).json();
    const catalog = await (await api('/catalog', owner)).json();
    const rice = catalog.products.find((item: { name: string }) => item.name === 'Arroz');
    const items = [{ productId: custom.id, name: custom.name, quantity: 1.125, unit: 'kg', amountCents: 6000 }, { productId: rice.id, name: rice.name, quantity: 500, unit: 'g', amountCents: 2500 }];
    const response = await create(owner, { date: '2044-04-10', description: 'Compra detalhada da revisão', amountCents: 10000, items });
    assert.equal(response.status, 201); const id = (await response.json()).id;
    await query(fixture.pool, "UPDATE expenses SET demo_key='review-example' WHERE id=$1", [id]);
    assert.equal((await create(owner, { date: '2044-04-11', description: 'Compra apenas pelo total', amountCents: 1000, status: 'pending' })).status, 201);
    const range = 'start=2044-04-01&end=2044-04-30';
    const data = await list(owner, range);
    assert.equal(data.summary.totalCents, 11000); assert.equal(data.products.reduce((total: number, item: { amountCents: number }) => total + item.amountCents, 0), 8500);
    const csv = await (await api('/expenses?' + range + '&format=csv', owner)).text();
    const parsed = parseExpenseCsv(csv, ownerUser.empresaId, data.categoryOptions);
    assert.deepEqual(parsed.issues, []); assert.equal(parsed.rows.length, 2);
    assert.deepEqual(parsed.rows.find(row => row.sourceId === id)!.input.items, items);
    const xlsx = await api('/expenses?' + range + '&format=xlsx', owner);
    assert.equal(xlsx.status, 200); const book = new ExcelJS.Workbook(); await book.xlsx.load(await xlsx.arrayBuffer());
    assert.equal(book.getWorksheet('Resumo')!.getCell('B8').value, 110);
    const products = book.getWorksheet('Produtos')!; assert.equal(products.rowCount, 3);
    assert.equal(products.getCell('D2').value, custom.name); assert.equal(products.getCell('D2').type, ExcelJS.ValueType.String);
    assert.equal(products.getCell('E2').value, 1.125); assert.equal(products.getCell('F3').value, 'g'); assert.equal(products.getCell('G2').value, 60);
    const encodedItems = book.getWorksheet('Lançamentos')!.getColumn(11).values.find(value => typeof value === 'string' && value.includes(custom.id));
    assert.deepEqual(JSON.parse(String(encodedItems)), items);
    const pdf = await api('/expenses/report?' + range, owner); assert.equal(pdf.status, 200); assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
    const again = await api('/expenses/import', owner, 'POST', { mode: 'import', csv }); assert.equal(again.status, 200); assert.equal((await again.json()).duplicates, 2);
    const renamed = 'Ingrediente especial revisado';
    assert.equal((await api('/catalog', owner, 'PATCH', { empresaId: ownerUser.empresaId, kind: 'product', id: custom.id, previousName: custom.name, name: renamed })).status, 200);
    assert.equal((await api('/catalog', owner, 'DELETE', { empresaId: ownerUser.empresaId, kind: 'product', id: custom.id, previousName: renamed, confirm: true })).status, 200);
    assert.equal((await api(`/expenses/${id}`, owner, 'DELETE', { version: 1 })).status, 200);
    const restored = await api('/expenses/import', owner, 'POST', { mode: 'import', csv }); assert.equal(restored.status, 200); assert.equal((await restored.json()).imported, 1);
    const after = await list(owner, range); const saved = after.expenses.find((row: { id: string }) => row.id === id);
    assert.equal(after.summary.totalCents, 11000); assert.equal(saved.isDemo, true); assert.equal(saved.createdBy, ownerUser.id); assert.equal(saved.version, 3);
    assert.deepEqual(saved.items, [{ ...items[0], name: renamed }, items[1]]);
    const copy = await api('/expenses/import', other, 'POST', { mode: 'import', csv }); assert.equal(copy.status, 200); assert.equal((await copy.json()).imported, 2);
    const copied = await list(other, range); assert.equal(copied.summary.totalCents, 11000);
    const copiedProduct = copied.products.find((item: { name: string }) => item.name === custom.name);
    assert.ok(copiedProduct); assert.notEqual(copiedProduct.productId, custom.id);
    assert.equal((await (await api('/expenses/import', other, 'POST', { mode: 'import', csv })).json()).duplicates, 2);
  });
  await t.test('falha na importação de produtos reverte também os novos cadastros', async () => {
    const prototype = { date: '2045-01-01', amountCents: 1000, category: 'alimentos', merchant: 'Exemplo', status: 'paid', paymentMethod: 'pix', authorName: 'Autor', notes: '' };
    const csv = expenseCsv(['Importação válida', 'Importação com falha'].map((description, index) => ({ ...prototype, id: randomUUID(), description, items: [{ name: `Ingrediente temporário ${index}`, quantity: 1, unit: 'un', amountCents: 900 }] }) as IExpense));
    await query(fixture.pool, `CREATE FUNCTION review_import_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.description='Importação com falha' THEN RAISE EXCEPTION 'rollback'; END IF; RETURN NEW; END $$`);
    await query(fixture.pool, 'CREATE TRIGGER review_import_failure BEFORE INSERT ON expenses FOR EACH ROW EXECUTE FUNCTION review_import_failure()');
    try {
      assert.equal((await api('/expenses/import', owner, 'POST', { mode: 'import', csv })).status, 500);
      assert.equal((await query(fixture.pool, "SELECT id FROM restaurant_catalog WHERE empresa_id=$1 AND name LIKE 'Ingrediente temporário %'", [ownerUser.empresaId])).length, 0);
      assert.equal((await list(owner, 'start=2045-01-01&end=2045-01-31')).count, 0);
    } finally {
      await query(fixture.pool, 'DROP TRIGGER review_import_failure ON expenses'); await query(fixture.pool, 'DROP FUNCTION review_import_failure()');
    }
  });
  await t.test('consultas, arquivos e ações de abas antigas rejeitam restaurante divergente', async () => {
    const stale = randomUUID();
    for (const path of ['/expenses?' + period, '/expenses?' + period + '&format=csv', '/expenses?' + period + '&format=xlsx', '/expenses/report?' + period, '/revenue?' + period, '/catalog?']) {
      assert.equal((await api(path + '&expectedEmpresaId=' + stale, owner)).status, 409, path);
    }
    assert.equal((await api('/invitations?expectedEmpresaId=' + stale, owner, 'POST', { email: 'stale@example.invalid' })).status, 409);
    assert.equal((await api('/invitations/' + randomUUID() + '?expectedEmpresaId=' + stale, owner, 'DELETE')).status, 409);
    assert.equal((await api('/members/' + randomUUID() + '?expectedEmpresaId=' + stale, owner, 'DELETE')).status, 409);
    const created = await create(owner, { date: '2046-01-01' }); const id = (await created.json()).id;
    assert.equal((await api('/expenses/' + id, owner, 'DELETE', { version: 1, expectedEmpresaId: stale })).status, 409);
    assert.equal((await list(owner, 'start=2046-01-01&end=2046-01-31')).count, 1);
  });
  await t.test('insumos convertem medidas, preservam embalagem histórica e calculam preço ponderado', async () => {
    const createProduct = await api('/catalog', owner, 'POST', { empresaId: ownerUser.empresaId, kind: 'product', name: 'Arroz ensacado para análise', defaultUnit: 'pacote', packageContent: { quantity: 5, unit: 'kg' } });
    assert.equal(createProduct.status, 200); const product = await createProduct.json();
    assert.deepEqual(product.packageContent, { quantity: 5, unit: 'kg' });
    const item = { productId: product.id, name: product.name, quantity: 2, unit: 'pacote', amountCents: 5000, packageContent: product.packageContent };
    const first = await create(owner, { description: 'Pacotes de arroz', date: '2049-01-01', amountCents: 5000, items: [item] }); assert.equal(first.status, 201); const firstId = (await first.json()).id;
    const metadata = { empresaId: ownerUser.empresaId, kind: 'product', id: product.id, previousName: product.name, name: product.name, defaultUnit: 'pacote', packageContent: { quantity: 10, unit: 'kg' }, previousProduct: { defaultUnit: 'pacote', packageContent: product.packageContent } };
    assert.equal((await api('/catalog', owner, 'PATCH', metadata)).status, 200);
    assert.equal((await api('/catalog', owner, 'PATCH', metadata)).status, 400);
    assert.equal((await create(owner, { date: '2049-01-02', amountCents: 400, items: [{ ...item, unit: 'g', quantity: 500, amountCents: 400, packageContent: undefined }] })).status, 201);
    assert.equal((await create(owner, { date: '2049-01-03', amountCents: 1500, items: [{ ...item, quantity: 1, amountCents: 1500, packageContent: { quantity: 2, unit: 'kg' } }] })).status, 201);
    assert.equal((await create(owner, { date: '2049-01-04', amountCents: 900, items: [{ ...item, quantity: 3, amountCents: 900, packageContent: undefined }] })).status, 201);
    const range = 'start=2049-01-01&end=2049-01-31';
    const data = await list(owner, range), normalized = data.products.find((row: { unit: string }) => row.unit === 'kg');
    assert.equal(normalized.quantityText, '12.5'); assert.equal(normalized.amountCents, 6900); assert.equal(normalized.averagePriceCents, '552'); assert.equal(normalized.purchases, 3);
    assert.equal(normalized.recentPrices[0].priceCents, '750'); assert.equal(normalized.recentPrices[1].priceCents, '800');
    assert.equal(data.products.find((row: { unit: string }) => row.unit === 'pacote').quantityText, '3');
    assert.deepEqual(data.expenses.find((row: { id: string }) => row.id === firstId).items[0].packageContent, { quantity: 5, unit: 'kg' });
    assert.deepEqual(data.ingredientDaily.filter((row: { unit: string }) => row.unit === 'kg').map((row: { quantity: string }) => row.quantity), ['10', '0.5', '2']);
    const xlsx = await api('/expenses?' + range + '&format=xlsx', owner); assert.equal(xlsx.status, 200);
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await xlsx.arrayBuffer());
    const ingredients = book.getWorksheet('Insumos')!;
    assert.equal(ingredients.getCell('B2').value, 12.5); assert.equal(ingredients.getCell('E2').value, 5.52);
    const csv = await (await api('/expenses?' + range + '&format=csv', owner)).text();
    const exported = parseExpenseCsv(csv, ownerUser.empresaId);
    assert.deepEqual(exported.issues, []); assert.deepEqual(exported.rows.find(row => row.sourceId === firstId)!.input.items![0].packageContent, product.packageContent);
    assert.equal((await api('/expenses/' + firstId, owner, 'DELETE', { version: 1 })).status, 200);
    assert.equal((await api('/expenses/import', owner, 'POST', { mode: 'import', csv })).status, 200);
    assert.equal((await list(owner, range)).products.find((row: { unit: string }) => row.unit === 'kg').quantityText, '12.5');
    const otherProducts = (await (await api('/catalog', other)).json()).products;
    assert.ok(!otherProducts.some((row: { id: string }) => row.id === product.id));
    assert.equal((await api('/catalog', owner, 'POST', { empresaId: ownerUser.empresaId, kind: 'product', name: 'Embalagem inválida', defaultUnit: 'kg', packageContent: { quantity: 5, unit: 'kg' } })).status, 400);
  });
  await t.test('ZIP exporta mais de 10 mil gastos em partes reimportáveis sem perda ou duplicação', async () => {
    await query(fixture.pool, `INSERT INTO expenses (empresa_id,created_by,updated_by,request_id,description,amount_cents,date,category)
      SELECT $1,$2,$2,gen_random_uuid(),'Gasto para exportação ' || n,1,'2048-01-01','alimentos' FROM generate_series(1,10001) n`, [ownerUser.empresaId, ownerUser.id]);
    const product = (await (await api('/catalog', owner)).json()).products.find((row: { name: string }) => row.name === 'Arroz');
    const items = [{ productId: product.id, name: product.name, quantity: 2, unit: 'pacote', amountCents: 5000, packageContent: { quantity: 5, unit: 'kg' } }];
    assert.equal((await create(owner, { date: '2048-01-02', description: 'Compra detalhada do ZIP', amountCents: 5000, items })).status, 201);
    const range = 'start=2048-01-01&end=2048-01-31';
    assert.equal((await api('/expenses?' + range + '&format=csv', owner)).status, 400);
    assert.equal((await api('/expenses?' + range + '&format=csv-zip')).status, 401);
    assert.equal((await api('/expenses?' + range + '&format=csv-zip&expectedEmpresaId=' + randomUUID(), owner)).status, 409);
    const response = await api('/expenses?' + range + '&format=csv-zip', owner); assert.equal(response.status, 200, await response.clone().text());
    assert.equal(response.headers.get('content-type'), 'application/zip');
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const files = Object.keys(zip.files).filter(name => name.endsWith('.csv')).sort(); assert.equal(files.length, 6);
    const manifest = JSON.parse(await zip.file('manifesto.json')!.async('string')); assert.equal(manifest.lancamentos, 10002); assert.equal(manifest.totalCentavos, 15001);
    const ids: string[] = [];
    let detailedFound = false;
    for (const name of files) {
      const csv = await zip.file(name)!.async('string'); assert.ok(Buffer.byteLength(csv, 'utf8') <= 2 * 1024 * 1024);
      const parsed = parseExpenseCsv(csv, ownerUser.empresaId); assert.deepEqual(parsed.issues, []); assert.ok(parsed.rows.length <= 2000);
      ids.push(...parsed.rows.map(row => row.sourceId!));
      const detailed = parsed.rows.find(row => row.input.description === 'Compra detalhada do ZIP');
      if (detailed) { detailedFound = true; assert.deepEqual(detailed.input.items, items); }
      const imported = await api('/expenses/import', other, 'POST', { mode: 'import', csv }); assert.equal(imported.status, 200, await imported.clone().text()); assert.equal((await imported.json()).imported, parsed.rows.length);
    }
    assert.ok(detailedFound); assert.equal(ids.length, 10002); assert.equal(new Set(ids).size, ids.length);
    const copied = await list(other, range); assert.equal(copied.count, 10002); assert.equal(copied.summary.totalCents, 15001);
    const firstPart = await zip.file(files[0])!.async('string');
    const repeated = await api('/expenses/import', other, 'POST', { mode: 'import', csv: firstPart }); assert.equal(repeated.status, 200); assert.equal((await repeated.json()).imported, 0);
    const empty = await JSZip.loadAsync(await (await api('/expenses?start=2055-01-01&end=2055-01-01&format=csv-zip', owner)).arrayBuffer());
    assert.equal(Object.keys(empty.files).filter(name => name.endsWith('.csv')).length, 0);
  });
  await t.test('estoque integra compras, embalagens, custos, consumo concorrente e auditoria sem misturar restaurantes', async () => {
    const empresaId = ownerUser.empresaId;
    assert.equal((await api('/inventory')).status,401);
    assert.equal((await api('/inventory',owner,'POST',{},'https://hostil.invalid')).status,403);
    const response = await api('/catalog',owner,'POST',{ empresaId,kind:'product',name:'Arroz do estoque teste',defaultUnit:'pacote',packageContent:{quantity:5,unit:'kg'},trackStock:true,minimum:'4',location:'Despensa',suppliers:['Mercado principal'],initialQuantity:'1',requestId:randomUUID() });
    assert.equal(response.status,200,await response.clone().text());
    const productId = (await response.json()).id;
    const read = async () => { const response = await api('/inventory',owner);assert.equal(response.status,200,await response.clone().text());return response.json(); };
    const product = async () => (await read()).products.find((item:{id:string}) => item.id === productId);
    assert.equal(Number((await product()).balance),1);
    const otherId = (await (await api('/private',other)).json()).user.empresaId;
    assert.equal((await api('/inventory',other,'POST',{empresaId:otherId,action:'configure',productId,unit:'kg'})).status,400);
    assert.equal((await api(`/inventory?expectedEmpresaId=${otherId}`,owner)).status,409);
    const item = {productId,name:'Arroz do estoque teste',quantity:2,unit:'pacote',packageContent:{quantity:5,unit:'kg'},amountCents:6000,stock:true};
    const requestId = randomUUID();
    const receipt = await create(owner,{items:[item],amountCents:6000,requestId});
    assert.equal(receipt.status,201,await receipt.clone().text());const expenseId = (await receipt.json()).id;
    assert.equal((await create(owner,{items:[item],amountCents:6000,requestId})).status,200);
    assert.equal(Number((await product()).balance),11);
    assert.equal((await create(owner,{items:[{...item,stock:false,unit:'g',quantity:500,packageContent:undefined,amountCents:500}],amountCents:500})).status,201);
    assert.equal(Number((await product()).balance),11);
    assert.equal((await product()).averageCents,'619');
    const edit = { ...body,items:[{...item,quantity:1,amountCents:3000}],amountCents:3000,version:1 };
    assert.equal((await api(`/expenses/${expenseId}`,owner,'PATCH',edit)).status,200);
    assert.equal(Number((await product()).balance),6);
    const move = { empresaId,productId,action:'consumption',quantity:'2',reason:'Preparo do almoço',date:'2026-10-01',requestId:randomUUID() };
    assert.equal((await api('/inventory',employee,'POST',move)).status,200);
    assert.equal((await api('/inventory',employee,'POST',move)).status,200);
    assert.equal((await api('/inventory',employee,'POST',{...move,quantity:'1'})).status,400);
    assert.equal(Number((await product()).balance),4);
    const concurrent = await Promise.all([1,2].map(() => api('/inventory',employee,'POST',{...move,quantity:'3',requestId:randomUUID()})));
    assert.deepEqual(concurrent.map(response => response.status).sort(),[200,400]);
    assert.equal(Number((await product()).balance),1);
    const removal = await api(`/expenses/${expenseId}`,owner,'DELETE',{version:2});
    assert.equal(removal.status,400,await removal.clone().text());
    assert.equal(Number((await product()).balance),1);
    assert.equal((await api(`/expenses/${expenseId}`,owner,'PATCH',{...edit,items:[{...item,quantity:1,amountCents:3000,stock:false}],version:2})).status,400);
    const incompatible = await create(owner,{amountCents:100,items:[{...item,unit:'un',packageContent:undefined,quantity:1,amountCents:100}]});
    assert.equal(incompatible.status,400);
    const count = { ...move,action:'count',quantity:'0',expectedBalance:'4',requestId:randomUUID() };
    assert.equal((await api('/inventory',owner,'POST',count)).status,400);
    assert.equal((await api('/inventory',owner,'POST',{...count,expectedBalance:'1'})).status,200);
    assert.equal(Number((await product()).balance),0);
    assert.equal((await api('/inventory',owner,'POST',{...count,expectedBalance:'1'})).status,200);
    assert.equal((await api('/inventory',owner,'POST',{empresaId,productId,action:'configure',unit:'L'})).status,400);
    assert.ok((await product()).purchasedFrom.some((vendor:{name:string}) => vendor.name === body.merchant));
    const history = (await read()).movements;
    assert.ok(history.some((entry:{source:string;author:string}) => entry.source === 'consumption' && entry.author === 'Funcionário'));
    assert.ok(history.some((entry:{expenseId:string}) => entry.expenseId === expenseId));
    const foreign = await (await api('/inventory',other)).json();assert.ok(!foreign.products.some((entry:{id:string}) => entry.id === productId));
    const html = await (await fetch(`${origin}/dashboard/inventory`,{headers:{Cookie:owner}})).text();
    assert.ok(html.includes('Histórico de movimentações'));assert.ok(html.includes('Arroz do estoque teste'));
    const csv = await (await api('/expenses?start=2026-10-01&end=2026-10-01&format=csv',owner)).text();
    const exported = parseExpenseCsv(csv,empresaId);
    assert.ok(exported.rows.some(row => row.input.items?.some(entry => entry.productId === productId && entry.stock)));
    await api('/inventory',owner,'POST',{...move,action:'entry',quantity:'5',reason:'Reposição para conferência',requestId:randomUUID()});
    assert.equal((await api(`/expenses/${expenseId}`,owner,'DELETE',{version:2})).status,200);
    assert.equal(Number((await product()).balance),0);
  });
  await t.test('revogação concorrente impede criar, editar ou excluir gastos com acesso antigo',async()=>{
    const created=await create(employee,{description:'Teste de revogação concorrente'});
    assert.equal(created.status,201);const id=(await created.json()).id;
    for(const operation of [()=>create(employee),()=>api(`/expenses/${id}`,employee,'PATCH',{...body,version:1}),()=>api(`/expenses/${id}`,employee,'DELETE',{version:1})]) {
      const client=await fixture.pool.connect();
      let pending:Promise<Response>|undefined;
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM restaurant_members WHERE user_id=$1 AND empresa_id=$2',[employeeUser.id,ownerUser.empresaId]);
        pending=operation();
        let waiting=false;
        for(let attempt=0;attempt<100;attempt++) {
          const rows=await query(fixture.pool,"SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FROM restaurant_members WHERE user_id=$1%' ");
          if(rows.length){waiting=true;break;}
          await new Promise(resolve=>setTimeout(resolve,20));
        }
        assert.ok(waiting,'a gravação deve aguardar a decisão sobre o vínculo');
        await client.query('COMMIT');
        assert.equal((await pending).status,403);
      } finally {
        await client.query('ROLLBACK');client.release();
        await pending;
        await query(fixture.pool,"INSERT INTO restaurant_members (user_id,empresa_id,role) VALUES ($1,$2,'employee') ON CONFLICT DO NOTHING",[employeeUser.id,ownerUser.empresaId]);
      }
    }
    assert.equal((await list(owner,`${period}&q=revogação`)).expenses[0].version,1);
  });
  await t.test('remoção revoga acesso, protege donos e preserva a autoria e outros restaurantes', async () => {
    const members = await query<{id:string;userId:string;role:string}>(fixture.pool,'SELECT id,user_id AS "userId",role FROM restaurant_members WHERE empresa_id=$1',[ownerUser.empresaId]);
    const employeeMember = members.find(row=>row.userId===employeeUser.id)!;
    const ownerMember = members.find(row=>row.role==='owner')!;
    const created = await create(employee,{description:'Compra com autoria preservada',amountCents:4990});
    assert.equal(created.status,201); const expenseId = (await created.json()).id;
    assert.equal((await api(`/members/${employeeMember.id}`,'','DELETE')).status,401);
    assert.equal((await api(`/members/${ownerMember.id}`,employee,'DELETE')).status,403);
    assert.equal((await api(`/members/${employeeMember.id}`,other,'DELETE')).status,404);
    assert.equal((await api(`/members/${ownerMember.id}`,owner,'DELETE')).status,400);
    assert.equal((await api(`/members/${employeeMember.id}`,owner,'DELETE',undefined,'https://hostil.invalid')).status,403);
    // The same account keeps access to a different restaurant.
    const otherCompany = (await (await api('/private',other)).json()).user.empresaId;
    await query(fixture.pool,"INSERT INTO restaurant_members (user_id,empresa_id,role) VALUES ($1,$2,'employee')",[employeeUser.id,otherCompany]);
    const otherEmployeeCookie = await login('employee@expenses.invalid');
    assert.equal((await api('/company/switch',otherEmployeeCookie,'POST',{empresaId:otherCompany})).status,200);
    assert.equal((await api(`/members/${employeeMember.id}`,owner,'DELETE')).status,200);
    assert.equal((await api('/private',employee)).status,401);
    assert.equal((await create(employee)).status,401);
    assert.equal((await api('/private',otherEmployeeCookie)).status,200);
    const record = (await list(owner,`${period}&q=autoria`)).expenses.find((row:{id:string})=>row.id===expenseId);
    assert.ok(record); assert.equal(record.createdBy,employeeUser.id); assert.equal(record.authorName,'Funcionário');
    assert.equal((await api(`/members/${employeeMember.id}`,owner,'DELETE')).status,404);
    // Re-admission is possible through a new invitation, with the original history intact.
    const invite = await api('/invitations',owner,'POST',{email:'employee@expenses.invalid'});
    assert.equal(invite.status,201); const token=(await invite.json()).path.split('/').at(-1);
    assert.equal((await api('/invitations/accept',otherEmployeeCookie,'POST',{token})).status,200);
  });

});
