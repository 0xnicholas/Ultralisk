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
  const { default: apiKeyRoutes } = await import('./apiKeys.js');
  const supertest = (await import('supertest')).default;
  const app = express();
  app.use(express.json());
  app.use('/v1/admin', apiKeyRoutes);
  return supertest(app);
}

beforeEach(() => {
  mockQuery.mockReset();
});

describe('GET /v1/admin/api-keys', () => {
  it('returns API keys for authenticated user', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'ak_1', key_prefix: 'ultr_abc', name: 'Production', status: 'active', quota_limits: { '*': 50000 }, last_used_at: null, created_at: '2026-01-01T00:00:00Z' },
        { id: 'ak_2', key_prefix: 'ultr_def', name: 'Dev', status: 'active', quota_limits: { '*': 10000 }, last_used_at: null, created_at: '2026-01-02T00:00:00Z' },
      ],
    });
    const request = await setup();
    const res = await request.get('/v1/admin/api-keys')
      .set('x-user-id', USER_ID);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].keyPrefix).toBe('ultr_abc');
    expect(res.body.data[0].name).toBe('Production');
  });

  it('returns 401 without x-user-id', async () => {
    const request = await setup();
    const res = await request.get('/v1/admin/api-keys');
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/admin/api-keys', () => {
  it('creates a new API key with plaintext returned', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'ak_new', key_prefix: 'ultr_xyz', name: 'New Key', created_at: '2026-01-03T00:00:00Z' }],
    });
    const request = await setup();
    const res = await request.post('/v1/admin/api-keys')
      .set('x-user-id', USER_ID)
      .set('x-org-id', ORG_ID)
      .send({ name: 'New Key' });
    expect(res.status).toBe(201);
    expect(res.body.data.key_prefix).toBe('ultr_xyz');
    expect(res.body.data.key).toMatch(/^ultr_/); // plaintext key returned
  });

  it('creates key with custom quota limits', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'ak_q', key_prefix: 'ultr_q', name: 'Quota Key', created_at: '2026-01-03T00:00:00Z' }],
    });
    const request = await setup();
    const res = await request.post('/v1/admin/api-keys')
      .set('x-user-id', USER_ID)
      .set('x-org-id', ORG_ID)
      .send({ name: 'Quota Key', quotaLimits: { 'llama-3.1-8b': 100000 } });
    expect(res.status).toBe(201);
    // Should have passed quota limits to query
    expect(mockQuery.mock.calls[0][1][5]).toContain('llama-3.1-8b');
  });

  it('returns 401 without auth headers', async () => {
    const request = await setup();
    const res = await request.post('/v1/admin/api-keys')
      .send({ name: 'New Key' });
    expect(res.status).toBe(401);
  });
});

describe('DELETE /v1/admin/api-keys/:id', () => {
  it('revokes an API key', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    const request = await setup();
    const res = await request.delete('/v1/admin/api-keys/ak_1')
      .set('x-user-id', USER_ID);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('revoked');
  });

  it('returns 404 for unknown key', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });
    const request = await setup();
    const res = await request.delete('/v1/admin/api-keys/nonexistent')
      .set('x-user-id', USER_ID);
    expect(res.status).toBe(404);
  });
});
