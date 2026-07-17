import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db/index.js';
const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

const ORG_ID = 'org_001';

async function setup() {
  const express = (await import('express')).default;
  const { default: orgUpdateRoutes } = await import('./organizationUpdate.js');
  const supertest = (await import('supertest')).default;
  const app = express();
  app.use(express.json());
  app.use('/v1/admin', orgUpdateRoutes);
  return supertest(app);
}

beforeEach(() => {
  mockQuery.mockReset();
});

describe('PATCH /v1/admin/organization', () => {
  it('updates organization fields', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: ORG_ID, name: 'New Name', slug: 'new-name', created_at: '2026-01-01T00:00:00Z' }],
    });
    const request = await setup();
    const res = await request.patch('/v1/admin/organization')
      .set('x-org-id', ORG_ID)
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('New Name');
  });

  it('returns 401 without x-org-id', async () => {
    const request = await setup();
    const res = await request.patch('/v1/admin/organization')
      .send({ name: 'X' });
    expect(res.status).toBe(401);
  });

  it('returns 404 for nonexistent org', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.patch('/v1/admin/organization')
      .set('x-org-id', 'nonexistent')
      .send({ name: 'Test' });
    expect(res.status).toBe(404);
  });

  it('returns current org when no fields to update', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: ORG_ID, name: 'Acme AI', slug: 'acme-ai', created_at: '2026-01-01T00:00:00Z' }] });
    const request = await setup();
    const res = await request.patch('/v1/admin/organization')
      .set('x-org-id', ORG_ID)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Acme AI');
  });
});
