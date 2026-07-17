import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db/index.js';
const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

async function setup() {
  const express = (await import('express')).default;
  const { default: incidentsRoutes } = await import('./incidents.js');
  const supertest = (await import('supertest')).default;
  const app = express();
  app.use(express.json());
  app.use('/v1/admin', incidentsRoutes);
  return supertest(app);
}

beforeEach(() => {
  mockQuery.mockReset();
});

const sampleIncident = {
  id: 'inc_1', severity: 'critical', status: 'open',
  title: 'GPU OOM on node-3', description: 'Memory exhausted',
  detection_type: 'threshold',
  affected_entities: { nodes: ['n3'] },
  ai_analysis: null,
  conversation_history: [],
  action_log: [],
  triggered_at: '2026-01-01T00:00:00Z',
  mitigated_at: null, resolved_at: null, suppressed_at: null,
  created_at: '2026-01-01T00:00:00Z',
};

describe('GET /v1/admin/incidents', () => {
  it('returns all incidents ordered by triggered_at', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleIncident] });
    const request = await setup();
    const res = await request.get('/v1/admin/incidents');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('GPU OOM on node-3');
  });

  it('returns empty list', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.get('/v1/admin/incidents');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns 500 on query failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db error'));
    const request = await setup();
    const res = await request.get('/v1/admin/incidents');
    expect(res.status).toBe(500);
  });
});

describe('GET /v1/admin/incidents/:id', () => {
  it('returns incident detail', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleIncident] });
    const request = await setup();
    const res = await request.get('/v1/admin/incidents/inc_1');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('inc_1');
  });

  it('returns 404 for unknown incident', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.get('/v1/admin/incidents/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /v1/admin/incidents/:id', () => {
  it('updates incident status to resolved', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleIncident] });
    mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleIncident, status: 'resolved', resolved_at: '2026-01-02T00:00:00Z' }] });
    const request = await setup();
    const res = await request.patch('/v1/admin/incidents/inc_1')
      .send({ status: 'resolved', resolved_at: '2026-01-02T00:00:00Z' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('resolved');
  });

  it('returns 404 for unknown incident', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.patch('/v1/admin/incidents/nonexistent')
      .send({ status: 'resolved' });
    expect(res.status).toBe(404);
  });

  it('no-ops when no fields provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleIncident] });
    const request = await setup();
    const res = await request.patch('/v1/admin/incidents/inc_1').send({});
    expect(res.status).toBe(200);
  });
});

describe('POST /v1/admin/incidents/:id/actions', () => {
  it('appends action to incident log', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleIncident] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.post('/v1/admin/incidents/inc_1/actions')
      .send({ user_id: 'usr_1', action: 'restarted node-3', result: 'success' });
    expect(res.status).toBe(201);
    expect(res.body.data.action).toBe('restarted node-3');
  });

  it('returns 404 for unknown incident', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.post('/v1/admin/incidents/nonexistent/actions')
      .send({ action: 'test' });
    expect(res.status).toBe(404);
  });
});
