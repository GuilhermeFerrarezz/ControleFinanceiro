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

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;
CREATE TABLE IF NOT EXISTS platform_settings (
    id INTEGER PRIMARY KEY CHECK (id=1),
    max_restaurants INTEGER NOT NULL CHECK (max_restaurants BETWEEN 0 AND 1000000),
    max_users INTEGER NOT NULL CHECK (max_users BETWEEN 0 AND 1000000),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO platform_settings(id,max_restaurants,max_users) VALUES (1,10,100) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS platform_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    action TEXT NOT NULL,
    target_id UUID,
    before JSONB NOT NULL,
    after JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS auth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    type TEXT NOT NULL CHECK (type IN ('email_verification', 'password_reset')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, type)
);
CREATE INDEX IF NOT EXISTS auth_tokens_expiration ON auth_tokens (expires_at);

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

-- Idempotent addition for databases created before demonstration data controls.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS demo_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_demo_key ON expenses (empresa_id, demo_key) WHERE demo_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS restaurant_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('category','merchant')),
    name VARCHAR(120) NOT NULL,
    normalized_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (empresa_id,kind,normalized_name)
);
-- Existing category keys remain valid; custom categories use UUID keys.
ALTER TABLE restaurant_catalog ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE restaurant_catalog ADD COLUMN IF NOT EXISTS category_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS catalog_category_key ON restaurant_catalog (empresa_id,category_key);
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_category_check CHECK (
    category IN ('alimentos','funcionarios','produtos','bebidas','embalagens','contas','manutencao','impostos','outros')
    OR category ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);

