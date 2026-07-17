import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db/index.js';
const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

async function setup() {
  const express = (await import('express')).default;
  const { default: modelsRoutes } = await import('./models.js');
  const supertest = (await import('supertest')).default;
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => { req.log = { error: vi.fn() }; next(); });
  app.use('/v1/admin', modelsRoutes);
  return supertest(app);
}

beforeEach(() => {
  mockQuery.mockReset();
});

const sampleModel = {
  id: 'llama-3.1-8b', name: 'Llama 3.1 8B', provider: 'Meta',
  description: 'Efficient 8B parameter model',
  status: 'active', context_length: 131072,
  pricing_per_1k_input: '0.0005', pricing_per_1k_output: '0.0015',
  capabilities: ['chat', 'function_calling'],
  created_at: '2026-01-01T00:00:00Z',
};

describe('GET /v1/admin/models', () => {
  it('returns active models list', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleModel] });
    const request = await setup();
    const res = await request.get('/v1/admin/models');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe('llama-3.1-8b');
    expect(res.body.data[0].pricing.serverless.input_per_1m_tokens).toBe(0.5);
    expect(res.body.data[0].capabilities.context_window).toBe(131072);
    expect(res.body.data[0].capabilities.tool_calling).toBe(false);
    expect(res.body.pagination.total).toBe(1);
  });

  it('returns empty list when no active models', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.get('/v1/admin/models');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns 500 on query failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db error'));
    const request = await setup();
    const res = await request.get('/v1/admin/models');
    expect(res.status).toBe(500);
  });
});

describe('GET /v1/admin/models/:id', () => {
  it('returns model detail', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleModel] });
    const request = await setup();
    const res = await request.get('/v1/admin/models/llama-3.1-8b');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('llama-3.1-8b');
    expect(res.body.data.description).toBe('Efficient 8B parameter model');
    expect(res.body.data.capabilities.tool_calling).toBe(false);
    expect(res.body.data.capabilities.context_window).toBe(131072);
  });

  it('returns 404 for unknown model', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.get('/v1/admin/models/nonexistent');
    expect(res.status).toBe(404);
  });
});
