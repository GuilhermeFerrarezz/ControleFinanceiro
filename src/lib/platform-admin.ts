import bcrypt from 'bcryptjs';
import { currentUser, hashToken, SESSION_COOKIE } from './auth';
import { cookies } from 'next/headers';
import { isPlatformOwner, platformRole } from './platform-owner';
import { inTransaction } from './postgres';
import { consumeLimit } from './rate-limit';
import { InputError, passwordValue } from './validation';
import { withPasswordBudget } from './security-limits';
import { findUsuarioByEmail } from '../models/Usuario';
import { deletePlatformAccount, platformAudit, platformSettings } from '../models/Platform';
import { randomBytes } from 'node:crypto';
import { deleteEmpresa } from '../models/Empresa';

export class PlatformError extends InputError {
  constructor(message: string, public status: number) { super(message); }
}
export async function requirePlatformAdmin() {
  const user = await currentUser();
  if (!user) throw new PlatformError('Entre na sua conta.',401);
  if (user.platformRole !== 'ADMIN') throw new PlatformError('Acesso restrito ao administrador da plataforma.',403);
  return user;
}
export async function changePlatform(body: Record<string, unknown>) {
  const actor = await requirePlatformAdmin();
  const sessionHash=hashToken((await cookies()).get(SESSION_COOKIE)?.value||'');
  if (!await consumeLimit(`platform-admin:password:${actor.id}`,30,15*60_000)) throw new PlatformError('Muitas tentativas. Aguarde antes de tentar novamente.',429);
  const senha = passwordValue(body.senha);
  const account = await findUsuarioByEmail(actor.email);
  if (!account?.ativo || !await withPasswordBudget(() => bcrypt.compare(senha,account.senha))) throw new PlatformError('Senha incorreta.',403);
  if (body.action!=='settings' && body.action!=='restaurant' && body.action!=='user' && body.action!=='delete-user' && body.action!=='delete-restaurant') throw new InputError('Operação inválida.');
  if (body.action === 'settings') {
    for (const value of [body.maxRestaurants,body.maxUsers]) if (!Number.isSafeInteger(value) || Number(value)<0 || Number(value)>1000000) throw new InputError('Informe limites inteiros entre 0 e 1.000.000.');
  } else {
    if (typeof body.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id) || (!['delete-user','delete-restaurant'].includes(body.action as string) && typeof body.ativo !== 'boolean') || typeof body.expectedActive !== 'boolean') throw new InputError('Informe um cadastro e uma situação válidos.');
    if ((body.action === 'user' || body.action==='delete-user') && isPlatformOwner(body.id)) throw new PlatformError('A conta administradora não pode ser desativada ou excluída pelo painel.',403);
    if (body.action==='delete-user' && body.confirmation!=='EXCLUIR') throw new InputError('Digite EXCLUIR para confirmar a exclusão definitiva.');
    if (body.action==='delete-restaurant' && (typeof body.name!=='string' || !body.name.length || body.name.length>120 || body.name.includes('\0') || body.confirmation!==body.name)) throw new InputError('Digite o nome exato do restaurante para confirmar a exclusão definitiva.');
  }
  const replacementPassword = body.action==='delete-user' ? await withPasswordBudget(() => bcrypt.hash(randomBytes(32).toString('base64url'),10)) : '';
  return inTransaction(async client => {
    // Same order as creation: settings before identities. Revalidate authority
    // after acquiring locks, including the password snapshot and verification.
    const settings = await platformSettings(client,true);
    const locked = (await client.query<{ ativo: boolean; senha: string; verified: boolean }>('SELECT ativo,senha,(email_verified_at IS NOT NULL) AS verified FROM usuarios WHERE id=$1 FOR UPDATE',[actor.id])).rows[0];
    if (!locked?.ativo || platformRole(actor.id, locked.verified) !== 'ADMIN' || locked.senha!==account.senha) throw new PlatformError('Sessão indisponível. Entre novamente.',403);
    const session=await client.query('SELECT id FROM refresh_tokens WHERE token=$1 AND user_id=$2 AND expires_at>clock_timestamp() FOR SHARE',[sessionHash,actor.id]);
    if (!session.rowCount) throw new PlatformError('Sessão inválida ou expirada. Entre novamente.',401);
    if (body.action==='settings') {
      const expected = body.expectedSettings as Record<string,unknown> | undefined;
      if (!expected || expected.maxRestaurants!==settings.maxRestaurants || expected.maxUsers!==settings.maxUsers) throw new PlatformError('Os limites mudaram. Atualize o painel.',409);
      await client.query('UPDATE platform_settings SET max_restaurants=$1,max_users=$2,updated_at=clock_timestamp() WHERE id=1',[body.maxRestaurants,body.maxUsers]);
      await platformAudit(actor.id,'settings',null,settings,{maxRestaurants:body.maxRestaurants,maxUsers:body.maxUsers},client);
      return;
    }
    if (body.action==='delete-user') return deletePlatformAccount(String(body.id),body.expectedActive as boolean,replacementPassword,actor.id,client);
    if (body.action==='delete-restaurant') {
      const previous=(await client.query<{nome:string;ativo:boolean}>('SELECT nome,ativo FROM empresas WHERE id=$1 FOR UPDATE',[body.id])).rows[0];
      if (!previous) throw new PlatformError('Restaurante não encontrado ou já excluído.',404);
      if (previous.ativo!==body.expectedActive || previous.nome!==body.name) throw new PlatformError('O restaurante mudou. Atualize o painel antes de excluir.',409);
      if (previous.ativo) throw new PlatformError('Desative o restaurante antes de excluí-lo definitivamente.',409);
      // ON DELETE SET NULL updates legacy account references. Lock those
      // identities before sessions, matching concurrent password resets.
      await client.query('SELECT id FROM usuarios WHERE empresa_id=$1 ORDER BY id FOR UPDATE',[body.id]);
      await client.query('DELETE FROM refresh_tokens WHERE empresa_id=$1',[body.id]);
      await deleteEmpresa(String(body.id),client);
      await platformAudit(actor.id,'restaurant_deleted',String(body.id),previous,{deleted:true,kind:'restaurant'},client);
      return {restaurantDeleted:true};
    }
    const restaurant = body.action === 'restaurant';
    const selectStatus = restaurant
      ? 'SELECT ativo FROM empresas WHERE id=$1 FOR UPDATE'
      : 'SELECT ativo FROM usuarios WHERE id=$1 AND deleted_at IS NULL FOR UPDATE';
    const previous = (await client.query<{ ativo: boolean }>(selectStatus, [body.id])).rows[0];
    if (!previous) throw new PlatformError('Cadastro não encontrado.',404);
    if (previous.ativo!==body.expectedActive) throw new PlatformError('A situação mudou. Atualize o painel.',409);
    const updateStatus = restaurant
      ? 'UPDATE empresas SET ativo=$1,updated_at=clock_timestamp() WHERE id=$2'
      : 'UPDATE usuarios SET ativo=$1,updated_at=clock_timestamp() WHERE id=$2';
    await client.query(updateStatus, [body.ativo, body.id]);
    if (body.ativo===false) {
      await client.query(body.action==='restaurant' ? 'DELETE FROM refresh_tokens WHERE empresa_id=$1' : 'DELETE FROM refresh_tokens WHERE user_id=$1',[body.id]);
      if (body.action==='user') await client.query('DELETE FROM auth_tokens WHERE user_id=$1',[body.id]);
    }
    await platformAudit(actor.id,String(body.action),String(body.id),previous,{ativo:body.ativo},client);
  });
}
