-- Phase 1 tables for Console API (endpoints, batch_jobs, chat_sessions, extension columns)

-- Add model_id to existing billing_summary for per-model cost tracking
ALTER TABLE billing_summary ADD COLUMN IF NOT EXISTS model_id VARCHAR(100);
ALTER TABLE billing_summary DROP CONSTRAINT IF EXISTS billing_summary_org_id_year_month_key;
ALTER TABLE billing_summary DROP CONSTRAINT IF EXISTS billing_summary_org_id_year_month_model_id_key;
ALTER TABLE billing_summary ADD CONSTRAINT billing_summary_org_id_year_month_model_id_key UNIQUE(org_id, year_month, model_id);

CREATE TABLE IF NOT EXISTS endpoints (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    org_id          UUID NOT NULL REFERENCES orgs(id),
    name            VARCHAR(255) NOT NULL,
    model_id        VARCHAR(100) NOT NULL REFERENCES models(id),
    type            VARCHAR(20) NOT NULL DEFAULT 'serverless',
    replicas        INTEGER NOT NULL DEFAULT 1,
    gpu_type        VARCHAR(50) NOT NULL DEFAULT 'H100',
    gpu_count       INTEGER NOT NULL DEFAULT 1,
    autoscaling_policy JSONB,
    status          VARCHAR(20) NOT NULL DEFAULT 'creating',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS batch_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    org_id          UUID NOT NULL REFERENCES orgs(id),
    name            VARCHAR(255) NOT NULL,
    model_id        VARCHAR(100) NOT NULL REFERENCES models(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    input_file      TEXT NOT NULL,
    output_file     TEXT,
    callback_url    TEXT,
    token_count     BIGINT,
    cost            DECIMAL(12,6),
    error_log       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    org_id          UUID NOT NULL REFERENCES orgs(id),
    name            VARCHAR(255) NOT NULL DEFAULT 'New Chat',
    model_id        VARCHAR(100) NOT NULL,
    messages        JSONB NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_aggregation_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    window_start    TIMESTAMPTZ NOT NULL,
    window_end      TIMESTAMPTZ NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'completed',
    rows_agg        INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_endpoints_user_id ON endpoints(user_id);
CREATE INDEX IF NOT EXISTS idx_endpoints_org_id ON endpoints(org_id);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_user_id ON batch_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_status ON batch_jobs(status);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_aggregation_log_window ON usage_aggregation_log(window_start);

-- raw_usage_events: append-only table written by Gateway proxy, read by Console T-2 aggregation cron
CREATE TABLE IF NOT EXISTS raw_usage_events (
    request_id          VARCHAR(255) PRIMARY KEY,
    api_key_id          VARCHAR(255),
    user_id             VARCHAR(255),
    org_id              VARCHAR(255),
    model_id            VARCHAR(100),
    prompt_tokens       INTEGER,
    completion_tokens   INTEGER,
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    status              VARCHAR(20)
);
