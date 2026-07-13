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
  ('llama-3.1-8b-instruct', 'Llama 3.1 8B Instruct', 'Meta', '8B parameter instruction-tuned model', 131072, 0.00006, 0.00006, '["chat","completion"]'),
  ('llama-3.3-70b-instruct', 'Llama 3.3 70B Instruct', 'Meta', '70B parameter instruction-tuned model', 131072, 0.00059, 0.00079, '["chat","completion"]')
ON CONFLICT DO NOTHING;
