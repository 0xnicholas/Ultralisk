import { Router, Request, Response } from 'express';
import pool from '../db/index.js';

const router = Router();

// === Auto-Remediation Settings (per-org singleton) ===

router.get('/settings/auto-remediation', async (req: Request, res: Response) => {
  try {
    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });

    const { rows: [cfg] } = await pool.query(
      'SELECT * FROM auto_remediation_settings WHERE org_id = $1', [orgId]
    );
    if (!cfg) return res.json({ data: defaultAutoRemediation() });

    res.json({ data: { enabled: cfg.enabled, tiers: cfg.tiers, auto_suppression: cfg.auto_suppression } });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

router.patch('/settings/auto-remediation', async (req: Request, res: Response) => {
  try {
    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });

    const { rows: [existing] } = await pool.query(
      'SELECT * FROM auto_remediation_settings WHERE org_id = $1', [orgId]
    );

    const enabled = req.body?.enabled ?? existing?.enabled ?? true;
    const tiers = req.body?.tiers ?? existing?.tiers ?? defaultAutoRemediation().tiers;
    const autoSuppression = req.body?.auto_suppression ?? existing?.auto_suppression ?? defaultAutoRemediation().auto_suppression;

    const { rows: [cfg] } = await pool.query(
      `INSERT INTO auto_remediation_settings (org_id, enabled, tiers, auto_suppression, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (org_id) DO UPDATE SET enabled = $2, tiers = $3, auto_suppression = $4, updated_at = now()
       RETURNING *`,
      [orgId, enabled, JSON.stringify(tiers), JSON.stringify(autoSuppression)]
    );

    res.json({ data: { enabled: cfg.enabled, tiers: cfg.tiers, auto_suppression: cfg.auto_suppression } });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

// === Slack Integration (per-org singleton) ===

router.get('/settings/integrations/slack', async (req: Request, res: Response) => {
  try {
    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });

    const { rows: [cfg] } = await pool.query(
      'SELECT * FROM slack_integrations WHERE org_id = $1', [orgId]
    );
    if (!cfg) return res.json({ data: defaultSlackConfig() });

    res.json({ data: { connected: cfg.connected, workspace_name: cfg.workspace_name, channels: cfg.channels, notifications: cfg.notifications, slash_commands: cfg.slash_commands } });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

router.post('/settings/integrations/slack/connect', async (req: Request, res: Response) => {
  try {
    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });

    const { rows: [cfg] } = await pool.query(
      `INSERT INTO slack_integrations (org_id, connected, workspace_name, channels, notifications, slash_commands, updated_at)
       VALUES ($1, true, $2, $3, $4, $5, now())
       ON CONFLICT (org_id) DO UPDATE SET connected = true, workspace_name = $2, channels = $3, updated_at = now()
       RETURNING *`,
      [orgId, 'acme-ai.slack.com', JSON.stringify(['#infra-alerts', '#ml-ops']), JSON.stringify(defaultSlackConfig().notifications), JSON.stringify(defaultSlackConfig().slash_commands)]
    );

    res.json({ data: { connected: cfg.connected, workspace_name: cfg.workspace_name, channels: cfg.channels, notifications: cfg.notifications, slash_commands: cfg.slash_commands } });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

router.post('/settings/integrations/slack/disconnect', async (req: Request, res: Response) => {
  try {
    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });

    const { rows: [cfg] } = await pool.query(
      'UPDATE slack_integrations SET connected = false, workspace_name = NULL, updated_at = now() WHERE org_id = $1 RETURNING *',
      [orgId]
    );
    if (!cfg) return res.json({ data: defaultSlackConfig() });

    res.json({ data: { connected: cfg.connected, workspace_name: cfg.workspace_name, channels: cfg.channels, notifications: cfg.notifications, slash_commands: cfg.slash_commands } });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

router.patch('/settings/integrations/slack', async (req: Request, res: Response) => {
  try {
    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });

    const { rows: [existing] } = await pool.query(
      'SELECT * FROM slack_integrations WHERE org_id = $1', [orgId]
    );
    if (!existing) return res.json({ data: defaultSlackConfig() });

    const notifications = req.body?.notifications ?? existing.notifications;
    const channels = req.body?.channels ?? existing.channels;
    const slashCommands = req.body?.slash_commands ?? existing.slash_commands;

    const { rows: [cfg] } = await pool.query(
      `UPDATE slack_integrations SET notifications = $2, channels = $3, slash_commands = $4, updated_at = now()
       WHERE org_id = $1 RETURNING *`,
      [orgId, JSON.stringify(notifications), JSON.stringify(channels), JSON.stringify(slashCommands)]
    );

    res.json({ data: { connected: cfg.connected, workspace_name: cfg.workspace_name, channels: cfg.channels, notifications: cfg.notifications, slash_commands: cfg.slash_commands } });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

function defaultAutoRemediation() {
  return {
    enabled: true,
    tiers: {
      tier1: { enabled: true, operations: [] },
      tier2: { enabled: true, approval_channels: ['web', 'slack', 'email'], operations: [] },
      tier3: { enabled: true, operations: [] },
    },
    auto_suppression: { enabled: true, window_hours: 24 },
  };
}

function defaultSlackConfig() {
  return {
    connected: false,
    workspace_name: null,
    channels: [],
    notifications: { critical: true, warning: true, ai_summary: true, incident_actions: true },
    slash_commands: [
      { command: '/ultralisk incident <id>', description: 'Query incident status and AI analysis' },
      { command: '/ultralisk ask <question>', description: 'Ask AI assistant about recent incidents' },
    ],
  };
}

export default router;
