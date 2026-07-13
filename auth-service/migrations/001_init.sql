CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE orgs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    slug        VARCHAR(100) NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    display_name    VARCHAR(255),
    role            VARCHAR(50) NOT NULL DEFAULT 'developer',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    org_id          UUID NOT NULL REFERENCES orgs(id),
    key_hash        VARCHAR(64) NOT NULL UNIQUE,
    key_prefix      VARCHAR(10) NOT NULL,
    name            VARCHAR(255),
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    quota_limits    JSONB DEFAULT '{}',
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at      TIMESTAMPTZ
);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);

-- Seed data: test org
INSERT INTO orgs (id, name, slug) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Test Org', 'test-org')
ON CONFLICT DO NOTHING;
