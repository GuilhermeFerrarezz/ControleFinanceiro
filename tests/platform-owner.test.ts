import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isPlatformOwner,platformRole} from '../src/lib/platform-owner';
test('sem UUID válido configurado nenhum usuário recebe administração',t=>{
  const previous=process.env.PLATFORM_ADMIN_USER_ID;
  t.after(()=>{if(previous===undefined)delete process.env.PLATFORM_ADMIN_USER_ID;else process.env.PLATFORM_ADMIN_USER_ID=previous;});
  const id='8ed2c979-e987-44d7-8adf-0bce421c7d55';
  for(const value of [undefined,'','admin','owner','*',`${id},${id}`]){
    if(value===undefined)delete process.env.PLATFORM_ADMIN_USER_ID;else process.env.PLATFORM_ADMIN_USER_ID=value;
    assert.equal(isPlatformOwner(id),false);
  }
  process.env.PLATFORM_ADMIN_USER_ID=id;assert.equal(isPlatformOwner(id),true);assert.equal(isPlatformOwner('9ed2c979-e987-44d7-8adf-0bce421c7d55'),false);
  assert.equal(platformRole(id,false),'USER');assert.equal(platformRole(id,true),'ADMIN');
  assert.equal(platformRole('9ed2c979-e987-44d7-8adf-0bce421c7d55',true),'USER');
});
