-- Phase 2 M5: Dev-mode GPU metrics + cost data tables
-- These provide PG-backed storage for gpu-utilization and cost-analytics
-- When ClickHouse is deployed (ADR-007), these tables become read-through caches
-- or are replaced by ClickHouse views with the same API shape

-- === GPU Metric Snapshots ===
-- Written by a collector process (or seed data), read by Console API

CREATE TABLE IF NOT EXISTS gpu_metric_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id         UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    card_index      INTEGER NOT NULL,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
    utilization_pct REAL NOT NULL DEFAULT 0,
    memory_used_mb  INTEGER NOT NULL DEFAULT 0,
    temperature     REAL NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gpu_metric_snapshots_ts
    ON gpu_metric_snapshots(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_gpu_metric_snapshots_node_card_ts
    ON gpu_metric_snapshots(node_id, card_index, timestamp DESC);

-- === Cost Data ===
-- Daily aggregated cost records per dimension

CREATE TABLE IF NOT EXISTS cost_data (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id),
    dimension       VARCHAR(50) NOT NULL,
    dimension_key   VARCHAR(255) NOT NULL,
    dimension_name  VARCHAR(255) NOT NULL,
    cost_usd        REAL NOT NULL DEFAULT 0,
    gpu_hours       REAL NOT NULL DEFAULT 0,
    tokens_m        REAL NOT NULL DEFAULT 0,
    recorded_at     DATE NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_data_org_dim
    ON cost_data(org_id, dimension, recorded_at DESC);

-- === Invitations ===

CREATE TABLE IF NOT EXISTS invitations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id),
    email           VARCHAR(255) NOT NULL,
    token           VARCHAR(64) NOT NULL UNIQUE,
    role            VARCHAR(20) NOT NULL DEFAULT 'developer',
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    accepted_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invitations_org_id ON invitations(org_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);

-- === Seed data: GPU metrics (72h of snapshots for demo/dev) ===
-- Only when tables are empty

DO $$
DECLARE
    node_rec RECORD;
    card_idx INT;
    ts TIMESTAMPTZ;
    base_util REAL;
    base_mem INT;
    base_temp REAL;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM gpu_metric_snapshots LIMIT 1) THEN
        FOR node_rec IN SELECT * FROM nodes LOOP
            FOR card_idx IN 0..(node_rec.gpu_count - 1) LOOP
                base_util := 50 + random() * 40;
                base_mem := 40000 + (random() * 40000)::int;
                base_temp := 55 + random() * 20;

                FOR i IN 0..71 LOOP
                    ts := now() - (71 - i) * interval '1 hour';
                    INSERT INTO gpu_metric_snapshots (node_id, card_index, timestamp, utilization_pct, memory_used_mb, temperature)
                    VALUES (
                        node_rec.id,
                        card_idx,
                        ts,
                        GREATEST(5, LEAST(100, base_util + (random() - 0.5) * 20 + CASE WHEN i > 60 THEN -10 ELSE 0 END)),
                        GREATEST(1000, LEAST(node_rec.gpu_count * 10240, base_mem + (random() - 0.5) * 8000)),
                        GREATEST(30, LEAST(95, base_temp + (random() - 0.5) * 10))
                    );
                END LOOP;
            END LOOP;
        END LOOP;
    END IF;
END $$;

-- === Seed data: Cost records (30 days) ===

DO $$
DECLARE
    d DATE;
    dims TEXT[] := ARRAY['model', 'endpoint', 'api_key', 'team'];
    dim_data JSONB;
    dim_record JSONB;
    model_rec RECORD;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM cost_data LIMIT 1) THEN
        -- Per-model costs
        FOR model_rec IN SELECT * FROM models LOOP
            FOR i IN 0..29 LOOP
                d := CURRENT_DATE - (29 - i) * interval '1 day';
                INSERT INTO cost_data (org_id, dimension, dimension_key, dimension_name, cost_usd, gpu_hours, tokens_m, recorded_at)
                VALUES (
                    '00000000-0000-0000-0000-000000000001',
                    'model',
                    model_rec.id,
                    model_rec.name,
                    (random() * 200 + 50 + i * 2)::real,
                    (random() * 20 + 5)::real,
                    (random() * 500 + 50)::real,
                    d
                );
            END LOOP;
        END LOOP;

        -- Per-endpoint costs
        FOR i IN 0..29 LOOP
            d := CURRENT_DATE - (29 - i) * interval '1 day';
            INSERT INTO cost_data (org_id, dimension, dimension_key, dimension_name, cost_usd, gpu_hours, tokens_m, recorded_at)
            VALUES
                ('00000000-0000-0000-0000-000000000001', 'endpoint', 'ep_001', 'llama-prod', (random() * 150 + 80 + i * 3)::real, (random() * 15 + 8)::real, (random() * 200 + 100)::real, d),
                ('00000000-0000-0000-0000-000000000001', 'endpoint', 'ep_002', 'deepseek-reserved', (random() * 100 + 60 + i * 2)::real, (random() * 12 + 5)::real, (random() * 100 + 50)::real, d),
                ('00000000-0000-0000-0000-000000000001', 'endpoint', 'ep_003', 'qwen-dev', (random() * 50 + 20 + i)::real, (random() * 8 + 2)::real, (random() * 50 + 20)::real, d);
        END LOOP;

        -- Per-API-key costs
        FOR i IN 0..29 LOOP
            d := CURRENT_DATE - (29 - i) * interval '1 day';
            INSERT INTO cost_data (org_id, dimension, dimension_key, dimension_name, cost_usd, gpu_hours, tokens_m, recorded_at)
            VALUES
                ('00000000-0000-0000-0000-000000000001', 'api_key', 'key_001', 'Production', (random() * 200 + 100 + i * 4)::real, (random() * 18 + 10)::real, (random() * 300 + 150)::real, d),
                ('00000000-0000-0000-0000-000000000001', 'api_key', 'key_002', 'Development', (random() * 80 + 30 + i)::real, (random() * 10 + 3)::real, (random() * 100 + 50)::real, d);
        END LOOP;

        -- Per-team costs
        FOR i IN 0..29 LOOP
            d := CURRENT_DATE - (29 - i) * interval '1 day';
            INSERT INTO cost_data (org_id, dimension, dimension_key, dimension_name, cost_usd, gpu_hours, tokens_m, recorded_at)
            VALUES
                ('00000000-0000-0000-0000-000000000001', 'team', 'platform-engineering', 'Platform Engineering', (random() * 180 + 100 + i * 3)::real, (random() * 16 + 8)::real, (random() * 250 + 100)::real, d),
                ('00000000-0000-0000-0000-000000000001', 'team', 'ml-research', 'ML Research', (random() * 120 + 60 + i * 2)::real, (random() * 12 + 5)::real, (random() * 150 + 80)::real, d),
                ('00000000-0000-0000-0000-000000000001', 'team', 'data-science', 'Data Science', (random() * 60 + 20 + i)::real, (random() * 6 + 2)::real, (random() * 80 + 20)::real, d),
                ('00000000-0000-0000-0000-000000000001', 'team', 'internal-tools', 'Internal Tools', (random() * 30 + 10 + i * 0.5)::real, (random() * 4 + 1)::real, (random() * 40 + 10)::real, d);
        END LOOP;
    END IF;
END $$;
