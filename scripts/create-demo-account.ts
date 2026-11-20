import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

async function main() {
  // Must be selected before dynamically importing any database module.
  const connection = process.env.DEMO_DATABASE_URL?.trim();
  if (!connection) throw new Error('Configure DEMO_DATABASE_URL no .env com o banco do site. DATABASE_URL local não será usada.');
  const target = new URL(connection);
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) throw new Error('Use uma conexão PostgreSQL.');
  process.env.DATABASE_URL = connection;
  const { db } = await import('../src/lib/db');
  let credentialFile: string | undefined;
  let committed = false;
  try {
    const { createDemoAccount } = await import('../src/lib/demo-account');
    const { todayInSaoPaulo } = await import('../src/lib/expense-shared');
    const end = todayInSaoPaulo();
    const beginning = new Date(`${end}T12:00:00Z`);
    beginning.setUTCMonth(beginning.getUTCMonth() - 2, 1);
    const start = beginning.toISOString().slice(0, 10);
    const email = 'demo@saldodacasa.app';
    const password = `Demo!${randomBytes(18).toString('base64url')}`;
    const folder = resolve('.backups');
    await mkdir(folder, { recursive: true });
    credentialFile = resolve(folder, `demo-access-${randomUUID()}.json`);
    // Ensure credentials can be saved before committing a new identity.
    await writeFile(credentialFile, JSON.stringify({ email, password, start, end }, null, 2), { mode: 0o600, flag: 'wx' });
    console.log(`Destino: ${target.hostname}/${target.pathname.slice(1)}. Criando somente um restaurante fictício separado.`);
    const result = await createDemoAccount(email, password, start, end);
    committed = true;
    console.log(JSON.stringify({ ...result, email, credentialFile, expires: null }, null, 2));
  } finally {
    if (!committed && credentialFile) await unlink(credentialFile).catch(() => undefined);
    await db.end();
  }
}
main().catch(error => {
  // No driver diagnostics or connection strings in the terminal.
  console.error(error instanceof Error && !('code' in error) && !error.message.includes('://')
    ? error.message : 'Não foi possível criar a demonstração. Confira a conexão, as tabelas e a capacidade de usuários/restaurantes.');
  process.exitCode = 1;
});
