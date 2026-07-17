import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db/index.js';
const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

const ORG_ID = '00000000-0000-0000-0000-000000000001';

async function setup() {
  const express = (await import('express')).default;
  const { default: costRoutes } = await import('./costAnalytics.js');
  const supertest = (await import('supertest')).default;
  const app = express();
  app.use(express.json());
  app.use('/v1/admin', costRoutes);
  return supertest(app);
}

beforeEach(() => {
  mockQuery.mockReset();
});

describe('GET /v1/admin/cost-analytics', () => {
  it('returns cost analytics with summary, dimensions and trend', async () => {
    // summary query
    mockQuery.mockResolvedValueOnce({
      rows: [{ total_cost_usd: 12500, token_cost_usd: 8500, gpu_hours: 1600 }],
    });
    // budget alert settings
    mockQuery.mockResolvedValueOnce({
      rows: [{ budget_usd: 25000, alerts_enabled: true, channels: ['email', 'slack'], suppression_window_minutes: 30, thresholds: null }],
    });
    // per-model
    mockQuery.mockResolvedValueOnce({
      rows: [
        { name: 'llama-3.1-8b', cost_usd: 5000, gpu_hours: 600, tokens_m: 1200 },
        { name: 'deepseek-r1', cost_usd: 3000, gpu_hours: 400, tokens_m: 800 },
      ],
    });
    // per-endpoint
    mockQuery.mockResolvedValueOnce({
      rows: [
        { name: 'llama-prod', cost_usd: 4000, gpu_hours: 500, tokens_m: 1000 },
      ],
    });
    // per-api_key
    mockQuery.mockResolvedValueOnce({
      rows: [
        { name: 'Production', cost_usd: 7000, gpu_hours: 800, tokens_m: 1500 },
      ],
    });
    // per-team
    mockQuery.mockResolvedValueOnce({
      rows: [
        { name: 'Platform Engineering', cost_usd: 6000, gpu_hours: 700, tokens_m: 1300 },
        { name: 'ML Research', cost_usd: 3000, gpu_hours: 400, tokens_m: 800 },
      ],
    });
    // daily trend
    mockQuery.mockResolvedValueOnce({
      rows: [
        { date: new Date('2026-01-01'), token_cost: 250, gpu_cost: 100 },
        { date: new Date('2026-01-02'), token_cost: 300, gpu_cost: 120 },
      ],
    });

    const request = await setup();
    const res = await request.get('/v1/admin/cost-analytics')
      .set('x-org-id', ORG_ID);

    expect(res.status).toBe(200);
    expect(res.body.data.summary.total_cost_usd).toBe(12500);
    expect(res.body.data.summary.budget_usd).toBe(25000);
    expect(res.body.data.by_dimension.model).toHaveLength(2);
    expect(res.body.data.by_dimension.endpoint).toHaveLength(1);
    expect(res.body.data.by_dimension.api_key).toHaveLength(1);
    expect(res.body.data.by_dimension.team).toHaveLength(2);
    expect(res.body.data.daily_cost_trend).toHaveLength(2);
    expect(res.body.data.budget_alerts.budget_usd).toBe(25000);
  });

  it('returns empty dimensions when cost data is empty', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ total_cost_usd: 0, token_cost_usd: 0, gpu_hours: 0 }] });
    // budget alert settings (no row = defaults)
    mockQuery.mockResolvedValueOnce({ rows: [] });
    for (let i = 0; i < 4; i++) mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const request = await setup();
    const res = await request.get('/v1/admin/cost-analytics');

    expect(res.status).toBe(200);
    expect(res.body.data.summary.total_cost_usd).toBe(0);
    expect(res.body.data.by_dimension.model).toEqual([]);
    expect(res.body.data.daily_cost_trend).toEqual([]);
  });

  it('returns 500 on query failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db error'));
    const request = await setup();
    const res = await request.get('/v1/admin/cost-analytics');
    expect(res.status).toBe(500);
  });
});
