import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db/index.js';
const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

const ORG_ID = 'org_001';

async function setup() {
  const express = (await import('express')).default;
  const { default: registryRoutes } = await import('./modelRegistry.js');
  const supertest = (await import('supertest')).default;
  const app = express();
  app.use(express.json());
  app.use('/v1/admin', registryRoutes);
  return supertest(app);
}

beforeEach(() => {
  mockQuery.mockReset();
});

const sampleEntry = {
  id: 'reg_1', org_id: ORG_ID, name: 'my-custom-model',
  source_type: 'hf', source_path: 'meta-llama/Llama-3.1-8B',
  status: 'ready', model_id: 'custom-my-custom-model-abc123',
  error_log: null, created_at: '2026-01-01T00:00:00Z', ready_at: '2026-01-01T01:00:00Z',
};

describe('GET /v1/admin/models/registry', () => {
  it('returns registry entries for org', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleEntry] });
    const request = await setup();
    const res = await request.get('/v1/admin/models/registry')
      .set('x-org-id', ORG_ID);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('my-custom-model');
  });

  it('returns empty list', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.get('/v1/admin/models/registry')
      .set('x-org-id', ORG_ID);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('falls back to default org-id when header absent', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleEntry] });
    const request = await setup();
    const res = await request.get('/v1/admin/models/registry');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    // Should have used the default org id
    expect(mockQuery.mock.calls[0][1][0]).toBe('00000000-0000-0000-0000-000000000001');
  });
});

describe('GET /v1/admin/models/registry/:id', () => {
  it('returns specific entry', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleEntry] });
    const request = await setup();
    const res = await request.get('/v1/admin/models/registry/reg_1')
      .set('x-org-id', ORG_ID);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('reg_1');
  });

  it('returns 404 for unknown entry', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.get('/v1/admin/models/registry/nonexistent')
      .set('x-org-id', ORG_ID);
    expect(res.status).toBe(404);
  });
});

describe('POST /v1/admin/models/registry/import', () => {
  it('creates import entry and triggers async import', async () => {
    // Use fake timers to prevent setTimeout from running
    vi.useFakeTimers();
    mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleEntry, status: 'importing', source_type: 'hf' }] });
    const request = await setup();
    const res = await request.post('/v1/admin/models/registry/import')
      .set('x-org-id', ORG_ID)
      .send({ name: 'my-model', source_type: 'hf', source_path: 'org/model' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('importing');
    vi.useRealTimers();
  });

  it('validates required fields', async () => {
    const request = await setup();
    const res = await request.post('/v1/admin/models/registry/import')
      .send({ name: 'm' }); // missing source_type and source_path
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_request');
  });

  it('rejects invalid source_type', async () => {
    const request = await setup();
    const res = await request.post('/v1/admin/models/registry/import')
      .send({ name: 'm', source_type: 'invalid', source_path: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_source_type');
  });
});

describe('DELETE /v1/admin/models/registry/:id', () => {
  it('deletes a registry entry', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    const request = await setup();
    const res = await request.delete('/v1/admin/models/registry/reg_1')
      .set('x-org-id', ORG_ID);
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);
  });

  it('returns 404 for unknown entry', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });
    const request = await setup();
    const res = await request.delete('/v1/admin/models/registry/nonexistent')
      .set('x-org-id', ORG_ID);
    expect(res.status).toBe(404);
  });
});
