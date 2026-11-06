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
    assert.doesNotMatch(employeePage, /Excluir lançamentos do período/);
    // Concurrent retries must not delete/audit the same record twice.
    const responses = await Promise.all([
      api('/expenses', owner, 'DELETE', { ...deletion, category: 'alimentos', page: 1 }),
      api('/expenses', owner, 'DELETE', deletion),
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
    assert.equal((await api('/expenses', owner, 'DELETE', { ...deletion, start: '2038-03-01', end: '2038-03-01' })).status, 200);
    assert.equal((await query(fixture.pool, 'SELECT id FROM expenses WHERE id=$1 AND deleted_at IS NULL', [outsideId])).length, 0);
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
