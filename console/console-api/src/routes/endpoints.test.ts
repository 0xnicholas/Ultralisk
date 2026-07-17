import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db/index.js';
const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

const USER_ID = 'usr_123';
const ORG_ID = 'org_001';

async function setup() {
  const express = (await import('express')).default;
  const { default: endpointRoutes } = await import('./endpoints.js');
  const supertest = (await import('supertest')).default;
  const app = express();
  app.use(express.json());
  app.use('/v1/admin', endpointRoutes);
  return supertest(app);
}

beforeEach(() => {
  mockQuery.mockReset();
});

const sampleEndpoint = {
  id: 'ep_1', name: 'llama-prod', model_id: 'llama-3.1-8b',
  type: 'serverless', replicas: 2, gpu_type: 'H100', gpu_count: 1,
  autoscaling_policy: null, tps_guarantee: null, priority: 0,
  status: 'active', created_at: '2026-01-01T00:00:00Z',
  user_id: USER_ID, org_id: ORG_ID,
};

describe('GET /v1/admin/endpoints', () => {
  it('returns endpoints for authenticated user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleEndpoint] });
    const request = await setup();
    const res = await request.get('/v1/admin/endpoints')
      .set('x-user-id', USER_ID);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('llama-prod');
    expect(res.body.data[0].gpu_spec.type).toBe('H100');
  });

  it('returns 401 without x-user-id', async () => {
    const request = await setup();
    const res = await request.get('/v1/admin/endpoints');
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/admin/endpoints/:id', () => {
  it('returns endpoint detail', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleEndpoint] });
    const request = await setup();
    const res = await request.get('/v1/admin/endpoints/ep_1')
      .set('x-user-id', USER_ID);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('ep_1');
  });

  it('returns 404 for unknown endpoint', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.get('/v1/admin/endpoints/nonexistent')
      .set('x-user-id', USER_ID);
    expect(res.status).toBe(404);
  });
});

describe('POST /v1/admin/endpoints', () => {
  it('creates a serverless endpoint', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleEndpoint, id: 'ep_new' }] });
    const request = await setup();
    const res = await request.post('/v1/admin/endpoints')
      .set('x-user-id', USER_ID)
      .set('x-org-id', ORG_ID)
      .send({ name: 'test-endpoint', model_id: 'llama-3.1-8b', type: 'serverless' });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('ep_new');
  });

  it('creates a reserved endpoint with tps_guarantee', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleEndpoint, id: 'ep_res', type: 'reserved', tps_guarantee: 100, priority: 1 }] });
    const request = await setup();
    const res = await request.post('/v1/admin/endpoints')
      .set('x-user-id', USER_ID)
      .set('x-org-id', ORG_ID)
      .send({ name: 'reserved-ep', model_id: 'llama-3.1-8b', type: 'reserved', tps_guarantee: 100 });
    expect(res.status).toBe(201);
    expect(res.body.data.tps_guarantee).toBe(100);
    expect(res.body.data.priority).toBe(1);
  });

  it('rejects reserved endpoint without tps_guarantee', async () => {
    const request = await setup();
    const res = await request.post('/v1/admin/endpoints')
      .set('x-user-id', USER_ID)
      .set('x-org-id', ORG_ID)
      .send({ name: 'bad-reserved', model_id: 'llama-3.1-8b', type: 'reserved' });
    expect(res.status).toBe(400);
  });

  it('returns 401 without auth headers', async () => {
    const request = await setup();
    const res = await request.post('/v1/admin/endpoints')
      .send({ name: 'test', model_id: 'm1', type: 'serverless' });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /v1/admin/endpoints/:id', () => {
  it('updates endpoint fields', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleEndpoint, name: 'renamed', replicas: 5 }] });
    const request = await setup();
    const res = await request.patch('/v1/admin/endpoints/ep_1')
      .set('x-user-id', USER_ID)
      .send({ name: 'renamed', replicas: 5 });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('renamed');
  });

  it('returns 404 for unknown endpoint', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.patch('/v1/admin/endpoints/nonexistent')
      .set('x-user-id', USER_ID)
      .send({ name: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /v1/admin/endpoints/:id', () => {
  it('deletes endpoint', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    const request = await setup();
    const res = await request.delete('/v1/admin/endpoints/ep_1')
      .set('x-user-id', USER_ID);
    expect(res.status).toBe(204);
  });

  it('returns 404 for unknown endpoint', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });
    const request = await setup();
    const res = await request.delete('/v1/admin/endpoints/nonexistent')
      .set('x-user-id', USER_ID);
    expect(res.status).toBe(404);
  });
});
