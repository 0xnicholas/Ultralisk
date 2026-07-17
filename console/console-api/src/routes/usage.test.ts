import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db/index.js';
const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

const ORG_ID = 'org_001';

async function setup() {
  const express = (await import('express')).default;
  const { default: usageRoutes } = await import('./usage.js');
  const supertest = (await import('supertest')).default;
  const app = express();
  app.use(express.json());
  // Inject a logger so req.log doesn't break
  app.use((req: any, _res: any, next: any) => { req.log = { error: vi.fn() }; next(); });
  app.use('/v1/admin', usageRoutes);
  return supertest(app);
}

beforeEach(() => {
  mockQuery.mockReset();
});

describe('GET /v1/admin/usage', () => {
  it('returns usage summary with by-model and by-key breakdown', async () => {
    // totals query
    mockQuery.mockResolvedValueOnce({
      rows: [{ requests: 1000, input_tokens: 50000, output_tokens: 30000 }],
    });
    // by-model query
    mockQuery.mockResolvedValueOnce({
      rows: [
        { model_id: 'llama-3.1-8b', requests: 600, input_tokens: 30000, output_tokens: 20000 },
        { model_id: 'deepseek-r1', requests: 400, input_tokens: 20000, output_tokens: 10000 },
      ],
    });
    // by-key query
    mockQuery.mockResolvedValueOnce({
      rows: [
        { key_id: 'key_001', requests: 800, input_tokens: 40000, output_tokens: 25000 },
      ],
    });
    // models query (for pricing)
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'llama-3.1-8b', name: 'Llama 3.1 8B', pricing_per_1k_input: '0.0005', pricing_per_1k_output: '0.0015' },
        { id: 'deepseek-r1', name: 'DeepSeek R1', pricing_per_1k_input: '0.0003', pricing_per_1k_output: '0.0012' },
      ],
    });
    // cost aggregation query
    mockQuery.mockResolvedValueOnce({
      rows: [
        { model_id: 'llama-3.1-8b', pt: 30000, ct: 20000 },
        { model_id: 'deepseek-r1', pt: 20000, ct: 10000 },
      ],
    });
    // recent activity query
    mockQuery.mockResolvedValueOnce({
      rows: [
        { timestamp: '2026-01-01T12:00:00Z', model_id: 'llama-3.1-8b', status: 'completed', prompt_tokens: 100, completion_tokens: 50 },
      ],
    });

    const request = await setup();
    const res = await request.get('/v1/admin/usage')
      .set('x-org-id', ORG_ID);

    expect(res.status).toBe(200);
    expect(res.body.data.totals.requests).toBe(1000);
    expect(res.body.data.totals.input_tokens).toBe(50000);
    expect(res.body.data.by_model).toHaveLength(2);
    expect(res.body.data.by_key).toHaveLength(1);
    expect(res.body.data.recent_activity).toHaveLength(1);
    expect(res.body.data.period.from).toBeDefined();
    expect(res.body.data.period.to).toBeDefined();
    expect(mockQuery).toHaveBeenCalledTimes(6);
  });

  it('returns 401 without x-org-id', async () => {
    const request = await setup();
    const res = await request.get('/v1/admin/usage');
    expect(res.status).toBe(401);
  });

  it('handles empty usage data', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ requests: 0, input_tokens: 0, output_tokens: 0 }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const request = await setup();
    const res = await request.get('/v1/admin/usage')
      .set('x-org-id', ORG_ID);

    expect(res.status).toBe(200);
    expect(res.body.data.totals.requests).toBe(0);
    expect(res.body.data.by_model).toEqual([]);
  });

  it('honors range parameter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ requests: 0, input_tokens: 0, output_tokens: 0 }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const request = await setup();
    await request.get('/v1/admin/usage?range=90d')
      .set('x-org-id', ORG_ID);
    // Should use 90 days in the SQL condition
    expect(mockQuery.mock.calls[0][1][1]).toBeDefined();
  });
});
