import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db pool before importing auditLog so writeAuditLog doesn't
// try to connect to a real Postgres.
vi.mock('../db', () => ({
  default: {
    query: vi.fn(),
  },
}));

import pool from '../db';
import { auditMiddleware } from './auditLog.js';

const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

function makeReqRes(method: string, path: string, body: unknown = {}, headers: Record<string, string> = {}) {
  const req: any = { method, path, body, params: {}, headers: { ...headers } };
  const res: any = {
    headersSent: false,
    statusCode: 200,
    setHeader() { return this; },
    status(code: number) { this.statusCode = code; return this; },
    json(body: any) { this.body = body; return this; },
  };
  return { req, res };
}

beforeEach(() => {
  mockQuery.mockReset();
});

describe('auditMiddleware', () => {
  it('records a row on POST with status < 500', () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const { req, res } = makeReqRes('POST', '/v1/admin/endpoints', { id: 'ep_1' }, { 'x-org-id': 'org_1', 'x-user-id': 'usr_1' });
    auditMiddleware(req, res, vi.fn());
    res.status(200).json({ id: 'ep_1', ok: true });

    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO audit_logs');
    expect(params[0]).toBe('org_1');
    expect(params[1]).toBe('usr_1');
    expect(params[3]).toBe('post.endpoints');        // action: method.leaf-segment
    expect(params[4]).toBe('endpoints');              // resource_type (leaf path segment)
    expect(params[5]).toBe('ep_1');                  // resource_id from body.id
    expect(JSON.parse(params[6])).toEqual({ path: '/v1/admin/endpoints', status: 200 });
  });

  it('does NOT record on GET (non-mutating)', () => {
    const { req, res } = makeReqRes('GET', '/v1/admin/endpoints');
    auditMiddleware(req, res, vi.fn());
    res.json({ data: [] });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('does NOT record on 5xx (server errors are server-side, not user actions)', () => {
    const { req, res } = makeReqRes('POST', '/v1/admin/endpoints');
    auditMiddleware(req, res, vi.fn());
    res.status(500).json({ error: 'boom' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('records PATCH and DELETE', () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const patchReq = makeReqRes('PATCH', '/v1/admin/endpoints/ep_1', {});
    auditMiddleware(patchReq.req, patchReq.res, vi.fn());
    patchReq.res.status(200).json({ ok: true });
    const deleteReq = makeReqRes('DELETE', '/v1/admin/endpoints/ep_1', {});
    auditMiddleware(deleteReq.req, deleteReq.res, vi.fn());
    deleteReq.res.status(200).json({ ok: true });
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQuery.mock.calls[0][1][3]).toBe('patch.ep_1');
    expect(mockQuery.mock.calls[1][1][3]).toBe('delete.ep_1');
  });

  it('falls back to a default org_id when x-org-id header is absent', () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const { req, res } = makeReqRes('POST', '/v1/admin/keys', {}, {});
    auditMiddleware(req, res, vi.fn());
    res.json({ ok: true });
    expect(mockQuery.mock.calls[0][1][0]).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('does not crash if the audit insert itself fails', () => {
    mockQuery.mockRejectedValueOnce(new Error('db is down'));
    const { req, res } = makeReqRes('POST', '/v1/admin/endpoints');
    auditMiddleware(req, res, vi.fn());
    // Should not throw — audit failures must not break the request.
    expect(() => res.json({ ok: true })).not.toThrow();
  });

  it('preserves the original res.json return value', () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const { req, res } = makeReqRes('POST', '/v1/admin/x');
    auditMiddleware(req, res, vi.fn());
    const r = res.json({ ok: true });
    expect(r.body).toEqual({ ok: true });
  });
});
