import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db/index.js';
const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

async function setup() {
  const express = (await import('express')).default;
  const { default: nodesRoutes } = await import('./nodes.js');
  const supertest = (await import('supertest')).default;
  const app = express();
  app.use(express.json());
  app.use('/v1/admin', nodesRoutes);
  return supertest(app);
}

beforeEach(() => {
  mockQuery.mockReset();
});

const sampleNode = {
  id: 'n1', cluster_id: 'c1', hostname: 'gpu-node-1',
  gpu_model: 'H100', gpu_count: 8, driver_version: '550.54.15',
  cuda_version: '12.4', status: 'online', created_at: '2026-01-01T00:00:00Z',
};

const sampleGpuCard = {
  id: 'gc1', node_id: 'n1', card_index: 0, memory_mb: 81920, created_at: '2026-01-01T00:00:00Z',
};

describe('GET /v1/admin/nodes', () => {
  it('returns all nodes', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleNode] });
    const request = await setup();
    const res = await request.get('/v1/admin/nodes');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].hostname).toBe('gpu-node-1');
    expect(res.body.pagination.total).toBe(1);
  });

  it('returns empty list when no nodes', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.get('/v1/admin/nodes');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns 500 on query failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db error'));
    const request = await setup();
    const res = await request.get('/v1/admin/nodes');
    expect(res.status).toBe(500);
  });
});

describe('GET /v1/admin/nodes/:id', () => {
  it('returns node detail with GPU cards', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleNode] });
    mockQuery.mockResolvedValueOnce({ rows: [sampleGpuCard] });
    const request = await setup();
    const res = await request.get('/v1/admin/nodes/n1');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('n1');
    expect(res.body.data.gpu_cards).toHaveLength(1);
  });

  it('returns 404 for unknown node', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.get('/v1/admin/nodes/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('GET /v1/admin/clusters/:clusterId/nodes/:nodeId', () => {
  it('returns node scoped to cluster', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleNode] });
    mockQuery.mockResolvedValueOnce({ rows: [sampleGpuCard] });
    const request = await setup();
    const res = await request.get('/v1/admin/clusters/c1/nodes/n1');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('n1');
    expect(res.body.data.cluster_id).toBe('c1');
  });

  it('returns 404 when node not in cluster', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.get('/v1/admin/clusters/c1/nodes/nonexistent');
    expect(res.status).toBe(404);
  });
});
