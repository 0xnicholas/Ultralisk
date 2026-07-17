import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db/index.js';
const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

async function setup() {
  const express = (await import('express')).default;
  const { default: clustersRoutes } = await import('./clusters.js');
  const supertest = (await import('supertest')).default;
  const app = express();
  app.use(express.json());
  app.use('/v1/admin', clustersRoutes);
  return supertest(app);
}

beforeEach(() => {
  mockQuery.mockReset();
});

describe('GET /v1/admin/clusters', () => {
  it('returns cluster list with node counts', async () => {
    const rows = [
      { id: 'c1', name: 'us-east-1-prod', region: 'us-east-1', gpu_type: 'H100',
        node_count: 4, healthy_nodes: 4, created_at: '2026-01-01T00:00:00Z' },
      { id: 'c2', name: 'us-west-2-prod', region: 'us-west-2', gpu_type: 'H100',
        node_count: 2, healthy_nodes: 1, created_at: '2026-01-02T00:00:00Z' },
    ];
    mockQuery.mockResolvedValueOnce({ rows });

    const request = await setup();
    const res = await request.get('/v1/admin/clusters');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].name).toBe('us-east-1-prod');
    expect(res.body.data[0].status).toBe('healthy');
    expect(res.body.data[1].status).toBe('degraded');
    expect(res.body.pagination.total).toBe(2);
  });

  it('returns empty list when no clusters exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.get('/v1/admin/clusters');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns 500 on query failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db error'));
    const request = await setup();
    const res = await request.get('/v1/admin/clusters');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('internal_error');
  });
});

describe('GET /v1/admin/clusters/:id', () => {
  it('returns cluster detail with nodes and GPU cards', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'c1', name: 'us-east-1-prod', region: 'us-east-1', gpu_type: 'H100', created_at: '2026-01-01T00:00:00Z' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'n1', cluster_id: 'c1', hostname: 'node-1', gpu_model: 'H100', gpu_count: 8 }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'g1', node_id: 'n1', card_index: 0, memory_mb: 81920 }] });

    const request = await setup();
    const res = await request.get('/v1/admin/clusters/c1');

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('us-east-1-prod');
    expect(res.body.data.nodes).toHaveLength(1);
    expect(res.body.data.total_gpu).toBe(8);
  });

  it('returns 404 for unknown cluster', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.get('/v1/admin/clusters/nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns 500 on query failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db error'));
    const request = await setup();
    const res = await request.get('/v1/admin/clusters/c1');
    expect(res.status).toBe(500);
  });
});
