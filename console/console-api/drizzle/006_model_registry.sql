-- Phase 3 P3c: Offline Model Registry
-- Tracks models imported from HuggingFace, S3, or MinIO for private deployments

CREATE TABLE IF NOT EXISTS model_registry (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id),
    model_id        VARCHAR(100) REFERENCES models(id),
    name            VARCHAR(255) NOT NULL,
    source_type     VARCHAR(20) NOT NULL,
    source_path     VARCHAR(1000) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'importing',
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    ready_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_model_registry_org ON model_registry(org_id);
CREATE INDEX IF NOT EXISTS idx_model_registry_status ON model_registry(status);
