import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db/index.js';
const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

async function setup() {
  const express = (await import('express')).default;
  const { default: auditLogRoutes } = await import('./auditLogs.js');
  const supertest = (await import('supertest')).default;
  const app = express();
  app.use(express.json());
  app.use('/v1/admin', auditLogRoutes);
  return supertest(app);
}

beforeEach(() => {
  mockQuery.mockReset();
});

const sampleLog = {
  id: 'log_1', org_id: 'org_001', user_id: 'usr_1', user_email: 'dev@example.com',
  action: 'post.endpoints', resource_type: 'endpoints', resource_id: 'ep_1',
  details: { path: '/v1/admin/endpoints', status: 200, method: 'POST' },
  ip_address: '10.0.0.1', created_at: new Date('2026-01-01T12:00:00Z'),
};

describe('GET /v1/admin/audit-logs', () => {
  it('returns paginated audit logs', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [sampleLog] });
    const request = await setup();
    const res = await request.get('/v1/admin/audit-logs')
      .set('x-org-id', 'org_001');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].action).toBe('post.endpoints');
    expect(res.body.pagination.total).toBe(1);
    expect(res.body.pagination.page).toBe(1);
  });

  it('filters by action', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [sampleLog] });
    const request = await setup();
    await request.get('/v1/admin/audit-logs?action=post.endpoints')
      .set('x-org-id', 'org_001');
    expect(mockQuery.mock.calls[0][1]).toContain('org_001');
    expect(mockQuery.mock.calls[0][1]).toContain('post.endpoints');
  });

  it('filters by date range', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.get('/v1/admin/audit-logs?from=2026-01-01&to=2026-01-31')
      .set('x-org-id', 'org_001');
    expect(res.status).toBe(200);
    // Should have 3 params: org_id, from, to
    expect(mockQuery.mock.calls[0][1].length).toBeGreaterThanOrEqual(3);
  });

  it('searches by query string', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    await request.get('/v1/admin/audit-logs?q=endpoints')
      .set('x-org-id', 'org_001');
    // Should have 2 params: org_id + search term with wildcards
    expect(mockQuery.mock.calls[0][1].length).toBe(2);
  });

  it('uses default org-id when header absent', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    await request.get('/v1/admin/audit-logs');
    expect(mockQuery.mock.calls[0][1][0]).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('enforces pagination limits', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    await request.get('/v1/admin/audit-logs?page=2&limit=200')
      .set('x-org-id', 'org_001');
    // limit should be capped at 100
    const params = mockQuery.mock.calls[1][1];
    expect(params[params.length - 2]).toBe(100); // limit param (second-to-last)
  });
});

describe('GET /v1/admin/audit-logs/export', () => {
  it('exports CSV file', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          created_at: new Date('2026-01-01T12:00:00Z'),
          user_email: 'dev@example.com',
          action: 'post.endpoints',
          resource_type: 'endpoints',
          resource_id: 'ep_1',
          details: { path: '/v1/admin/endpoints' },
          ip_address: '10.0.0.1',
        },
      ],
    });
    const request = await setup();
    const res = await request.get('/v1/admin/audit-logs/export')
      .set('x-org-id', 'org_001');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text).toContain('Timestamp,User,Action');
    expect(res.text).toContain('dev@example.com');
    expect(res.text).toContain('post.endpoints');
  });

  it('filters export by date range', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    await request.get('/v1/admin/audit-logs/export?from=2026-01-01&to=2026-01-31')
      .set('x-org-id', 'org_001');
    expect(mockQuery.mock.calls[0][1].length).toBeGreaterThanOrEqual(3);
  });

  it('returns 500 on query failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db error'));
    const request = await setup();
    const res = await request.get('/v1/admin/audit-logs/export')
      .set('x-org-id', 'org_001');
    expect(res.status).toBe(500);
  });
});
