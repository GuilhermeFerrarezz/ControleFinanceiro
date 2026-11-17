import bcrypt from 'bcryptjs';
import { currentUser } from './auth';
import { isPlatformOwner } from './platform-owner';
import { inTransaction } from './postgres';
import { consumeLimit } from './rate-limit';
import { InputError, passwordValue } from './validation';
import { withPasswordBudget } from './security-limits';
import { findUsuarioByEmail } from '../models/Usuario';
import { platformAudit, platformSettings } from '../models/Platform';

export class PlatformError extends InputError {
  constructor(message: string, public status: number) { super(message); }
}
export async function requirePlatformAdmin() {
  const user = await currentUser();
  if (!user) throw new PlatformError('Entre na sua conta.',401);
  if (!isPlatformOwner(user.id) || !user.emailVerified) throw new PlatformError('Acesso restrito ao administrador da plataforma.',403);
  return user;
}
export async function changePlatform(body: Record<string, unknown>) {
  const actor = await requirePlatformAdmin();
  if (!await consumeLimit(`platform-admin:password:${actor.id}`,30,15*60_000)) throw new PlatformError('Muitas tentativas. Aguarde antes de tentar novamente.',429);
  const senha = passwordValue(body.senha);
  const account = await findUsuarioByEmail(actor.email);
  if (!account?.ativo || !await withPasswordBudget(() => bcrypt.compare(senha,account.senha))) throw new PlatformError('Senha incorreta.',403);
  if (body.action!=='settings' && body.action!=='restaurant' && body.action!=='user') throw new InputError('Operação inválida.');
  if (body.action === 'settings') {
    for (const value of [body.maxRestaurants,body.maxUsers]) if (!Number.isSafeInteger(value) || Number(value)<0 || Number(value)>1000000) throw new InputError('Informe limites inteiros entre 0 e 1.000.000.');
  } else {
    if (typeof body.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id) || typeof body.ativo !== 'boolean' || typeof body.expectedActive !== 'boolean') throw new InputError('Informe um cadastro e uma situação válidos.');
    if (body.action === 'user' && isPlatformOwner(body.id)) throw new PlatformError('A conta administradora não pode ser desativada pelo painel.',403);
  }
  await inTransaction(async client => {
    // Same order as creation: settings before identities. Revalidate authority
    // after acquiring locks, including the password snapshot and verification.
    const settings = await platformSettings(client,true);
    const locked = (await client.query<{ ativo: boolean; senha: string; verified: boolean }>('SELECT ativo,senha,(email_verified_at IS NOT NULL) AS verified FROM usuarios WHERE id=$1 FOR UPDATE',[actor.id])).rows[0];
    if (!isPlatformOwner(actor.id) || !locked?.ativo || !locked.verified || locked.senha!==account.senha) throw new PlatformError('Sessão indisponível. Entre novamente.',403);
    if (body.action==='settings') {
      const expected = body.expectedSettings as Record<string,unknown> | undefined;
      if (!expected || expected.maxRestaurants!==settings.maxRestaurants || expected.maxUsers!==settings.maxUsers) throw new PlatformError('Os limites mudaram. Atualize o painel.',409);
      await client.query('UPDATE platform_settings SET max_restaurants=$1,max_users=$2,updated_at=clock_timestamp() WHERE id=1',[body.maxRestaurants,body.maxUsers]);
      await platformAudit(actor.id,'settings',null,settings,{maxRestaurants:body.maxRestaurants,maxUsers:body.maxUsers},client);
      return;
    }
    const table = body.action==='restaurant' ? 'empresas' : 'usuarios';
    const previous = (await client.query<{ ativo: boolean }>(`SELECT ativo FROM ${table} WHERE id=$1 FOR UPDATE`,[body.id])).rows[0];
    if (!previous) throw new PlatformError('Cadastro não encontrado.',404);
    if (previous.ativo!==body.expectedActive) throw new PlatformError('A situação mudou. Atualize o painel.',409);
    await client.query(`UPDATE ${table} SET ativo=$1,updated_at=clock_timestamp() WHERE id=$2`,[body.ativo,body.id]);
    if (body.ativo===false) {
      await client.query(body.action==='restaurant' ? 'DELETE FROM refresh_tokens WHERE empresa_id=$1' : 'DELETE FROM refresh_tokens WHERE user_id=$1',[body.id]);
      if (body.action==='user') await client.query('DELETE FROM auth_tokens WHERE user_id=$1',[body.id]);
    }
    await platformAudit(actor.id,String(body.action),String(body.id),previous,{ativo:body.ativo},client);
  });
}
