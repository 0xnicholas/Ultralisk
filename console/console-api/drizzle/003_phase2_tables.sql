-- Phase 2 tables: infrastructure inventory, deployments, incidents, settings
-- GPU utilization time series and cost analytics live in ClickHouse (ADR-007), not Postgres

-- === Infrastructure Inventory ===

CREATE TABLE IF NOT EXISTS clusters (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    region      VARCHAR(100) NOT NULL,
    gpu_type    VARCHAR(50) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nodes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id      UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    hostname        VARCHAR(255) NOT NULL,
    gpu_model       VARCHAR(50) NOT NULL,
    gpu_count       INTEGER NOT NULL DEFAULT 1,
    driver_version  VARCHAR(50) NOT NULL,
    cuda_version    VARCHAR(50) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'online',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gpu_cards (
    id          VARCHAR(100) PRIMARY KEY,
    node_id     UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    card_index  INTEGER NOT NULL,
    memory_mb   INTEGER NOT NULL DEFAULT 81920,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(node_id, card_index)
);

-- === Deployments ===

CREATE TABLE IF NOT EXISTS deployments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    org_id          UUID NOT NULL REFERENCES orgs(id),
    name            VARCHAR(255) NOT NULL,
    model_id        VARCHAR(100) NOT NULL REFERENCES models(id),
    endpoint_id     UUID REFERENCES endpoints(id),
    cluster_id      UUID NOT NULL REFERENCES clusters(id),
    replicas        INTEGER NOT NULL DEFAULT 1,
    gpu_per_replica INTEGER NOT NULL DEFAULT 1,
    status          VARCHAR(20) NOT NULL DEFAULT 'creating',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deployment_versions (
    deployment_id   UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    version         INTEGER NOT NULL,
    image           VARCHAR(255) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    deployed_at     TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (deployment_id, version)
);

-- === Incidents & Alerts ===

CREATE TABLE IF NOT EXISTS incidents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    severity            VARCHAR(20) NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'open',
    title               VARCHAR(500) NOT NULL,
    description         TEXT,
    detection_type      VARCHAR(50),
    affected_entities   JSONB DEFAULT '{}',
    ai_analysis         JSONB,
    conversation_history JSONB DEFAULT '[]',
    action_log          JSONB DEFAULT '[]',
    triggered_at        TIMESTAMPTZ,
    mitigated_at        TIMESTAMPTZ,
    resolved_at         TIMESTAMPTZ,
    suppressed_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alerts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id             UUID REFERENCES incidents(id) ON DELETE SET NULL,
    name                    VARCHAR(500) NOT NULL,
    description             TEXT,
    severity                VARCHAR(20) NOT NULL,
    source_metric           VARCHAR(255) NOT NULL,
    condition               JSONB NOT NULL DEFAULT '{}',
    status                  VARCHAR(20) NOT NULL DEFAULT 'firing',
    fired_at                TIMESTAMPTZ,
    resolved_at             TIMESTAMPTZ,
    notification_channels   JSONB DEFAULT '[]',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- === Org-level Settings ===

CREATE TABLE IF NOT EXISTS auto_remediation_settings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id),
    enabled         BOOLEAN NOT NULL DEFAULT true,
    tiers           JSONB NOT NULL DEFAULT '{}',
    auto_suppression JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(org_id)
);

CREATE TABLE IF NOT EXISTS slack_integrations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id),
    connected       BOOLEAN NOT NULL DEFAULT false,
    workspace_name  VARCHAR(255),
    channels        JSONB DEFAULT '[]',
    notifications   JSONB DEFAULT '{}',
    slash_commands  JSONB DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(org_id)
);

-- === Indexes ===

CREATE INDEX IF NOT EXISTS idx_nodes_cluster_id ON nodes(cluster_id);
CREATE INDEX IF NOT EXISTS idx_gpu_cards_node_id ON gpu_cards(node_id);
CREATE INDEX IF NOT EXISTS idx_deployments_user_id ON deployments(user_id);
CREATE INDEX IF NOT EXISTS idx_deployments_org_id ON deployments(org_id);
CREATE INDEX IF NOT EXISTS idx_deployments_cluster_id ON deployments(cluster_id);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_triggered_at ON incidents(triggered_at);
CREATE INDEX IF NOT EXISTS idx_alerts_incident_id ON alerts(incident_id);

-- === Seed data (development only) ===

INSERT INTO clusters (id, name, region, gpu_type) VALUES
    ('00000000-0000-0000-0000-000000000101', 'us-east-1-prod',   'us-east-1',    'H100'),
    ('00000000-0000-0000-0000-000000000102', 'us-west-2-prod',   'us-west-2',    'H100'),
    ('00000000-0000-0000-0000-000000000103', 'eu-central-1-dev', 'eu-central-1', 'A100')
ON CONFLICT DO NOTHING;
