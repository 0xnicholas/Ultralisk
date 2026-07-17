import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db/index.js';
const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

const ORG_ID = 'org_001';

async function setup() {
  const express = (await import('express')).default;
  const { default: orgRoutes } = await import('./organization.js');
  const supertest = (await import('supertest')).default;
  const app = express();
  app.use(express.json());
  app.use('/v1/admin', orgRoutes);
  return supertest(app);
}

beforeEach(() => {
  mockQuery.mockReset();
});

describe('GET /v1/admin/organization', () => {
  it('returns organization details', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: ORG_ID, name: 'Acme AI', slug: 'acme-ai', plan: 'enterprise', created_at: '2026-01-01T00:00:00Z' }],
    });
    const request = await setup();
    const res = await request.get('/v1/admin/organization')
      .set('x-org-id', ORG_ID);
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Acme AI');
  });

  it('returns 401 without x-org-id', async () => {
    const request = await setup();
    const res = await request.get('/v1/admin/organization');
    expect(res.status).toBe(401);
  });

  it('returns 404 when org not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.get('/v1/admin/organization')
      .set('x-org-id', 'nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns 500 on query failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db error'));
    const request = await setup();
    const res = await request.get('/v1/admin/organization')
      .set('x-org-id', ORG_ID);
    expect(res.status).toBe(500);
  });
});
