import sqlite3 from 'sqlite3';

// Run offline, before starting the web server. Each migration commits atomically.
export async function migrateDatabase(storage: string) {
  const db = new sqlite3.Database(storage);
  const exec = (sql: string) => new Promise<void>((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
  const all = <T>(sql: string) => new Promise<T[]>((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows as T[])));
  try {
    await exec('PRAGMA foreign_keys = OFF; PRAGMA busy_timeout = 10000; BEGIN IMMEDIATE;');
    await exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS empresas (
        id UUID PRIMARY KEY NOT NULL, nome VARCHAR(255) NOT NULL, cnpj VARCHAR(255) UNIQUE,
        ativo TINYINT(1) DEFAULT 1, createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL);
      CREATE TABLE IF NOT EXISTS usuarios (
        id UUID PRIMARY KEY NOT NULL, nome VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE,
        senha VARCHAR(255) NOT NULL, papel VARCHAR(255) DEFAULT 'colaborador', empresaId UUID,
        createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL,
        FOREIGN KEY (empresaId) REFERENCES empresas(id) ON UPDATE CASCADE ON DELETE SET NULL);
      CREATE TABLE IF NOT EXISTS "refresh-tokens" (
        id UUID PRIMARY KEY NOT NULL, token TEXT NOT NULL UNIQUE, userId UUID NOT NULL,
        expiresAt DATETIME NOT NULL, createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL,
        FOREIGN KEY (userId) REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE CASCADE);`);
    const applied = await all<{ version: string }>('SELECT version FROM schema_migrations');
    if (!applied.some(row => row.version === '001-auth-sessions')) {
      const duplicates = await all('SELECT 1 FROM usuarios GROUP BY lower(trim(email)) HAVING count(*) > 1 LIMIT 1');
      if (duplicates.length) throw new Error('Existem e-mails duplicados após normalização. Resolva-os antes da migração.');
      const columns = await all<{ name: string; type: string }>('PRAGMA table_info(usuarios)');
      if (columns.find(column => column.name === 'empresaId')?.type.toUpperCase() === 'INTEGER') {
        await exec(`CREATE TABLE usuarios_uuid (
          id UUID PRIMARY KEY NOT NULL, nome VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE,
          senha VARCHAR(255) NOT NULL, papel VARCHAR(255) DEFAULT 'colaborador', empresaId UUID,
          createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL,
          FOREIGN KEY (empresaId) REFERENCES empresas(id) ON UPDATE CASCADE ON DELETE SET NULL);
          INSERT INTO usuarios_uuid SELECT id,nome,email,senha,papel,empresaId,createdAt,updatedAt FROM usuarios;
          DROP TABLE usuarios; ALTER TABLE usuarios_uuid RENAME TO usuarios;`);
      }
      await exec(`UPDATE usuarios SET email = lower(trim(email));
        DELETE FROM "refresh-tokens" WHERE token LIKE '%.%.%';
        CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_normalized ON usuarios(lower(trim(email)));
        CREATE INDEX IF NOT EXISTS usuarios_empresa ON usuarios(empresaId);
        CREATE INDEX IF NOT EXISTS sessions_expiration ON "refresh-tokens"(expiresAt);
        CREATE TABLE IF NOT EXISTS auth_rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, windowStart INTEGER NOT NULL);
        INSERT INTO schema_migrations(version) VALUES ('001-auth-sessions');`);
    }
    if (!applied.some(row => row.version === '002-restaurant-memberships')) {
      await exec(`CREATE TABLE restaurant_members (
        id UUID PRIMARY KEY NOT NULL, userId UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        empresaId UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('owner','employee')),
        createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL, UNIQUE(userId,empresaId));
        INSERT INTO restaurant_members (id,userId,empresaId,role,createdAt,updatedAt)
          SELECT id,id,empresaId,CASE WHEN papel='admin' THEN 'owner' ELSE 'employee' END,createdAt,updatedAt
          FROM usuarios WHERE empresaId IS NOT NULL;
        CREATE INDEX members_company ON restaurant_members(empresaId);
        ALTER TABLE "refresh-tokens" ADD COLUMN empresaId UUID REFERENCES empresas(id) ON DELETE SET NULL;
        UPDATE "refresh-tokens" SET empresaId = (SELECT empresaId FROM usuarios WHERE usuarios.id = "refresh-tokens".userId);
        CREATE TABLE restaurant_invitations (
          id UUID PRIMARY KEY NOT NULL, empresaId UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
          invitedBy UUID NOT NULL REFERENCES usuarios(id), email TEXT NOT NULL, tokenHash TEXT NOT NULL UNIQUE,
          expiresAt DATETIME NOT NULL, acceptedAt DATETIME, revokedAt DATETIME,
          createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL);
        CREATE INDEX invitation_company ON restaurant_invitations(empresaId);
        CREATE UNIQUE INDEX invitation_pending_email ON restaurant_invitations(empresaId,email) WHERE acceptedAt IS NULL AND revokedAt IS NULL;
        INSERT INTO schema_migrations(version) VALUES ('002-restaurant-memberships');`);
    }
    if (!applied.some(row => row.version === '003-expenses')) {
      await exec(`CREATE TABLE expenses (
        id UUID PRIMARY KEY NOT NULL, empresaId UUID NOT NULL REFERENCES empresas(id),
        createdBy UUID NOT NULL REFERENCES usuarios(id), updatedBy UUID NOT NULL REFERENCES usuarios(id),
        requestId UUID NOT NULL, description VARCHAR(120) NOT NULL,
        amountCents BIGINT NOT NULL CHECK(amountCents > 0 AND amountCents <= 9999999999),
        date TEXT NOT NULL, category TEXT NOT NULL CHECK(category IN ('alimentos','funcionarios','produtos','bebidas','embalagens','contas','manutencao','impostos','outros')),
        merchant VARCHAR(120) NOT NULL DEFAULT '', status TEXT NOT NULL CHECK(status IN ('paid','pending')),
        paymentMethod TEXT NOT NULL CHECK(paymentMethod IN ('not_informed','pix','cash','debit','credit','transfer','boleto')),
        notes TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1,
        createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL, deletedAt DATETIME,
        UNIQUE(empresaId,requestId));
        CREATE INDEX expenses_company_date ON expenses(empresaId,date) WHERE deletedAt IS NULL;
        CREATE INDEX expenses_company_category ON expenses(empresaId,category,date) WHERE deletedAt IS NULL;
        CREATE TABLE expense_audit (
          id UUID PRIMARY KEY NOT NULL, expenseId UUID NOT NULL REFERENCES expenses(id),
          empresaId UUID NOT NULL REFERENCES empresas(id), actorId UUID NOT NULL REFERENCES usuarios(id),
          action TEXT NOT NULL CHECK(action IN ('created','updated','deleted')),
          before TEXT, after TEXT, createdAt DATETIME NOT NULL);
        CREATE INDEX audit_expense ON expense_audit(empresaId,expenseId);
        INSERT INTO schema_migrations(version) VALUES ('003-expenses');`);
    }
    const broken = await all('PRAGMA foreign_key_check');
    if (broken.length) throw new Error('Há relacionamentos inválidos no banco. Migração cancelada.');
    await exec('COMMIT; PRAGMA foreign_keys = ON;');
  } catch (error) {
    await exec('ROLLBACK;').catch(() => undefined);
    throw error;
  } finally {
    await new Promise<void>((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
  }
}
