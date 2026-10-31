import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { isolatedDatabase, query } from './postgres-fixture';
import { demoSamples } from '../src/lib/demo-data';
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
    env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: fixture.connectionString, APP_ORIGIN: origin, ENABLE_DEMO_DATA: 'true' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
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


  await t.test('importação CSV tem prévia, autoria da sessão e reenvio sem duplicação',async()=>{
    const csv='Data;Descrição;Valor;Categoria;Lançado por\n12/01/2030;Compra importada;99,90;Alimentos;Dono falso\n10/11/2031;Limpeza importada;80,10;Produtos e limpeza;Outro dono';
    assert.equal((await api('/expenses/import','','POST',{csv,mode:'preview'})).status,401);
    assert.equal((await api('/expenses/import',owner,'POST',{csv,mode:'import'},'https://hostil.invalid')).status,403);
    const preview=await api('/expenses/import',employee,'POST',{csv,mode:'preview'});assert.equal(preview.status,200,await preview.clone().text());
    const plan=await preview.json();assert.equal(plan.ready,2);assert.equal(plan.totalErrors,0);assert.equal(plan.totalCents,18000);
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
  await t.test('exemplos só podem ser gerenciados pelo dono e preservam os gastos reais', async () => {
    assert.equal((await api('/demo-data','','POST',{action:'restore'})).status,401);
    assert.equal((await api('/demo-data',employee,'POST',{action:'restore'})).status,403);
    assert.equal((await api('/demo-data',owner,'POST',{action:'restore'},'https://hostil.invalid')).status,403);
    assert.equal((await api('/demo-data',owner,'POST',{action:'truncate'})).status,400);
    const expectedDemoCount=demoSamples().length;
    const legacyResponse=await create(owner,{description:'Exemplo da versão anterior'});
    const legacyId=(await legacyResponse.json()).id;
    await query(fixture.pool,'UPDATE expenses SET demo_key=$1 WHERE id=$2',['v1-current-0',legacyId]);

    const before = await query(fixture.pool,'SELECT * FROM expenses WHERE empresa_id=$1 AND demo_key IS NULL ORDER BY id',[ownerUser.empresaId]);
    const restore = await api('/demo-data',owner,'POST',{action:'restore',empresaId:'forged'});
    assert.equal(restore.status,200,await restore.clone().text());
    assert.equal((await restore.json()).count,expectedDemoCount);
    const legacy=await query(fixture.pool,'SELECT deleted_at FROM expenses WHERE id=$1',[legacyId]);
    assert.ok(legacy[0].deleted_at);

    const examples = await query<{id:string}>(fixture.pool,'SELECT id FROM expenses WHERE empresa_id=$1 AND demo_key IS NOT NULL AND deleted_at IS NULL ORDER BY id',[ownerUser.empresaId]);
    assert.equal(examples.length,expectedDemoCount);
    const demo = await list(owner,''); assert.equal(demo.demoCount,expectedDemoCount);
    const annual = await list(owner,'year=2025');
    assert.equal(annual.count,216); assert.equal(annual.filters.start,'2025-01-01'); assert.equal(annual.filters.end,'2025-12-31');
    assert.equal(annual.series.length,12); assert.equal(annual.seriesInterval,'month'); assert.ok(annual.years.includes(2025));
    assert.ok(annual.expenses.every((row:{date:string;isDemo:boolean})=>row.date.startsWith('2025-') && row.isDemo));
    assert.equal(annual.categories.reduce((sum:number,row:{totalCents:number})=>sum+row.totalCents,0),annual.summary.totalCents);
    assert.equal((await list(other,'year=2025')).count,0);
    assert.equal((await api('/expenses?year=2025%20OR%201=1',owner)).status,400);
    const csv2025=await (await api('/expenses?year=2025&format=csv',owner)).text();
    assert.match(csv2025, /Data: \d{2}\/01\/2025/); assert.doesNotMatch(csv2025, /Data: \d{2}\/\d{2}\/2026/);

    assert.equal(demo.categories.length,9); assert.ok(demo.expenses.some((row:{isDemo:boolean})=>row.isDemo));
    assert.equal((await list(other,'')).demoCount,0);
    const repeated = await Promise.all([api('/demo-data',owner,'POST',{action:'restore'}),api('/demo-data',owner,'POST',{action:'restore'})]);
    assert.deepEqual(repeated.map(response=>response.status),[200,200]);
    assert.deepEqual(await query(fixture.pool,'SELECT id FROM expenses WHERE empresa_id=$1 AND demo_key IS NOT NULL AND deleted_at IS NULL ORDER BY id',[ownerUser.empresaId]),examples);
    assert.equal((await api('/demo-data',other,'POST',{action:'clear'})).status,200);
    assert.equal((await list(owner,'')).demoCount,expectedDemoCount);
    const cleared = await api('/demo-data',owner,'POST',{action:'clear'});
    assert.equal(cleared.status,200); assert.equal((await cleared.json()).count,0);
    const unchanged = await query(fixture.pool,'SELECT * FROM expenses WHERE empresa_id=$1 AND demo_key IS NULL ORDER BY id',[ownerUser.empresaId]);
    assert.deepEqual(unchanged,before);
    assert.equal((await list(owner,'')).demoCount,0);
    assert.equal((await api('/demo-data',owner,'POST',{action:'restore'})).status,200);
    assert.equal((await list(owner,'')).demoCount,expectedDemoCount);
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
