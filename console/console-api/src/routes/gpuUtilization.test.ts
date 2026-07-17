import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db/index.js';
const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

async function setup() {
  const express = (await import('express')).default;
  const { default: gpuUtilRoutes } = await import('./gpuUtilization.js');
  const supertest = (await import('supertest')).default;
  const app = express();
  app.use(express.json());
  app.use('/v1/admin', gpuUtilRoutes);
  return supertest(app);
}

beforeEach(() => {
  mockQuery.mockReset();
});

describe('GET /v1/admin/gpu-utilization', () => {
  it('returns GPU utilization overview with time series', async () => {
    // nodes query
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'n1', gpu_count: 8, status: 'online' },
        { id: 'n2', gpu_count: 4, status: 'online' },
      ],
    });
    // latest snapshots (DISTINCT ON) — 2 cards returned per node
    mockQuery.mockResolvedValueOnce({
      rows: [
        { node_id: 'n1', card_index: 0, utilization_pct: 65, memory_used_mb: 40960, temperature: 72, timestamp: '2026-01-01T12:00:00Z' },
        { node_id: 'n1', card_index: 1, utilization_pct: 5, memory_used_mb: 4096, temperature: 42, timestamp: '2026-01-01T12:00:00Z' },
        { node_id: 'n2', card_index: 0, utilization_pct: 45, memory_used_mb: 20480, temperature: 65, timestamp: '2026-01-01T12:00:00Z' },
      ],
    });
    // time series query (empty — no hourly buckets yet)
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // per-model query (with deployment_allocation CTE)
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no active deployments
    // per-tenant query
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const request = await setup();
    const res = await request.get('/v1/admin/gpu-utilization');

    expect(res.status).toBe(200);
    expect(res.body.data.overview.total_gpu).toBe(12);
    // avg of 65 + 5 + 45 = 115 / 3 ≈ 38
    expect(res.body.data.overview.avg_utilization).toBe(38);
    // Only card with util < 10%
    expect(res.body.data.overview.idle_gpu).toBe(1);
    expect(res.body.data.time_series).toEqual([]);
    expect(res.body.data.per_model).toEqual([]);
    expect(res.body.data.per_tenant).toEqual([]);
    expect(mockQuery).toHaveBeenCalledTimes(5);
  });

  it('handles no online nodes', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'n1', gpu_count: 8, status: 'offline' }] });
    // latest snapshots — filtered by n.status='online' so none returned
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const request = await setup();
    const res = await request.get('/v1/admin/gpu-utilization');

    expect(res.status).toBe(200);
    expect(res.body.data.overview.total_gpu).toBe(8);
    expect(res.body.data.overview.avg_utilization).toBe(0);
    expect(res.body.data.overview.idle_gpu).toBe(0);
  });

  it('returns 500 on query failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db error'));
    const request = await setup();
    const res = await request.get('/v1/admin/gpu-utilization');
    expect(res.status).toBe(500);
  });
});
