import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db/index.js';
const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

const ORG_ID = 'org_001';

async function setup() {
  const express = (await import('express')).default;
  const { default: settingsRoutes } = await import('./settings.js');
  const supertest = (await import('supertest')).default;
  const app = express();
  app.use(express.json());
  app.use('/v1/admin', settingsRoutes);
  return supertest(app);
}

beforeEach(() => {
  mockQuery.mockReset();
});

const sampleAutoRemediation = {
  id: 'ar_1', org_id: ORG_ID, enabled: true,
  tiers: { tier1: { enabled: true, operations: ['auto_restart'] } },
  auto_suppression: { enabled: true, window_hours: 24 },
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};

const sampleSlackConfig = {
  id: 'sl_1', org_id: ORG_ID, connected: true,
  workspace_name: 'acme.slack.com',
  channels: ['#infra-alerts'],
  notifications: { critical: true, warning: true },
  slash_commands: [{ command: '/ultralisk incident <id>', description: 'Query incident' }],
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};

describe('GET /v1/admin/settings/auto-remediation', () => {
  it('returns existing settings', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleAutoRemediation] });
    const request = await setup();
    const res = await request.get('/v1/admin/settings/auto-remediation')
      .set('x-org-id', ORG_ID);
    expect(res.status).toBe(200);
    expect(res.body.data.enabled).toBe(true);
    expect(res.body.data.tiers.tier1.operations).toEqual(['auto_restart']);
  });

  it('returns defaults when no settings exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.get('/v1/admin/settings/auto-remediation')
      .set('x-org-id', ORG_ID);
    expect(res.status).toBe(200);
    expect(res.body.data.enabled).toBe(true);
    expect(res.body.data.auto_suppression.enabled).toBe(true);
  });

  it('returns 401 without x-org-id', async () => {
    const request = await setup();
    const res = await request.get('/v1/admin/settings/auto-remediation');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /v1/admin/settings/auto-remediation', () => {
  it('upserts auto-remediation settings', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no existing
    mockQuery.mockResolvedValueOnce({ rows: [sampleAutoRemediation] });
    const request = await setup();
    const res = await request.patch('/v1/admin/settings/auto-remediation')
      .set('x-org-id', ORG_ID)
      .send({ enabled: true });
    expect(res.status).toBe(200);
  });

  it('returns 401 without x-org-id', async () => {
    const request = await setup();
    const res = await request.patch('/v1/admin/settings/auto-remediation')
      .send({ enabled: false });
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/admin/settings/integrations/slack', () => {
  it('returns existing slack config', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleSlackConfig] });
    const request = await setup();
    const res = await request.get('/v1/admin/settings/integrations/slack')
      .set('x-org-id', ORG_ID);
    expect(res.status).toBe(200);
    expect(res.body.data.connected).toBe(true);
    expect(res.body.data.workspace_name).toBe('acme.slack.com');
  });

  it('returns default config when not set up', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.get('/v1/admin/settings/integrations/slack')
      .set('x-org-id', ORG_ID);
    expect(res.status).toBe(200);
    expect(res.body.data.connected).toBe(false);
  });

  it('returns 401 without x-org-id', async () => {
    const request = await setup();
    const res = await request.get('/v1/admin/settings/integrations/slack');
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/admin/settings/integrations/slack/connect', () => {
  it('connects slack and returns config', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleSlackConfig] });
    const request = await setup();
    const res = await request.post('/v1/admin/settings/integrations/slack/connect')
      .set('x-org-id', ORG_ID);
    expect(res.status).toBe(200);
    expect(res.body.data.connected).toBe(true);
  });
});

describe('POST /v1/admin/settings/integrations/slack/disconnect', () => {
  it('disconnects slack', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleSlackConfig, connected: false, workspace_name: null }] });
    const request = await setup();
    const res = await request.post('/v1/admin/settings/integrations/slack/disconnect')
      .set('x-org-id', ORG_ID);
    expect(res.status).toBe(200);
    expect(res.body.data.connected).toBe(false);
  });

  it('returns defaults when no config exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.post('/v1/admin/settings/integrations/slack/disconnect')
      .set('x-org-id', ORG_ID);
    expect(res.status).toBe(200);
    expect(res.body.data.connected).toBe(false);
  });
});

describe('PATCH /v1/admin/settings/integrations/slack', () => {
  it('updates slack notification settings', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleSlackConfig] });
    mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleSlackConfig, notifications: { critical: false } }] });
    const request = await setup();
    const res = await request.patch('/v1/admin/settings/integrations/slack')
      .set('x-org-id', ORG_ID)
      .send({ notifications: { critical: false } });
    expect(res.status).toBe(200);
  });

  it('returns defaults when no existing config', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.patch('/v1/admin/settings/integrations/slack')
      .set('x-org-id', ORG_ID)
      .send({ notifications: { critical: true } });
    expect(res.status).toBe(200);
    expect(res.body.data.connected).toBe(false);
  });
});