CREATE TABLE IF NOT EXISTS daily_revenue (
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    date DATE NOT NULL CHECK (date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
    amount_cents BIGINT NOT NULL CHECK (amount_cents BETWEEN 0 AND 9999999999),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (empresa_id, date)
);

ALTER TABLE daily_revenue ADD COLUMN IF NOT EXISTS delivery_meals INTEGER CHECK (delivery_meals >= 0);
ALTER TABLE daily_revenue ADD COLUMN IF NOT EXISTS demo_key TEXT;
ALTER TABLE daily_revenue ADD COLUMN IF NOT EXISTS dine_in_meals INTEGER CHECK (dine_in_meals >= 0);
ALTER TABLE daily_revenue ADD COLUMN IF NOT EXISTS meals_sold INTEGER CHECK (meals_sold >= 0);
ALTER TABLE daily_revenue ADD COLUMN IF NOT EXISTS order_count INTEGER CHECK (order_count >= 0);

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array');

-- Product catalogs are shared by each restaurant's team.
ALTER TABLE restaurant_catalog DROP CONSTRAINT IF EXISTS restaurant_catalog_kind_check;
ALTER TABLE restaurant_catalog ADD CONSTRAINT restaurant_catalog_kind_check CHECK (kind IN ('category','merchant','product','storage'));
ALTER TABLE restaurant_catalog ADD COLUMN IF NOT EXISTS default_unit TEXT NOT NULL DEFAULT 'un'
    CHECK (default_unit IN ('un','kg','g','L','ml','pacote','caixa'));

-- Run once: seed existing restaurants and retain the identity of historical items.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version='20261111_product_catalog') THEN
    INSERT INTO restaurant_catalog (empresa_id,kind,name,normalized_name,default_unit)
    SELECT e.id,'product',p.name,p.normalized,p.unit FROM empresas e CROSS JOIN (VALUES
        ('Arroz','arroz','kg'),
        ('Feijão','feijao','kg'),
        ('Carne bovina','carne bovina','kg'),
        ('Carne suína','carne suina','kg'),
        ('Frango','frango','kg'),
        ('Peixe','peixe','kg'),
        ('Batata','batata','kg'),
        ('Batata frita congelada','batata frita congelada','kg'),
        ('Tomate','tomate','kg'),
        ('Cebola','cebola','kg'),
        ('Alho','alho','kg'),
        ('Alface','alface','un'),
        ('Cenoura','cenoura','kg'),
        ('Óleo de soja','oleo de soja','L'),
        ('Azeite','azeite','L'),
        ('Sal','sal','kg'),
        ('Açúcar','acucar','kg'),
        ('Farinha de trigo','farinha de trigo','kg'),
        ('Macarrão','macarrao','pacote'),
        ('Molho de tomate','molho de tomate','pacote'),
        ('Leite','leite','L'),
        ('Queijo','queijo','kg'),
        ('Ovos','ovos','un'),
        ('Café','cafe','kg'),
        ('Detergente','detergente','L'),
        ('Água sanitária','agua sanitaria','L'),
        ('Embalagem para marmita','embalagem para marmita','un')
    ) p(name,normalized,unit) ON CONFLICT (empresa_id,kind,normalized_name) DO NOTHING;
    INSERT INTO restaurant_catalog (empresa_id,kind,name,normalized_name,default_unit)
    SELECT e.empresa_id,'product',min(btrim(item->>'name')), translate(lower(regexp_replace(btrim(item->>'name'), '\s+', ' ', 'g')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),min(item->>'unit')
    FROM expenses e CROSS JOIN LATERAL jsonb_array_elements(e.items) item
    WHERE length(btrim(item->>'name')) BETWEEN 1 AND 120
    GROUP BY e.empresa_id,translate(lower(regexp_replace(btrim(item->>'name'), '\s+', ' ', 'g')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
    ON CONFLICT (empresa_id,kind,normalized_name) DO NOTHING;
    UPDATE expenses e SET items=(SELECT coalesce(jsonb_agg(item || jsonb_build_object('productId',p.id) ORDER BY position),'[]'::jsonb)
      FROM jsonb_array_elements(e.items) WITH ORDINALITY AS entries(item,position)
      JOIN restaurant_catalog p ON p.empresa_id=e.empresa_id AND p.kind='product' AND p.normalized_name=translate(lower(regexp_replace(btrim(item->>'name'), '\s+', ' ', 'g')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'))
    WHERE jsonb_array_length(e.items)>0;
    INSERT INTO schema_migrations(version) VALUES ('20261111_product_catalog');
  END IF;
END $$;

ALTER TABLE restaurant_catalog ADD COLUMN IF NOT EXISTS package_content JSONB CHECK (package_content IS NULL OR jsonb_typeof(package_content)='object');

-- Inventory balances derive from received purchase items plus an immutable manual ledger.
-- Composite keys prevent references to another restaurant's products.
CREATE UNIQUE INDEX IF NOT EXISTS catalog_company_id ON restaurant_catalog(empresa_id,id);
CREATE TABLE IF NOT EXISTS inventory_products (
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    unit TEXT NOT NULL CHECK (unit IN ('kg','L','un','pacote','caixa')),
    minimum NUMERIC(24,9) NOT NULL DEFAULT 0 CHECK (minimum BETWEEN 0 AND 1000000),
    location VARCHAR(120) NOT NULL DEFAULT '',
    suppliers JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(suppliers)='array'),
    PRIMARY KEY (empresa_id,product_id),
    FOREIGN KEY (empresa_id,product_id) REFERENCES restaurant_catalog(empresa_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL,
    product_id UUID NOT NULL,
    actor_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    request_id UUID NOT NULL,
    quantity NUMERIC(24,9) NOT NULL CHECK (quantity <> 0),
    date DATE NOT NULL CHECK (date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
    reason VARCHAR(300) NOT NULL DEFAULT '' CHECK (length(btrim(reason)) <= 300),
    source TEXT NOT NULL CHECK (source IN ('opening','entry','consumption','waste','count','correction')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    input JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (empresa_id,request_id),
    FOREIGN KEY (empresa_id,product_id) REFERENCES inventory_products(empresa_id,product_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS inventory_history ON inventory_movements(empresa_id,date DESC,created_at DESC,id);
CREATE INDEX IF NOT EXISTS inventory_product_history ON inventory_movements(empresa_id,product_id);
CREATE INDEX IF NOT EXISTS inventory_actor ON inventory_movements(actor_id);

-- Existing databases also allow movements without a reason.
ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_reason_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_reason_check CHECK (length(btrim(reason)) <= 300);
ALTER TABLE inventory_movements ALTER COLUMN reason SET DEFAULT '';

CREATE OR REPLACE VIEW inventory_purchase_lines AS
SELECT e.empresa_id,e.id AS expense_id,e.created_by,e.created_at,e.date,e.merchant,
       item->>'productId' AS product_id,position,
       item->>'stock' = 'true' AS stocked,
       (item->>'amountCents')::numeric AS amount_cents,
       CASE WHEN measure.unit='g' THEN 'kg' WHEN measure.unit='ml' THEN 'L' ELSE measure.unit END AS unit,
       (item->>'quantity')::numeric *
         CASE WHEN item->>'unit' IN ('pacote','caixa') AND item->'packageContent' IS NOT NULL AND item->'packageContent' <> 'null'::jsonb
              THEN (item->'packageContent'->>'quantity')::numeric ELSE 1 END /
         CASE WHEN measure.unit IN ('g','ml') THEN 1000 ELSE 1 END AS quantity
FROM expenses e CROSS JOIN LATERAL jsonb_array_elements(e.items) WITH ORDINALITY AS entries(item,position)
CROSS JOIN LATERAL (SELECT CASE WHEN item->>'unit' IN ('pacote','caixa') THEN coalesce(item->'packageContent'->>'unit',item->>'unit') ELSE item->>'unit' END AS unit) measure
WHERE e.deleted_at IS NULL;

COMMIT;
