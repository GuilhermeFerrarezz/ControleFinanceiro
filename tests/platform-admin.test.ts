import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { isolatedDatabase, query } from './postgres-fixture';
import { issueAuthToken } from '../src/models/AuthToken';

test('admin exclusivo, cotas concorrentes e suspensão reversível', {timeout:180_000}, async t => {
  const fixture=await isolatedDatabase();const storage=fixture.pool;
  const adminId=randomUUID();const password='Admin-test-password-123';
  await query(storage,'INSERT INTO usuarios(id,nome,email,senha,email_verified_at) VALUES ($1,$2,$3,$4,clock_timestamp())',[adminId,'Administrador','platform@example.com',await bcrypt.hash(password,10)]);
  const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
  const address=listener.address();assert.ok(address&&typeof address==='object');const port=address.port;
  await new Promise<void>(resolve=>listener.close(()=>resolve()));const origin=`http://127.0.0.1:${port}`;
  const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(port),'-H','127.0.0.1'],{env:{...process.env,NODE_ENV:'production',DATABASE_URL:fixture.connectionString,PLATFORM_ADMIN_USER_ID:adminId,APP_ORIGIN:'',RESEND_API_KEY:'',RESEND_FROM_EMAIL:'',RESEND_SANDBOX_TO:''},windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';server.stdout.on('data',chunk=>{output=(output+chunk).slice(-6000);});server.stderr.on('data',chunk=>{output=(output+chunk).slice(-6000);});
  t.after(async()=>{try{if(server.exitCode===null){const exited=once(server,'exit');server.kill();await exited;}}finally{await fixture.cleanup();}});
  let ready=false;for(let attempt=0;attempt<100;attempt++){try{if((await fetch(`${origin}/login`)).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(ready,output);
  const send=(path:string,method='GET',body?:unknown,cookie='',source=origin)=>fetch(`${origin}${path}`,{method,headers:{Origin:source,Cookie:cookie,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual'});
  const post=(path:string,body:unknown,cookie='')=>send(`/api/v1${path}`,'POST',body,cookie);
  const cookie=(response:Response)=>(response.headers.get('set-cookie')||'').split(';')[0];
  const adminLogin=await post('/auth/login',{email:'platform@example.com',senha:password});assert.equal(adminLogin.status,200);let adminCookie=cookie(adminLogin);
  const overview=async()=>{const response=await send('/api/v1/platform-admin','GET',undefined,adminCookie);assert.equal(response.status,200);return response.json();};
  const patch=(body:unknown,auth=adminCookie,source=origin)=>send('/api/v1/platform-admin','PATCH',body,auth,source);
  const change=(body:Record<string,unknown>)=>patch({...body,senha:password});
  const settings=async(maxRestaurants:number,maxUsers:number)=>{const state=await overview();const response=await change({action:'settings',maxRestaurants,maxUsers,expectedSettings:state.settings});assert.equal(response.status,200,await response.text());};
  let ownerId='',empresaId='',ownerCookie='';
  await t.test('ninguém ganha administração por papel, cabeçalho ou corpo de cadastro',async()=>{
    assert.equal((await send('/api/v1/platform-admin')).status,401);
    assert.equal((await patch({action:'settings'} ,'')).status,401);
    assert.equal((await send('/admin')).status,307);
    const signup=await post('/auth/register',{nomeUsuario:'Dono comum',nomeEmpresa:'Casa protegida',email:'owner@platform.example',senha:password,platformAdmin:true,platformRole:'ADMIN',papel:'admin',role:'ADMIN'});assert.equal(signup.status,201);
    ownerCookie=cookie(await post('/auth/login',{email:'owner@platform.example',senha:password}));
    const identity=await(await send('/api/v1/private','GET',undefined,ownerCookie)).json();ownerId=identity.user.id;empresaId=identity.user.empresaId;assert.equal(identity.user.platformAdmin,false);assert.equal(identity.user.platformRole,'USER');
    const adminIdentity=await(await send('/api/v1/private','GET',undefined,adminCookie)).json();assert.equal(adminIdentity.user.platformRole,'ADMIN');
    assert.equal((await send('/api/v1/platform-admin','GET',undefined,ownerCookie)).status,403);
    assert.equal((await patch({action:'settings',maxRestaurants:9999,maxUsers:9999,senha:password},ownerCookie)).status,403);
    assert.equal((await send('/admin','GET',undefined,ownerCookie)).status,404);
    assert.equal((await send('/admin','GET',undefined,adminCookie)).status,200);
    const response=await send('/api/v1/platform-admin','GET',undefined,adminCookie);assert.match(response.headers.get('cache-control')||'',/no-store/);
    const data=await response.json();assert.equal(data.settings.maxRestaurants,10);assert.equal(data.settings.maxUsers,100);assert.doesNotMatch(JSON.stringify(data),/token_hash|\$2[aby]\$/);
    await query(storage,'UPDATE usuarios SET email_verified_at=NULL WHERE id=$1',[adminId]);
    assert.equal((await send('/api/v1/platform-admin','GET',undefined,adminCookie)).status,403);
    await query(storage,'UPDATE usuarios SET email_verified_at=clock_timestamp() WHERE id=$1',[adminId]);
  });
  await t.test('integrantes são paginados, isolados por restaurante e exclusivos do administrador', async () => {
    const target = randomUUID(), other = randomUUID();
    const people = Array.from({ length: 34 }, () => randomUUID());
    await query(storage,"INSERT INTO empresas(id,nome,ativo) VALUES ($1,'Equipe paginada',FALSE),($2,'Outra equipe',TRUE)",[target,other]);
    await query(storage,`INSERT INTO usuarios(id,nome,email,senha,ativo,email_verified_at,deleted_at)
      SELECT id,'Integrante '||lpad(n::text,2,'0'),'roster-'||n||'@platform.example','private-password-hash',n<>2 AND n<>33,
      CASE WHEN n=1 THEN clock_timestamp() END,CASE WHEN n=33 THEN clock_timestamp() END
      FROM unnest($1::uuid[]) WITH ORDINALITY AS person(id,n)`,[people]);
    await query(storage,`INSERT INTO restaurant_members(user_id,empresa_id,role)
      SELECT id,CASE WHEN n=34 THEN $3::uuid ELSE $2::uuid END,CASE WHEN n=1 THEN 'owner' ELSE 'employee' END
      FROM unnest($1::uuid[]) WITH ORDINALITY AS person(id,n)`,[people,target,other]);
    const url = `/api/v1/platform-admin?restaurantId=${target}`;
    assert.equal((await send(url)).status,401);
    assert.equal((await send(url,'GET',undefined,ownerCookie)).status,403);
    await query(storage,'UPDATE usuarios SET email_verified_at=NULL WHERE id=$1',[adminId]);
    assert.equal((await send(url,'GET',undefined,adminCookie)).status,403);
    await query(storage,'UPDATE usuarios SET email_verified_at=clock_timestamp() WHERE id=$1',[adminId]);
    const first = await send(url,'GET',undefined,adminCookie);
    assert.equal(first.status,200);
    assert.equal(first.headers.get('cache-control'),'no-store');
    const data = await first.json();
    assert.deepEqual(data.restaurant,{id:target,nome:'Equipe paginada',ativo:false});
    assert.equal(data.members.length,30); assert.equal(data.hasNext,true);
    assert.equal(data.members[0].role,'owner'); assert.equal(data.members[0].emailVerified,true);
    assert.equal(data.members[1].ativo,false);
    for(const member of data.members) assert.deepEqual(Object.keys(member).sort(),['id','nome','email','role','ativo','emailVerified'].sort());
    const second = await(await send(url+'&page=2','GET',undefined,adminCookie)).json();
    assert.equal(second.members.length,2); assert.equal(second.hasNext,false);
    const all = [...data.members,...second.members];
    assert.equal(new Set(all.map(member=>member.id)).size,32);
    assert.equal(all.some(member=>member.email==='roster-33@platform.example'||member.email==='roster-34@platform.example'),false);
    assert.doesNotMatch(JSON.stringify(data),/senha|token|private-password-hash/);
    for(const queryString of ['restaurantId=invalid',`restaurantId=${target}&page=0`,`restaurantId=${target}&page=1.5`]) {
      assert.equal((await send('/api/v1/platform-admin?'+queryString,'GET',undefined,adminCookie)).status,400);
    }
    assert.equal((await send('/api/v1/platform-admin?restaurantId='+randomUUID(),'GET',undefined,adminCookie)).status,404);
    const html = await(await send('/admin','GET',undefined,adminCookie)).text();
    assert.match(html,/Ver integrantes/);
    assert.doesNotMatch(html,/roster-01@platform.example/,'integrantes são consultados apenas ao expandir');
    await query(storage,'DELETE FROM usuarios WHERE id=ANY($1::uuid[])',[people]);
    await query(storage,'DELETE FROM empresas WHERE id=ANY($1::uuid[])',[[target,other]]);
    await query(storage,'DELETE FROM auth_rate_limits WHERE key=$1',[createHash('sha256').update(`platform-admin:read:${adminId}`).digest('hex')]);
  });
  await t.test('alterações exigem origem, senha e dados atuais; administrador não suspende a si mesmo',async()=>{
    const state=await overview();const body={action:'settings',maxRestaurants:12,maxUsers:100,expectedSettings:state.settings};
    assert.equal((await patch({...body,senha:password},adminCookie,'https://hostil.invalid')).status,403);
    assert.equal((await patch({...body,senha:'senha-incorreta'})).status,403);
    assert.equal((await change({...body,maxUsers:-1})).status,400);
    assert.equal((await change({...body,expectedSettings:{maxRestaurants:999,maxUsers:999}})).status,409);
    assert.equal((await change({action:'user',id:adminId,ativo:false,expectedActive:true})).status,403);
    assert.equal((await change(body)).status,200);
    const audits=await query(storage,'SELECT actor_id,action FROM platform_audit');assert.equal(audits.length,1);assert.equal(audits[0].actor_id,adminId);
  });
  await t.test('suspensão do restaurante encerra contexto e bloqueia dono, funcionários e convites',async()=>{
    const employeeId=randomUUID();await query(storage,'INSERT INTO usuarios(id,nome,email,senha) VALUES ($1,$2,$3,$4)',[employeeId,'Funcionário','employee@platform.example',await bcrypt.hash(password,10)]);
    await query(storage,"INSERT INTO restaurant_members(user_id,empresa_id,role) VALUES ($1,$2,'employee')",[employeeId,empresaId]);
    const employeeCookie=cookie(await post('/auth/login',{email:'employee@platform.example',senha:password}));
    const invited=await post('/invitations',{email:'future@platform.example'},ownerCookie);assert.equal(invited.status,201);const invite=(await invited.json()).path;
    assert.equal((await change({action:'restaurant',id:empresaId,ativo:false,expectedActive:true})).status,200);
    for(const auth of [ownerCookie,employeeCookie]) assert.equal((await send('/api/v1/expenses','GET',undefined,auth)).status,401);
    assert.equal((await post('/auth/login',{email:'owner@platform.example',senha:password})).status,403);
    assert.doesNotMatch(await(await send(invite)).text(),/Convite pessoal para/);
    assert.equal((await query(storage,'SELECT id FROM refresh_tokens WHERE empresa_id=$1',[empresaId])).length,0);
    assert.equal((await query(storage,'SELECT id FROM restaurant_members WHERE empresa_id=$1',[empresaId])).length,2);
    assert.equal((await change({action:'restaurant',id:empresaId,ativo:true,expectedActive:true})).status,409);
    assert.equal((await change({action:'restaurant',id:empresaId,ativo:true,expectedActive:false})).status,200);
    const login=await post('/auth/login',{email:'owner@platform.example',senha:password});assert.equal(login.status,200);ownerCookie=cookie(login);
    assert.equal((await send('/api/v1/private','GET',undefined,employeeCookie)).status,401,'sessão antiga não ressuscita');
  });
  await t.test('suspensão de usuário invalida sessões e tokens e recuperação não restaura acesso',async()=>{
    const client=await storage.connect();let reset='';try{await client.query('BEGIN');reset=await issueAuthToken(ownerId,'password_reset',client);await client.query('COMMIT');}finally{client.release();}
    assert.equal((await change({action:'user',id:ownerId,ativo:false,expectedActive:true})).status,200);
    assert.equal((await send('/api/v1/private','GET',undefined,ownerCookie)).status,401);
    assert.equal((await post('/auth/login',{email:'owner@platform.example',senha:password})).status,401);
    assert.equal((await post('/auth/reset-password',{token:reset,senha:'Senha-nova-longa-123'})).status,400);
    const missing=await post('/auth/forgot-password',{email:'missing@platform.example'});const blocked=await post('/auth/forgot-password',{email:'owner@platform.example'});assert.equal(blocked.status,200);assert.deepEqual(await missing.json(),await blocked.json());
    assert.equal((await query(storage,'SELECT id FROM auth_tokens WHERE user_id=$1',[ownerId])).length,0);
    assert.equal((await change({action:'user',id:ownerId,ativo:true,expectedActive:false})).status,200);
    assert.equal((await send('/api/v1/private','GET',undefined,ownerCookie)).status,401);
    assert.equal((await post('/auth/login',{email:'owner@platform.example',senha:password})).status,200);
  });
  await t.test('cotas são globais, incluem suspensos e não podem ser ultrapassadas por cadastros concorrentes',async()=>{
    let state=await overview();await settings(state.totals.restaurants+1,state.totals.users+10);
    const results=await Promise.all(['one','two'].map(name=>post('/auth/register',{nomeUsuario:`Dono ${name}`,nomeEmpresa:`Casa ${name}`,email:`quota-${name}@platform.example`,senha:password})));
    assert.deepEqual(results.map(r=>r.status),[201,201]);
    assert.deepEqual(await results[0].json(),await results[1].json(),'lotação não revela se o e-mail existe');
    assert.equal((await query(storage,"SELECT id FROM usuarios WHERE email IN ('quota-one@platform.example','quota-two@platform.example')")).length,1);
    state=await overview();assert.equal(state.totals.restaurants,state.settings.maxRestaurants);
    const before=state.totals.users;await settings(state.settings.maxRestaurants+3,before);
    const denied=await post('/auth/register',{nomeUsuario:'Sem vaga',nomeEmpresa:'Casa sem vaga',email:'full@platform.example',senha:password});assert.equal(denied.status,201);
    assert.equal((await query(storage,"SELECT id FROM usuarios WHERE email='full@platform.example'")).length,0);
    assert.equal((await overview()).totals.restaurants,state.totals.restaurants,'restaurante não fica órfão quando falta vaga de usuário');
    await settings(state.settings.maxRestaurants+3,before+1);
    const invitation=await post('/invitations',{email:'invite-cap@platform.example'},ownerCookie);
    // ownerCookie was revoked by suspension: obtain a fresh context.
    assert.equal(invitation.status,401);
    await query(storage,'DELETE FROM auth_rate_limits WHERE key=$1',[createHash('sha256').update('login:owner@platform.example').digest('hex')]);
    ownerCookie=cookie(await post('/auth/login',{email:'owner@platform.example',senha:password}));
    const inv=await post('/invitations',{email:'invite-cap@platform.example'},ownerCookie);assert.equal(inv.status,201);const token=(await inv.json()).path.split('/').at(-1);
    const added=await post('/auth/register',{nomeUsuario:'Funcionário limite',email:'invite-cap@platform.example',senha:password,invitationToken:token});assert.equal(added.status,201);
    const nextInv=await post('/invitations',{email:'invite-full@platform.example'},ownerCookie);assert.equal(nextInv.status,201);const nextToken=(await nextInv.json()).path.split('/').at(-1);
    assert.equal((await post('/auth/register',{nomeUsuario:'Sem espaço',email:'invite-full@platform.example',senha:password,invitationToken:nextToken})).status,201);
    assert.equal((await query(storage,"SELECT id FROM usuarios WHERE email='invite-full@platform.example'")).length,0);
    await settings(0,0);assert.equal((await post('/auth/register',{nomeUsuario:'Sem cadastro',nomeEmpresa:'Bloqueada',email:'zero@platform.example',senha:password})).status,201);
    assert.equal((await query(storage,"SELECT id FROM usuarios WHERE email='zero@platform.example'")).length,0);
    assert.equal((await send('/api/v1/private','GET',undefined,adminCookie)).status,200,'reduzir cotas não exclui contas existentes');
  });
  await t.test('admin entra mesmo se seu restaurante estiver suspenso',async()=>{
    await query(storage,"INSERT INTO restaurant_members(user_id,empresa_id,role) VALUES ($1,$2,'owner')",[adminId,empresaId]);
    assert.equal((await change({action:'restaurant',id:empresaId,ativo:false,expectedActive:true})).status,200);
    const login=await post('/auth/login',{email:'platform@example.com',senha:password});assert.equal(login.status,200);adminCookie=cookie(login);
    assert.equal((await send('/admin','GET',undefined,adminCookie)).status,200);
  });
  const provision=async(email:string)=>{
    const id=randomUUID();
    await query(storage,`INSERT INTO usuarios(id,nome,email,senha,email_verified_at) SELECT $1,'Conta de teste',$2,senha,clock_timestamp() FROM usuarios WHERE id=$3`,[id,email,adminId]);
    return id;
  };
  const clearAdminAttempts=()=>query(storage,'DELETE FROM auth_rate_limits WHERE key=$1',[createHash('sha256').update(`platform-admin:password:${adminId}`).digest('hex')]);
  const remove=(id:string,expectedActive=true)=>change({action:'delete-user',id,expectedActive,confirmation:'EXCLUIR'});
  await t.test('exclusão exige administrador, senha, confirmação e preserva o último dono',async()=>{
    await clearAdminAttempts();
    const id=await provision('delete-guard@platform.example');
    const ordinary=cookie(await post('/auth/login',{email:'delete-guard@platform.example',senha:password}));
    const body={action:'delete-user',id,expectedActive:true,confirmation:'EXCLUIR',senha:password};
    assert.equal((await patch(body,'')).status,401);
    assert.equal((await patch(body,ordinary)).status,403);
    assert.equal((await patch(body,adminCookie,'https://hostil.invalid')).status,403);
    assert.equal((await patch({...body,senha:'incorreta'})).status,403);
    assert.equal((await change({...body,confirmation:undefined})).status,400);
    assert.equal((await change({...body,confirmation:'excluir'})).status,400);
    assert.equal((await remove(adminId)).status,403);
    assert.equal((await remove(id,false)).status,409);
    const restaurant=randomUUID();await query(storage,'INSERT INTO empresas(id,nome) VALUES ($1,$2)',[restaurant,'Último dono protegido']);
    await query(storage,"INSERT INTO restaurant_members(user_id,empresa_id,role) VALUES ($1,$2,'owner')",[id,restaurant]);
    assert.equal((await remove(id)).status,409);
    assert.equal((await query(storage,'SELECT ativo FROM usuarios WHERE id=$1',[id]))[0].ativo,true);
    assert.equal((await query(storage,"SELECT id FROM platform_audit WHERE target_id=$1 AND action='user_deleted'",[id])).length,0);
    await query(storage,"INSERT INTO restaurant_members(user_id,empresa_id,role) VALUES ($1,$2,'owner')",[adminId,restaurant]);
    const deleted=await remove(id);assert.equal(deleted.status,200);assert.equal((await deleted.json()).deletionMode,'removed');
    assert.equal((await query(storage,'SELECT id FROM usuarios WHERE id=$1',[id])).length,0);
    assert.equal((await query(storage,'SELECT id FROM empresas WHERE id=$1',[restaurant])).length,1);
    assert.equal((await send('/api/v1/private','GET',undefined,ordinary)).status,401);
  });
  await t.test('conta sem histórico é removida e sessões, tokens e convites antigos não restauram acesso',async()=>{
    await clearAdminAttempts();
    const email='delete-empty@platform.example';const id=await provision(email);
    const login=await post('/auth/login',{email,senha:password});assert.equal(login.status,200);const oldCookie=cookie(login);
    const client=await storage.connect();let reset='';try{await client.query('BEGIN');reset=await issueAuthToken(id,'password_reset',client);await client.query('COMMIT');}finally{client.release();}
    await query(storage,"INSERT INTO restaurant_members(user_id,empresa_id,role) VALUES ($1,$2,'employee')",[id,empresaId]);
    const inviteId=randomUUID();const inviteToken=randomUUID();
    await query(storage,'INSERT INTO restaurant_invitations(id,empresa_id,invited_by,email,token_hash,expires_at) VALUES ($1,$2,$3,$4,$5,clock_timestamp()+interval \'1 day\')',[inviteId,empresaId,adminId,email,createHash('sha256').update(inviteToken).digest('hex')]);
    const before=await overview();const response=await remove(id);assert.equal(response.status,200);assert.equal((await response.json()).deletionMode,'removed');
    assert.equal((await overview()).totals.users,before.totals.users-1);
    for(const table of ['usuarios','refresh_tokens','auth_tokens','restaurant_members'])assert.equal((await query(storage,`SELECT id FROM ${table} WHERE ${table==='usuarios'?'id':'user_id'}=$1`,[id])).length,0);
    const [invitation]=await query(storage,'SELECT email,revoked_at FROM restaurant_invitations WHERE id=$1',[inviteId]);assert.notEqual(invitation.email,email);assert.ok(invitation.revoked_at);
    assert.equal((await send('/api/v1/private','GET',undefined,oldCookie)).status,401);
    assert.equal((await post('/auth/reset-password',{token:reset,senha:'Nova-senha-longa-123'})).status,400);
    assert.equal((await post('/auth/login',{email,senha:password})).status,401);
    assert.equal((await remove(id)).status,404);
    const [audit]=await query<{actor_id:string;before:unknown;after:{mode:string}}>(storage,"SELECT actor_id,before,after FROM platform_audit WHERE target_id=$1 AND action='user_deleted'",[id]);assert.equal(audit.actor_id,adminId);assert.equal(audit.after.mode,'removed');assert.doesNotMatch(JSON.stringify(audit),/delete-empty/);
  });
  await t.test('exclusão com histórico anonimiza identidade sem apagar lançamentos e libera a vaga',async()=>{
    await clearAdminAttempts();
    const email='delete-history@platform.example';const id=await provision(email);
    const expenseId=randomUUID();
    await query(storage,`INSERT INTO expenses(id,empresa_id,created_by,updated_by,request_id,description,amount_cents,date,category) VALUES ($1,$2,$3,$3,$4,'Registro preservado',12345,'2026-11-17','outros')`,[expenseId,empresaId,id,randomUUID()]);
    await query(storage,"INSERT INTO expense_audit(expense_id,empresa_id,actor_id,action,after) VALUES ($1,$2,$3,'created',$4::jsonb)",[expenseId,empresaId,id,JSON.stringify({amountCents:12345})]);
    await query(storage,"INSERT INTO restaurant_members(user_id,empresa_id,role) VALUES ($1,$2,'employee')",[id,empresaId]);
    const authoredInvite=randomUUID();await query(storage,"INSERT INTO restaurant_invitations(id,empresa_id,invited_by,email,token_hash,expires_at) VALUES ($1,$2,$3,'invited-by-deleted@platform.example',$4,clock_timestamp()+interval '1 day')",[authoredInvite,empresaId,id,createHash('sha256').update(randomUUID()).digest('hex')]);
    const financialBefore=await query(storage,'SELECT * FROM expenses WHERE id=$1',[expenseId]);const financialAuditBefore=await query(storage,'SELECT * FROM expense_audit WHERE expense_id=$1',[expenseId]);
    const before=await overview();const response=await remove(id);assert.equal(response.status,200);assert.equal((await response.json()).deletionMode,'anonymized');
    const [identity]=await query(storage,'SELECT * FROM usuarios WHERE id=$1',[id]);assert.equal(identity.nome,'Usuário excluído');assert.notEqual(identity.email,email);assert.equal(identity.ativo,false);assert.ok(identity.deleted_at);assert.equal(identity.email_verified_at,null);assert.equal(identity.empresa_id,null);
    assert.deepEqual(await query(storage,'SELECT * FROM expenses WHERE id=$1',[expenseId]),financialBefore);assert.deepEqual(await query(storage,'SELECT * FROM expense_audit WHERE expense_id=$1',[expenseId]),financialAuditBefore);
    assert.ok((await query(storage,'SELECT revoked_at FROM restaurant_invitations WHERE id=$1',[authoredInvite]))[0].revoked_at);
    const after=await overview();assert.equal(after.totals.users,before.totals.users-1);assert.ok(!after.users.some((row:{id:string})=>row.id===id));
    assert.equal((await change({action:'user',id,ativo:true,expectedActive:false})).status,404);
    assert.equal((await remove(id,false)).status,404);
    await assert.rejects(query(storage,'UPDATE usuarios SET ativo=TRUE WHERE id=$1',[id]),{code:'23514'});
    await settings(after.totals.restaurants+1,after.totals.users+1);
    const signup=await post('/auth/register',{nomeUsuario:'Nova identidade',nomeEmpresa:'Novo cadastro',email,senha:password});assert.equal(signup.status,201);
    const [newIdentity]=await query(storage,'SELECT id FROM usuarios WHERE email=$1',[email]);assert.notEqual(newIdentity.id,id);
    assert.equal((await query(storage,'SELECT id FROM restaurant_members WHERE user_id=$1 AND empresa_id=$2',[newIdentity.id,empresaId])).length,0);
  });
  await t.test('exclusões concorrentes nunca deixam restaurante sem dono',async()=>{
    await clearAdminAttempts();
    const first=await provision('co-owner-a@platform.example');const second=await provision('co-owner-b@platform.example');const restaurant=randomUUID();
    await query(storage,'INSERT INTO empresas(id,nome) VALUES ($1,$2)',[restaurant,'Dois donos']);
    await query(storage,"INSERT INTO restaurant_members(user_id,empresa_id,role) VALUES ($1,$3,'owner'),($2,$3,'owner')",[first,second,restaurant]);
    const responses=await Promise.all([remove(first),remove(second)]);assert.deepEqual(responses.map(row=>row.status).sort(),[200,409]);
    assert.equal((await query(storage,"SELECT m.id FROM restaurant_members m JOIN usuarios u ON u.id=m.user_id WHERE m.empresa_id=$1 AND m.role='owner' AND u.ativo AND u.deleted_at IS NULL",[restaurant])).length,1);
  });
  await t.test('uma sessão revogada enquanto a alteração aguardava não pode administrar a plataforma',async()=>{
    await clearAdminAttempts();
    const state=await overview();const lock=await storage.connect();let pending:Promise<Response>|undefined;
    try {
      await lock.query('BEGIN');await lock.query('SELECT id FROM platform_settings WHERE id=1 FOR UPDATE');
      pending=change({action:'settings',maxRestaurants:88,maxUsers:999,expectedSettings:state.settings});
      let waiting=false;
      for(let i=0;i<100;i++){
        const rows=await query(storage,"SELECT pid FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%FROM platform_settings%FOR UPDATE%'");
        if(rows.length){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,20));
      }
      assert.ok(waiting,'A alteração deve estar aguardando o bloqueio de configurações');
      await query(storage,'DELETE FROM refresh_tokens WHERE token=$1',[createHash('sha256').update(adminCookie.slice(adminCookie.indexOf('=')+1)).digest('hex')]);
      await lock.query('COMMIT');assert.equal((await pending).status,401);
      const [unchanged]=await query(storage,'SELECT max_restaurants,max_users FROM platform_settings WHERE id=1');
      assert.equal(unchanged.max_restaurants,state.settings.maxRestaurants);assert.equal(unchanged.max_users,state.settings.maxUsers);
    }finally{await lock.query('ROLLBACK');lock.release();if(pending)await pending;}
    adminCookie=cookie(await post('/auth/login',{email:'platform@example.com',senha:password}));
    assert.equal((await send('/admin','GET',undefined,adminCookie)).status,200);
  });
  await t.test('excluir restaurante exige administrador, senha, nome atual e desativação prévia',async()=>{
    await clearAdminAttempts();
    const id=randomUUID();const name='Restaurante protegido';const userId=await provision('restaurant-delete-guard@platform.example');
    await query(storage,'INSERT INTO empresas(id,nome) VALUES ($1,$2)',[id,name]);
    await query(storage,"INSERT INTO restaurant_members(user_id,empresa_id,role) VALUES ($1,$2,'owner')",[userId,id]);
    const ordinary=cookie(await post('/auth/login',{email:'restaurant-delete-guard@platform.example',senha:password}));
    const body={action:'delete-restaurant',id,name,confirmation:name,expectedActive:true,senha:password};
    assert.equal((await patch(body,'')).status,401);
    assert.equal((await patch(body,ordinary)).status,403);
    assert.equal((await patch(body,adminCookie,'https://hostil.invalid')).status,403);
    assert.equal((await patch({...body,senha:'errada'})).status,403);
    assert.equal((await patch({...body,confirmation:undefined})).status,400);
    assert.equal((await patch({...body,confirmation:'EXCLUIR'})).status,400);
    assert.equal((await patch(body)).status,409,'restaurante ativo não pode ser apagado');
    assert.equal((await change({action:'restaurant',id,ativo:false,expectedActive:true})).status,200);
    assert.equal((await patch(body)).status,409,'situação antiga deve ser rejeitada');
    assert.equal((await patch({...body,expectedActive:false,name:'Nome antigo',confirmation:'Nome antigo'})).status,409);
    assert.equal((await query(storage,'SELECT id FROM empresas WHERE id=$1',[id])).length,1);
    assert.equal((await query(storage,"SELECT id FROM platform_audit WHERE target_id=$1 AND action='restaurant_deleted'",[id])).length,0);
  });
  await t.test('exclusão é atômica, remove dados vinculados e preserva usuários, outros restaurantes e histórico administrativo',async()=>{
    await clearAdminAttempts();
    const owner=await provision('restaurant-delete-owner@platform.example');const employee=await provision('restaurant-delete-employee@platform.example');
    const target=randomUUID();const other=randomUUID();const name='Casa a excluir';
    await query(storage,'INSERT INTO empresas(id,nome,ativo) VALUES ($1,$2,FALSE),($3,\'Casa preservada\',TRUE)',[target,name,other]);
    await query(storage,"INSERT INTO restaurant_members(user_id,empresa_id,role) VALUES ($1,$3,'owner'),($2,$3,'employee'),($1,$4,'owner')",[owner,employee,target,other]);
    await query(storage,'UPDATE usuarios SET empresa_id=$2 WHERE id=$1',[owner,target]);
    for(const restaurant of [target,other]) {
      const expense=randomUUID();const product=randomUUID();
      await query(storage,"INSERT INTO expenses(id,empresa_id,created_by,updated_by,request_id,description,amount_cents,date,category) VALUES ($1,$2,$3,$3,$4,'Compra',1234,'2026-11-18','outros')",[expense,restaurant,owner,randomUUID()]);
      await query(storage,"INSERT INTO expense_audit(expense_id,empresa_id,actor_id,action) VALUES ($1,$2,$3,'created')",[expense,restaurant,owner]);
      await query(storage,"INSERT INTO daily_revenue(empresa_id,date,amount_cents) VALUES ($1,'2026-11-18',3456)",[restaurant]);
      await query(storage,"INSERT INTO restaurant_catalog(id,empresa_id,kind,name,normalized_name) VALUES ($1,$2,'product','Arroz','arroz')",[product,restaurant]);
      await query(storage,"INSERT INTO inventory_products(empresa_id,product_id,unit) VALUES ($1,$2,'kg')",[restaurant,product]);
      await query(storage,"INSERT INTO inventory_movements(empresa_id,product_id,actor_id,request_id,quantity,date,source) VALUES ($1,$2,$3,$4,1,'2026-11-18','opening')",[restaurant,product,owner,randomUUID()]);
      await query(storage,"INSERT INTO restaurant_invitations(empresa_id,invited_by,email,token_hash,expires_at) VALUES ($1,$2,'future-delete@platform.example',$3,clock_timestamp()+interval '1 day')",[restaurant,owner,createHash('sha256').update(randomUUID()).digest('hex')]);
    }
    const rawOther=randomBytes(32).toString('base64url');const staleTarget=randomBytes(32).toString('base64url');
    for(const [token,restaurant] of [[rawOther,other],[staleTarget,target]]) await query(storage,"INSERT INTO refresh_tokens(token,user_id,empresa_id,expires_at) VALUES ($1,$2,$3,clock_timestamp()+interval '1 day')",[createHash('sha256').update(token).digest('hex'),owner,restaurant]);
    const tables=['expenses','expense_audit','daily_revenue','restaurant_catalog','inventory_products','inventory_movements','restaurant_invitations','restaurant_members','refresh_tokens'];
    const otherBefore=await Promise.all(tables.map(table=>query(storage,`SELECT * FROM ${table} WHERE empresa_id=$1 ORDER BY 1`,[other])));
    const usersBefore=await query(storage,'SELECT id,nome,email,ativo,senha FROM usuarios ORDER BY id');
    const before=await overview();const body={action:'delete-restaurant',id:target,name,confirmation:name,expectedActive:false};
    await query(storage,"CREATE FUNCTION reject_restaurant_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='restaurant_deleted' THEN RAISE EXCEPTION 'isolated rollback test'; END IF; RETURN NEW; END $$");
    await query(storage,'CREATE TRIGGER reject_restaurant_audit BEFORE INSERT ON platform_audit FOR EACH ROW EXECUTE FUNCTION reject_restaurant_audit()');
    try {
      assert.equal((await change(body)).status,500);
      for(const table of tables) assert.ok((await query(storage,`SELECT * FROM ${table} WHERE empresa_id=$1`,[target])).length>0,`${table} deve ser restaurado após rollback`);
    } finally {
      await query(storage,'DROP TRIGGER reject_restaurant_audit ON platform_audit');await query(storage,'DROP FUNCTION reject_restaurant_audit()');
    }
    const responses=await Promise.all([change(body),change(body)]);assert.deepEqual(responses.map(row=>row.status).sort(),[200,404]);
    assert.equal((await query(storage,'SELECT id FROM empresas WHERE id=$1',[target])).length,0);
    for(const table of tables) assert.equal((await query(storage,`SELECT * FROM ${table} WHERE empresa_id=$1`,[target])).length,0,table);
    assert.deepEqual(await Promise.all(tables.map(table=>query(storage,`SELECT * FROM ${table} WHERE empresa_id=$1 ORDER BY 1`,[other]))),otherBefore);
    assert.deepEqual(await query(storage,'SELECT id,nome,email,ativo,senha FROM usuarios ORDER BY id'),usersBefore);
    assert.equal((await query(storage,'SELECT empresa_id FROM usuarios WHERE id=$1',[owner]))[0].empresa_id,null);
    assert.equal((await send('/api/v1/private','GET',undefined,`session=${rawOther}`)).status,200);
    assert.equal((await send('/api/v1/private','GET',undefined,`session=${staleTarget}`)).status,401);
    const after=await overview();assert.equal(after.totals.restaurants,before.totals.restaurants-1);assert.equal(after.totals.users,before.totals.users);
    const audit=await query<{actor_id:string;after:{kind:string}}>(storage,"SELECT actor_id,after FROM platform_audit WHERE action='restaurant_deleted' AND target_id=$1",[target]);assert.equal(audit.length,1);assert.equal(audit[0].actor_id,adminId);assert.equal(audit[0].after.kind,'restaurant');
  });
});
