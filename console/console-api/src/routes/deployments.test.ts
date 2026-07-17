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
  const { default: deploymentsRoutes } = await import('./deployments.js');
  const supertest = (await import('supertest')).default;
  const app = express();
  app.use(express.json());
  app.use('/v1/admin', deploymentsRoutes);
  return supertest(app);
}

beforeEach(() => {
  mockQuery.mockReset();
});

const sampleDeployment = {
  id: 'dep_1', name: 'llama-prod', model_id: 'llama-3.1-8b',
  endpoint_id: null, cluster_id: 'c1', replicas: 2,
  gpu_per_replica: 1, status: 'active', created_at: '2026-01-01T00:00:00Z',
};

const sampleVersion = {
  deployment_id: 'dep_1', version: 2, image: 'vllm:v0.6',
  status: 'active', deployed_at: '2026-01-02T00:00:00Z',
};

describe('GET /v1/admin/deployments', () => {
  it('returns deployments for authenticated user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleDeployment] });
    const request = await setup();
    const res = await request.get('/v1/admin/deployments')
      .set('x-user-id', USER_ID);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('llama-prod');
  });

  it('returns 401 without x-user-id', async () => {
    const request = await setup();
    const res = await request.get('/v1/admin/deployments');
    expect(res.status).toBe(401);
  });

  it('returns empty list when user has no deployments', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.get('/v1/admin/deployments')
      .set('x-user-id', USER_ID);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('GET /v1/admin/deployments/:id', () => {
  it('returns deployment with versions', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleDeployment] });
    mockQuery.mockResolvedValueOnce({ rows: [sampleVersion, { ...sampleVersion, version: 1, status: 'superseded' }] });
    const request = await setup();
    const res = await request.get('/v1/admin/deployments/dep_1')
      .set('x-user-id', USER_ID);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('dep_1');
    expect(res.body.data.versions).toHaveLength(2);
    expect(res.body.data.versions[0].version).toBe(2);
  });

  it('returns 404 for unknown deployment', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.get('/v1/admin/deployments/nonexistent')
      .set('x-user-id', USER_ID);
    expect(res.status).toBe(404);
  });

  it('returns 401 without x-user-id', async () => {
    const request = await setup();
    const res = await request.get('/v1/admin/deployments/dep_1');
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/admin/deployments/:id/scale', () => {
  it('scales replicas', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleDeployment, replicas: 5 }] });
    const request = await setup();
    const res = await request.post('/v1/admin/deployments/dep_1/scale')
      .set('x-user-id', USER_ID)
      .send({ replicas: 5 });

    expect(res.status).toBe(200);
    expect(res.body.data.replicas).toBe(5);
  });

  it('rejects invalid replicas', async () => {
    const request = await setup();
    const res = await request.post('/v1/admin/deployments/dep_1/scale')
      .set('x-user-id', USER_ID)
      .send({ replicas: 0 });
    expect(res.status).toBe(400);

    const res2 = await request.post('/v1/admin/deployments/dep_1/scale')
      .set('x-user-id', USER_ID)
      .send({ replicas: 'abc' });
    expect(res2.status).toBe(400);
  });

  it('returns 404 when deployment not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.post('/v1/admin/deployments/nonexistent/scale')
      .set('x-user-id', USER_ID)
      .send({ replicas: 3 });
    expect(res.status).toBe(404);
  });
});

describe('POST /v1/admin/deployments/:id/rollback', () => {
  it('triggers rollback', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleDeployment] });
    mockQuery.mockResolvedValueOnce({ rows: [sampleDeployment] });
    const request = await setup();
    const res = await request.post('/v1/admin/deployments/dep_1/rollback')
      .set('x-user-id', USER_ID);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('rolling_back');
  });

  it('returns 404 for unknown deployment', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.post('/v1/admin/deployments/nonexistent/rollback')
      .set('x-user-id', USER_ID);
    expect(res.status).toBe(404);
  });
});
