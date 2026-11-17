import { readFile, writeFile } from 'node:fs/promises';
import { db } from '../src/lib/db';
import { emailValue } from '../src/lib/validation';

async function main() {
  const email = emailValue(process.argv[2]);
  const user = (await db.query<{ id: string; verified: boolean }>('SELECT id,(email_verified_at IS NOT NULL) AS verified FROM usuarios WHERE lower(btrim(email))=$1 AND ativo',[email])).rows[0];
  if (!user) throw new Error('Crie primeiro sua conta pessoal no site. Nenhuma permissão foi alterada.');
  const path = new URL('../.env',import.meta.url);
  let env = '';
  try { env = await readFile(path,'utf8'); } catch(error) { if ((error as NodeJS.ErrnoException).code!=='ENOENT') throw error; }
  const line = `PLATFORM_ADMIN_USER_ID=${user.id}`;
  env = env.replace(/^PLATFORM_ADMIN_USER_ID\s*=.*\r?\n?/gm,'');
  await writeFile(path,`${env.trimEnd()}\n${line}\n`,{mode:0o600});
  console.log('Conta vinculada como administradora exclusiva. Reinicie o servidor e acesse /admin.');
  if (!user.verified) console.log('Confirme seu e-mail antes de acessar o painel. Em desenvolvimento sem Resend, use o link do terminal.');
}
main().catch(error => { console.error(error instanceof Error && /Crie primeiro|e-mail válido/.test(error.message) ? error.message : 'Não foi possível configurar. Confira o e-mail, a conexão e a permissão para editar o .env.'); process.exitCode=1; }).finally(() => db.end());
