-- Migration 010: Add fingerprint to alerts for deduplication
--
-- Prometheus Alertmanager sends a unique fingerprint per alert.
-- We use it to prevent duplicate incidents from the same alert.

ALTER TABLE alerts ADD COLUMN IF NOT EXISTS fingerprint VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_alerts_fingerprint ON alerts(fingerprint);

-- Add a dedicated org_id column for per-org alert routing
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES orgs(id);
CREATE INDEX IF NOT EXISTS idx_alerts_org_id ON alerts(org_id);
