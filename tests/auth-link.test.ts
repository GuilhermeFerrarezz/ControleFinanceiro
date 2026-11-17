import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveAuthLinkToken} from '../src/lib/auth-link';
import {emailValue} from '../src/lib/validation';
test('link funciona após limpar a URL e repetir a inicialização em Strict Mode',()=>{
  const token='A'.repeat(43);
  const first=resolveAuthLinkToken(`#token=${token}`,'','');assert.equal(first,token);
  const replay=resolveAuthLinkToken('','',first);assert.equal(replay,token);
  assert.equal(resolveAuthLinkToken('','',replay),token);
  assert.equal(resolveAuthLinkToken('','legacy-token',''),'legacy-token');
  assert.equal(resolveAuthLinkToken('','',''),'');
});
test('fragmentos ambíguos e excessivos não usam token anterior ou legado',()=>{
  for(const fragment of ['#token=one&token=two','#other=value',`#token=${'X'.repeat(1025)}`])assert.equal(resolveAuthLinkToken(fragment,'legacy','current'),'');
});
test('endereços com caracteres de controle não chegam ao banco nem ao provedor',()=>{
  for(const email of ['user\0@example.com','user\x1b@example.com','user\x7f@example.com'])assert.throws(()=>emailValue(email),/e-mail válido/);
});
