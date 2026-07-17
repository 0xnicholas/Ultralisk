CREATE TABLE IF NOT EXISTS orgs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    slug        VARCHAR(100) UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    display_name    VARCHAR(255) NOT NULL,
    role            VARCHAR(50) NOT NULL DEFAULT 'developer',
    totp_secret     VARCHAR(64),
    totp_enabled    BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id),
    user_id         UUID REFERENCES users(id),
    key_prefix      VARCHAR(20) NOT NULL,
    key_hash        VARCHAR(255) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invitations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id),
    email           VARCHAR(255) NOT NULL,
    token           VARCHAR(100) UNIQUE NOT NULL,
    role            VARCHAR(50) NOT NULL DEFAULT 'developer',
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_by      UUID REFERENCES users(id),
    expires_at      TIMESTAMPTZ NOT NULL,
    accepted_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO orgs (id, name, slug) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Default Org', 'default')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS models (
    id              VARCHAR(100) PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    provider        VARCHAR(100) NOT NULL,
    description     TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    context_length  INTEGER NOT NULL DEFAULT 4096,
    pricing_per_1k_input   DECIMAL(10,6) NOT NULL DEFAULT 0,
    pricing_per_1k_output  DECIMAL(10,6) NOT NULL DEFAULT 0,
    capabilities    JSONB DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_summary (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id),
    year_month      VARCHAR(7) NOT NULL,
    total_tokens    BIGINT NOT NULL DEFAULT 0,
    total_cost      DECIMAL(12,6) NOT NULL DEFAULT 0,
    UNIQUE(org_id, year_month)
);

-- Seed models (matching Gateway route_table.json)
INSERT INTO models (id, name, provider, description, context_length, pricing_per_1k_input, pricing_per_1k_output, capabilities) VALUES
  ('llama-3.1-8b-instruct', 'Llama 3.1 8B Instruct', 'Meta', '8B parameter instruction-tuned model', 131072, 0.00006, 0.00006, '["chat","completion","json_mode","tool_calling"]'),
  ('llama-3.3-70b-instruct', 'Llama 3.3 70B Instruct', 'Meta', '70B parameter instruction-tuned model', 131072, 0.00059, 0.00079, '["chat","completion","json_mode","tool_calling"]')
ON CONFLICT DO NOTHING;
