import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db/index.js';
const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

async function setup() {
  const express = (await import('express')).default;
  const { default: alertsRoutes } = await import('./alerts.js');
  const supertest = (await import('supertest')).default;
  const app = express();
  app.use(express.json());
  app.use('/v1/admin', alertsRoutes);
  return supertest(app);
}

beforeEach(() => {
  mockQuery.mockReset();
});

const sampleAlert = {
  id: 'alert_1', incident_id: null,
  name: 'High GPU Temperature', description: 'GPU temp > 85°C on node-2',
  severity: 'warning', source_metric: 'gpu_temperature',
  condition: { op: '>', threshold: 85 },
  status: 'firing', fired_at: '2026-01-01T00:00:00Z',
  resolved_at: null,
  notification_channels: ['email', 'slack'],
  created_at: '2026-01-01T00:00:00Z',
};

describe('GET /v1/admin/alerts', () => {
  it('returns all alerts', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleAlert] });
    const request = await setup();
    const res = await request.get('/v1/admin/alerts');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('High GPU Temperature');
  });

  it('returns empty list', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.get('/v1/admin/alerts');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns 500 on query failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db error'));
    const request = await setup();
    const res = await request.get('/v1/admin/alerts');
    expect(res.status).toBe(500);
  });
});

describe('POST /v1/admin/alerts/:id/suppress', () => {
  it('suppresses an alert', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleAlert, status: 'suppressed' }] });
    const request = await setup();
    const res = await request.post('/v1/admin/alerts/alert_1/suppress');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('suppressed');
  });

  it('returns 404 for unknown alert', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.post('/v1/admin/alerts/nonexistent/suppress');
    expect(res.status).toBe(404);
  });
});
