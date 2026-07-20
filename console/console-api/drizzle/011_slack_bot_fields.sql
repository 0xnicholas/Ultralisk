-- Migration 011: Slack bot fields for bidirectional ChatOps
--
-- Adds Socket Mode configuration columns to slack_integrations.
-- bot_token and app_token should be encrypted at rest (AES-256-GCM via
-- Node.js crypto module, key from ENCRYPTION_KEY env var).

ALTER TABLE slack_integrations
  ADD COLUMN IF NOT EXISTS bot_token        TEXT,       -- Slack Bot User OAuth Token (encrypted at rest)
  ADD COLUMN IF NOT EXISTS app_token        TEXT,       -- Slack App-level Token for Socket Mode (encrypted at rest)
  ADD COLUMN IF NOT EXISTS app_id           VARCHAR(50),
  ADD COLUMN IF NOT EXISTS incident_channel VARCHAR(50), -- Target channel ID for incident push notifications
  ADD COLUMN IF NOT EXISTS enabled_commands JSONB DEFAULT '["incident","ask"]';
