import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createServer as createPortServer} from 'node:net';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {isolatedDatabase,query} from './postgres-fixture';

test('links transacionais completos em sandbox, privacidade temporal e falhas do provedor', {timeout:120_000},async t=>{
  const fixture=await isolatedDatabase();const storage=fixture.pool;
  const id=randomUUID();const verifyId=randomUUID();const password='known-password-123';
  const hash=await bcrypt.hash(password,10);
  await query(storage,"INSERT INTO usuarios(id,nome,email,senha,email_verified_at) VALUES ($1,'Admin de teste','security-link@example.com',$2,clock_timestamp()),($3,'Verificação de teste','verify-link@example.com',$2,NULL)",[id,hash,verifyId]);
  type Mail={from:string;to:string[];text:string;html:string;subject:string;cc?:unknown;bcc?:unknown};
  const sandboxTo='sandbox-owner@example.com';
  const messages:Mail[]=[];let status=200;let hold:Promise<void>|null=null;const releases:Array<()=>void>=[];
  const mailServer=createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk.toString();
    messages.push(JSON.parse(body));const responseStatus=status;const gate=hold;
    if(gate)await gate;
    res.writeHead(responseStatus,{'Content-Type':'application/json'});res.end(responseStatus===200?JSON.stringify({id:randomUUID()}):'FAKE_PROVIDER_SECRET');
  });
  mailServer.listen(0,'127.0.0.1');await once(mailServer,'listening');const mailAddress=mailServer.address();assert.ok(mailAddress&&typeof mailAddress==='object');
  const listener=createPortServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const address=listener.address();assert.ok(address&&typeof address==='object');const port=address.port;await new Promise<void>(resolve=>listener.close(()=>resolve()));
  const origin=`http://127.0.0.1:${port}`;const publicOrigin='https://public.example.com';
  const server=spawn(process.execPath,['--import','./tests/fixtures/resend-transport.mjs','node_modules/next/dist/bin/next','start','-p',String(port),'-H','127.0.0.1'],{env:{...process.env,NODE_ENV:'production',DATABASE_URL:fixture.connectionString,VERCEL:'',TRUSTED_CLIENT_IP_HEADER:'x-forwarded-for',PLATFORM_ADMIN_USER_ID:id,APP_ORIGIN:publicOrigin,RESEND_API_KEY:'fake-isolated-key',RESEND_FROM_EMAIL:'',RESEND_SANDBOX_TO:sandboxTo,TEST_RESEND_ORIGIN:`http://127.0.0.1:${mailAddress.port}`},windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';server.stdout.on('data',chunk=>{output=(output+chunk).slice(-10000);});server.stderr.on('data',chunk=>{output=(output+chunk).slice(-10000);});
  t.after(async()=>{try{releases.forEach(release=>release());if(server.exitCode===null){const exited=once(server,'exit');server.kill();await exited;}}finally{mailServer.closeAllConnections();await new Promise<void>(resolve=>mailServer.close(()=>resolve()));await fixture.cleanup();}});
  async function waitFor(check:()=>Promise<boolean>|boolean,label:string){for(let i=0;i<150;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,20));}assert.fail(label);}
  await waitFor(async()=>{try{return(await fetch(`${origin}/login`)).ok;}catch{return false;}},'Servidor indisponível');
  const post=(path:string,body:unknown,cookie='',ip='192.0.2.1')=>fetch(`${origin}/api/v1/auth/${path}`,{method:'POST',headers:{Origin:publicOrigin,'Content-Type':'application/json',Cookie:cookie,'x-forwarded-for':ip},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
  const clearLimits=async(email:string,type:string,preserve?:string)=>{
    const keys=[`${type}:cooldown:${email}`,`${type}:email:${email}`,'auth-email:second','auth-email:minute','auth-email:day','auth-email:requests'].filter(key=>key!==preserve);
    await query(storage,'DELETE FROM auth_rate_limits WHERE key=ANY($1::text[])',[keys.map(key=>createHash('sha256').update(key).digest('hex'))]);
  };
  const url=(mail:Mail)=>new URL(mail.text.split('\n').find(line=>line.startsWith('https://'))!);
  const token=(mail:Mail)=>new URLSearchParams(url(mail).hash.slice(1)).get('token')!;
  const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
  function holdProvider(){let release!:()=>void;hold=new Promise<void>(resolve=>{release=resolve;});releases.push(release);return()=>{hold=null;release();};}
  await t.test('esqueci a senha responde antes do envio e não revela contas no corpo ou espera SMTP',async()=>{
    const html=await(await fetch(`${origin}/login`)).text();assert.match(html,/href="\/forgot-password"/);
    assert.equal((await fetch(`${origin}/forgot-password`)).status,200);
    const missing=await post('forgot-password',{email:'unknown@example.com'});const generic=await missing.json();assert.equal(missing.status,200);
    const release=holdProvider();const known=await post('forgot-password',{email:'security-link@example.com'});
    assert.equal(known.status,200);assert.deepEqual(await known.json(),generic);assert.match(known.headers.get('cache-control')||'',/no-store/);assert.equal(known.headers.get('set-cookie'),null);
    await waitFor(()=>messages.length===1,'Resend simulado não recebeu recuperação');
    const link=url(messages[0]);assert.equal(link.origin,publicOrigin);assert.equal(link.pathname,'/reset-password');assert.equal(link.search,'');assert.match(token(messages[0]),/^[A-Za-z0-9_-]{43}$/);
    assert.match(messages[0].html,/Redefinir minha senha/);
    const [row]=await query<{token_hash:string}>(storage,"SELECT token_hash FROM auth_tokens WHERE user_id=$1 AND type='password_reset'",[id]);assert.equal(row.token_hash,digest(token(messages[0])));assert.notEqual(row.token_hash,token(messages[0]));
    // HTTP fetch strips the fragment: opening/scanning a link cannot consume it.
    assert.equal((await fetch(`${origin}${link.pathname}${link.hash}`)).status,200);
    assert.equal((await query(storage,'SELECT id FROM auth_tokens WHERE user_id=$1',[id])).length,1);
    release();await waitFor(()=>!output.includes('FAKE_PROVIDER_SECRET'),'Resposta de provedor não deve aparecer nos logs');
  });
  await t.test('reenvio com falha preserva o link anterior e não registra tokens ou resposta privada',async()=>{
    await clearLimits('security-link@example.com','password_reset');status=500;
    const previous=token(messages[0]);const response=await post('forgot-password',{email:'security-link@example.com'});assert.equal(response.status,200);
    await waitFor(()=>messages.length===2,'Falha simulada não ocorreu');
    await waitFor(async()=>{const rows=await query<{token_hash:string}>(storage,'SELECT token_hash FROM auth_tokens WHERE user_id=$1',[id]);return rows[0]?.token_hash===digest(previous);},'Link anterior não foi restaurado');
    assert.doesNotMatch(output,/FAKE_PROVIDER_SECRET/);assert.ok(!output.includes(previous));assert.ok(!output.includes(token(messages[1])));
    const result=await post('reset-password',{token:previous,senha:'new-password-after-reset-123',email:'verify-link@example.com',userId:verifyId});assert.equal(result.status,200);assert.match(result.headers.get('set-cookie')||'',/Max-Age=0/);
    assert.equal((await post('reset-password',{token:previous,senha:'another-password-123'})).status,400);
    assert.equal((await post('login',{email:'security-link@example.com',senha:password})).status,401);
    assert.equal((await post('login',{email:'security-link@example.com',senha:'new-password-after-reset-123'})).status,200);
    assert.equal((await query(storage,'SELECT senha FROM usuarios WHERE id=$1',[verifyId]))[0].senha,hash);
  });
  await t.test('compensação não ressuscita token após uso bem-sucedido durante falha de envio',async()=>{
    const count=messages.length;
    await clearLimits('security-link@example.com','password_reset');status=200;
    await post('forgot-password',{email:'security-link@example.com'});await waitFor(()=>messages.length===count+1,'Link anterior não emitido');
    const previous=token(messages[count]);
    await clearLimits('security-link@example.com','password_reset');status=500;const release=holdProvider();
    const errors=output.split('Não foi possível processar o envio.').length;
    await post('forgot-password',{email:'security-link@example.com'});await waitFor(()=>messages.length===count+2,'Emissão não ocorreu');
    const candidate=token(messages[count+1]);
    const used=await post('reset-password',{token:candidate,senha:'final-password-reset-123'});assert.equal(used.status,200);release();
    await waitFor(()=>output.split('Não foi possível processar o envio.').length>errors,'Compensação não finalizou');
    assert.equal((await query(storage,'SELECT id FROM auth_tokens WHERE user_id=$1',[id])).length,0);
    assert.equal((await post('reset-password',{token:candidate,senha:'reuse-password-123'})).status,400);
    assert.equal((await post('reset-password',{token:previous,senha:'old-password-123'})).status,400);
  });
  await t.test('confirmação é de uso único, rejeita finalidade errada e respeita suspensão',async()=>{
    const count=messages.length;
    await clearLimits('verify-link@example.com','email_verification');status=200;
    const response=await post('resend-verification',{email:'verify-link@example.com'});assert.equal(response.status,200);await waitFor(()=>messages.length===count+1,'Verificação não enviada');
    const verification=messages[count];assert.equal(url(verification).pathname,'/verify-email');assert.equal(url(verification).search,'');
    assert.match(verification.html,/Confirmar meu e-mail/);
    assert.equal((await post('reset-password',{token:token(verification),senha:'wrong-purpose-123'})).status,400);
    assert.equal((await fetch(`${origin}/verify-email${url(verification).hash}`)).status,200);
    const first=await post('verify-email',{token:token(verification)});assert.equal(first.status,200);
    assert.equal((await post('verify-email',{token:token(verification)})).status,400);
    assert.ok((await query(storage,'SELECT email_verified_at FROM usuarios WHERE id=$1',[verifyId]))[0].email_verified_at);
    await clearLimits('verify-link@example.com','password_reset');await post('forgot-password',{email:'verify-link@example.com'});await waitFor(()=>messages.length===count+2,'Recuperação não enviada');
    await query(storage,'UPDATE usuarios SET ativo=FALSE WHERE id=$1',[verifyId]);
    assert.equal((await post('reset-password',{token:token(messages[count+1]),senha:'blocked-password-123'})).status,400);
    assert.equal((await query(storage,'SELECT senha FROM usuarios WHERE id=$1',[verifyId]))[0].senha,hash);
  });
  await t.test('15 por minuto e 100 por 24 horas: aceita o último, bloqueia o seguinte e renova a janela',async()=>{
    status=200;
    for(const [key,limit,windowMs] of [['auth-email:minute',15,60_000],['auth-email:day',100,24*60*60_000]] as const){
      const email='security-link@example.com';await clearLimits(email,'password_reset');
      const hashed=digest(key);
      await query(storage,'INSERT INTO auth_rate_limits(key,count,window_start) VALUES ($1,$2,$3)',[hashed,limit-1,Date.now()]);
      const before=messages.length;
      assert.equal((await post('forgot-password',{email})).status,200);
      await waitFor(()=>messages.length===before+1,'Último envio permitido não chegou ao provedor');
      assert.equal((await query<{count:number}>(storage,'SELECT count FROM auth_rate_limits WHERE key=$1',[hashed]))[0].count,limit);
      const [previous]=await query<{token_hash:string}>(storage,"SELECT token_hash FROM auth_tokens WHERE user_id=$1 AND type='password_reset'",[id]);
      await clearLimits(email,'password_reset',key);
      const errors=output.split('Não foi possível processar o envio.').length;
      assert.equal((await post('forgot-password',{email})).status,200);
      await waitFor(()=>output.split('Não foi possível processar o envio.').length>errors,'Quota não bloqueou processamento');
      assert.equal(messages.length,before+1,'Envio excedente não pode chamar o Resend');
      assert.equal((await query(storage,"SELECT token_hash FROM auth_tokens WHERE user_id=$1 AND type='password_reset'",[id]))[0].token_hash,previous.token_hash);
      await query(storage,'UPDATE auth_rate_limits SET window_start=$2 WHERE key=$1',[hashed,Date.now()-windowMs-1]);
      await clearLimits(email,'password_reset',key);
      assert.equal((await post('forgot-password',{email})).status,200);
      await waitFor(()=>messages.length===before+2,'Janela vencida não liberou novo envio');
      assert.equal((await query<{count:number}>(storage,'SELECT count FROM auth_rate_limits WHERE key=$1',[hashed]))[0].count,1);
    }
  });
  await t.test('cadastro entrega confirmação sem revelar conta existente nem aguardar o provedor',async()=>{
    const email='new-signup-link@example.com';await clearLimits(email,'email_verification');status=200;
    const before=messages.length;const release=holdProvider();
    const body={email,senha:password,nomeUsuario:'Novo cadastro',nomeEmpresa:'Nova casa'};
    const fresh=await post('register',body);assert.equal(fresh.status,201);const generic=await fresh.json();
    assert.deepEqual(Object.keys(generic),['message']);
    await waitFor(()=>messages.length===before+1,'Cadastro não enviou confirmação');
    const duplicate=await post('register',body);assert.equal(duplicate.status,201);assert.deepEqual(await duplicate.json(),generic);
    assert.equal(messages.length,before+1,'Cadastro repetido não dispara envio adicional');
    const mail=messages[before];assert.deepEqual(mail.to,[sandboxTo]);assert.ok(mail.text.includes(email));assert.equal(url(mail).pathname,'/verify-email');assert.equal(url(mail).search,'');
    const [row]=await query<{token_hash:string}>(storage,"SELECT t.token_hash FROM auth_tokens t JOIN usuarios u ON u.id=t.user_id WHERE u.email=$1 AND t.type='email_verification'",[email]);
    assert.equal(row.token_hash,digest(token(mail)));assert.notEqual(row.token_hash,token(mail));
    release();assert.equal((await post('verify-email',{token:token(mail)})).status,200);
    assert.equal((await post('verify-email',{token:token(mail)})).status,400);
  });
  await t.test('IP no limite bloqueia login e cadastro, e descarta a recuperação antes da quota de e-mail', async () => {
    const ip = '192.0.2.77';
    const email = 'ip-limit@example.com';
    const body = { email, senha: password, nomeUsuario: 'Conta limite', nomeEmpresa: 'Casa limite' };
    const before = messages.length;
    for (const [operation, count] of [['login', 100], ['register', 20], ['password_reset', 20]] as const) {
      const key = digest(`${operation}:source:${ip}`);
      await query(storage, 'INSERT INTO auth_rate_limits(key,count,window_start) VALUES ($1,$2,$3)', [key, count, Date.now()]);
      const route = operation === 'password_reset' ? 'forgot-password' : operation;
      const response = await post(route, body, '', ip);
      assert.equal(response.status, operation === 'password_reset' ? 200 : 429);
      const bucket = () => query(storage, 'SELECT count,xmin::text AS version FROM auth_rate_limits WHERE key=$1', [key]);
      const saturated = await bucket();
      assert.equal(saturated[0].count, count + 1);
      assert.equal((await post(route, body, '', ip)).status, response.status);
      assert.deepEqual(await bucket(), saturated, 'rejeições repetidas não reescrevem a linha saturada');
    }
    assert.equal(messages.length, before);
    assert.equal((await query(storage, 'SELECT id FROM usuarios WHERE email=$1', [email])).length, 0);
    assert.equal((await query(storage, 'SELECT key FROM auth_rate_limits WHERE key=$1', [digest(`password_reset:cooldown:${email}`)])).length, 0);
    assert.equal((await post('login', body)).status, 401, 'outra origem ainda pode autenticar');
  });
  await t.test('limite global de recuperação mantém resposta genérica e impede tentativas',async()=>{
    const before=messages.length;
    for(const type of ['password_reset','email_verification']) {
      const key=digest(`${type}:request:global`);
      await query(storage,'INSERT INTO auth_rate_limits(key,count,window_start) VALUES ($1,120,$2) ON CONFLICT(key) DO UPDATE SET count=120,window_start=$2',[key,Date.now()]);
      const path=type==='password_reset'?'forgot-password':'resend-verification';
      const known=await post(path,{email:'security-link@example.com'});const unknown=await post(path,{email:'unknown@example.com'});
      assert.equal(known.status,200);assert.equal(unknown.status,200);assert.deepEqual(await known.json(),await unknown.json());
      const completeKey=digest(`${type}:complete:global`);
      await query(storage,'INSERT INTO auth_rate_limits(key,count,window_start) VALUES ($1,120,$2) ON CONFLICT(key) DO UPDATE SET count=120,window_start=$2',[completeKey,Date.now()]);
      assert.equal((await post(type==='password_reset'?'reset-password':'verify-email',{token:'invalid',senha:password})).status,429);
    }
    assert.equal(messages.length,before);
  });
  await t.test('todos os envios usam somente a caixa sandbox sem alterar a identidade do token',()=>{
    assert.ok(messages.length>0);
    for(const mail of messages) {
      assert.deepEqual(mail.to,[sandboxTo]);assert.equal(mail.from,'Saldo da Casa <onboarding@resend.dev>');
      assert.equal(mail.cc,undefined);assert.equal(mail.bcc,undefined);assert.match(mail.subject,/^\[Sandbox\]/);
    }
  });
});
