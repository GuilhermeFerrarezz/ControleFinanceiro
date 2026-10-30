-- PostgreSQL schema for a new database; this does not import SQLite data.
-- Repositories use snake_case columns and must update updated_at on writes.
BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS empresas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL,
    cnpj VARCHAR(255) UNIQUE,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL,
    papel VARCHAR(255) NOT NULL DEFAULT 'colaborador',
    empresa_id UUID REFERENCES empresas(id) ON UPDATE CASCADE ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_normalized ON usuarios (lower(btrim(email)));
CREATE INDEX IF NOT EXISTS usuarios_empresa ON usuarios (empresa_id);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE CASCADE,
    empresa_id UUID REFERENCES empresas(id) ON UPDATE CASCADE ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS sessions_expiration ON refresh_tokens (expires_at);
CREATE INDEX IF NOT EXISTS sessions_user ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS sessions_company ON refresh_tokens (empresa_id);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL CHECK (count >= 0),
    -- Epoch milliseconds, matching the existing rate limiter.
    window_start BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS restaurant_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE CASCADE,
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON UPDATE CASCADE ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'employee')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, empresa_id)
);
CREATE INDEX IF NOT EXISTS members_company ON restaurant_members (empresa_id);

CREATE TABLE IF NOT EXISTS restaurant_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON UPDATE CASCADE ON DELETE CASCADE,
    invited_by UUID NOT NULL REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    email VARCHAR(255) NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS invitation_company ON restaurant_invitations (empresa_id);
CREATE INDEX IF NOT EXISTS invitation_author ON restaurant_invitations (invited_by);
CREATE UNIQUE INDEX IF NOT EXISTS invitation_pending_email
    ON restaurant_invitations (empresa_id, lower(btrim(email)))
    WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    created_by UUID NOT NULL REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    updated_by UUID NOT NULL REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    request_id UUID NOT NULL,
    description VARCHAR(120) NOT NULL,
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 9999999999),
    date DATE NOT NULL CHECK (date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
    category TEXT NOT NULL CHECK (category IN (
        'alimentos', 'funcionarios', 'produtos', 'bebidas', 'embalagens',
        'contas', 'manutencao', 'impostos', 'outros'
    )),
    merchant VARCHAR(120) NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'pending')),
    payment_method TEXT NOT NULL DEFAULT 'not_informed' CHECK (payment_method IN (
        'not_informed', 'pix', 'cash', 'debit', 'credit', 'transfer', 'boleto'
    )),
    notes TEXT NOT NULL DEFAULT '',
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    UNIQUE (empresa_id, request_id)
);
CREATE INDEX IF NOT EXISTS expenses_company_date
    ON expenses (empresa_id, date DESC, created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS expenses_company_category
    ON expenses (empresa_id, category, date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS expenses_created_by ON expenses (created_by);
CREATE INDEX IF NOT EXISTS expenses_updated_by ON expenses (updated_by);

CREATE TABLE IF NOT EXISTS expense_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    actor_id UUID NOT NULL REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
    before JSONB,
    after JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS audit_expense ON expense_audit (empresa_id, expense_id);
CREATE INDEX IF NOT EXISTS audit_expense_reference ON expense_audit (expense_id);
CREATE INDEX IF NOT EXISTS audit_actor ON expense_audit (actor_id);

COMMIT;
