import { describe, it, expect, vi } from 'vitest';
import { rbacMiddleware } from './rbac.js';

function makeReqRes(method: string, path: string, role?: string) {
  const req: any = {
    method,
    path,
    headers: {},
  };
  if (role) req.headers['x-user-role'] = role;
  const res: any = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  const next = vi.fn();
  return { req, res, next };
}

// Tests use the actual PERMISSIONS defined in rbac.ts, so they validate
// the real permission map rather than synthetic test rules.

describe('rbacMiddleware', () => {
  describe('role hierarchy', () => {
    it('allows owner to access any path', () => {
      const { req, res, next } = makeReqRes('GET', '/v1/admin/audit-logs', 'owner');
      rbacMiddleware(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('allows admin to access admin-restricted paths', () => {
      const { req, res, next } = makeReqRes('GET', '/v1/admin/license', 'admin');
      rbacMiddleware(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('denies developer access to admin-restricted paths', () => {
      const { req, res, next } = makeReqRes('GET', '/v1/admin/license', 'developer');
      rbacMiddleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('forbidden');
    });
  });

  describe('billing role', () => {
    it('allows billing to GET /v1/admin/billing', () => {
      const { req, res, next } = makeReqRes('GET', '/v1/admin/billing', 'billing');
      rbacMiddleware(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('allows billing to GET /v1/admin/cost-analytics', () => {
      const { req, res, next } = makeReqRes('GET', '/v1/admin/cost-analytics', 'billing');
      rbacMiddleware(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('denies billing access to developer-write paths', () => {
      const { req, res, next } = makeReqRes('POST', '/v1/admin/endpoints', 'billing');
      rbacMiddleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    });
  });

  describe('method-specific rules', () => {
    it('allows readonly to GET /v1/admin/models', () => {
      const { req, res, next } = makeReqRes('GET', '/v1/admin/models', 'readonly');
      rbacMiddleware(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('denies readonly from POSTING /v1/admin/models (unmatched -> default developer)', () => {
      const { req, res, next } = makeReqRes('POST', '/v1/admin/models', 'readonly');
      rbacMiddleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    });

    it('allows developer to POST /v1/admin/endpoints', () => {
      const { req, res, next } = makeReqRes('POST', '/v1/admin/endpoints', 'developer');
      rbacMiddleware(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('allows developer to GET /v1/admin/endpoints (readonly rule applies)', () => {
      const { req, res, next } = makeReqRes('GET', '/v1/admin/endpoints', 'developer');
      rbacMiddleware(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('allows readonly to GET /v1/admin/endpoints', () => {
      const { req, res, next } = makeReqRes('GET', '/v1/admin/endpoints', 'readonly');
      rbacMiddleware(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('organization permissions', () => {
    it('allows readonly to GET /v1/admin/organization', () => {
      const { req, res, next } = makeReqRes('GET', '/v1/admin/organization', 'readonly');
      rbacMiddleware(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('denies developer from PATCHING /v1/admin/organization', () => {
      const { req, res, next } = makeReqRes('PATCH', '/v1/admin/organization', 'developer');
      rbacMiddleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    });

    it('allows admin to PATCH /v1/admin/organization', () => {
      const { req, res, next } = makeReqRes('PATCH', '/v1/admin/organization', 'admin');
      rbacMiddleware(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('chat completions', () => {
    it('allows developer to POST /v1/chat/completions', () => {
      const { req, res, next } = makeReqRes('POST', '/v1/chat/completions', 'developer');
      rbacMiddleware(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('denies readonly from POST /v1/chat/completions', () => {
      const { req, res, next } = makeReqRes('POST', '/v1/chat/completions', 'readonly');
      rbacMiddleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('default deny for unmatched paths', () => {
    it('requires developer for unknown admin paths', () => {
      const { req, res, next } = makeReqRes('GET', '/v1/admin/unknown-feature', 'readonly');
      rbacMiddleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    });

    it('allows developer for unknown admin paths', () => {
      const { req, res, next } = makeReqRes('GET', '/v1/admin/unknown-feature', 'developer');
      rbacMiddleware(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('edge cases', () => {
    it('falls back to readonly when x-user-role header is absent', () => {
      const { req, res, next } = makeReqRes('GET', '/v1/admin/unknown-endpoint', '');
      delete req.headers['x-user-role'];
      rbacMiddleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    });

    it('denies unknown roles', () => {
      const { req, res, next } = makeReqRes('GET', '/v1/admin/models', 'super-admin');
      rbacMiddleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    });
  });
});
