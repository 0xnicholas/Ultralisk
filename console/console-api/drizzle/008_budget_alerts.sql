-- Migration 008: Budget alert settings and notification tracking
-- Supports per-org budget configuration with dedup notification log

-- === Per-org budget alert configuration ===
-- Each org has exactly one settings row (UNIQUE on org_id).

CREATE TABLE IF NOT EXISTS budget_alert_settings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) UNIQUE,
    budget_usd      REAL NOT NULL DEFAULT 25000.0,
    alerts_enabled  BOOLEAN NOT NULL DEFAULT true,
    channels        JSONB NOT NULL DEFAULT '["email"]',
    suppression_window_minutes INTEGER NOT NULL DEFAULT 30,
    thresholds      JSONB NOT NULL DEFAULT '[
        {"label": "70% warning", "type": "percent", "value": 70},
        {"label": "90% critical", "type": "percent", "value": 90},
        {"label": "GPU utilization >85%", "type": "gpu_util", "value": 85}
    ]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- === Notification delivery log ===
-- Used to prevent duplicate alerts within the suppression window.

CREATE TABLE IF NOT EXISTS budget_alert_notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id),
    threshold_label VARCHAR(255) NOT NULL,
    threshold_type  VARCHAR(50) NOT NULL,
    threshold_value REAL NOT NULL,
    channel         VARCHAR(20) NOT NULL,
    current_spend   REAL NOT NULL,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_budget_alert_notifications_org_sent
    ON budget_alert_notifications(org_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_budget_alert_notifications_threshold
    ON budget_alert_notifications(org_id, threshold_label, sent_at DESC);

-- === Add webhook_url to slack_integrations for sending alerts ===

ALTER TABLE slack_integrations ADD COLUMN IF NOT EXISTS webhook_url VARCHAR(500);

-- === Seed default settings for existing orgs (dev) ===

INSERT INTO budget_alert_settings (org_id, budget_usd, alerts_enabled, channels)
SELECT id, 25000.0, true, '["email", "slack"]'::jsonb
FROM orgs
WHERE NOT EXISTS (SELECT 1 FROM budget_alert_settings WHERE budget_alert_settings.org_id = orgs.id)
ON CONFLICT (org_id) DO NOTHING;
