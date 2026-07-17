import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Test the middleware without booting express. We import it after
// mocking jsonwebtoken so the JWT_SECRET path stays predictable.
process.env.JWT_SECRET = 'unit-test-secret-do-not-use-in-prod';

import { authMiddleware } from './auth.js';

function makeReqRes(headers: Record<string, string> = {}) {
  const req: any = { headers: { ...headers } };
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

const SECRET = 'unit-test-secret-do-not-use-in-prod';
const validClaims = (overrides: Record<string, unknown> = {}) =>
  jwt.sign(
    { sub: 'usr_test', org_id: '00000000-0000-0000-0000-000000000001', role: 'admin', ...overrides },
    SECRET,
    { algorithm: 'HS256', expiresIn: '5m', issuer: 'ultralisk-auth' }
  );

describe('authMiddleware', () => {
  it('rejects requests with no Authorization header', () => {
    const { req, res, next } = makeReqRes();
    authMiddleware(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects requests with malformed Authorization header', () => {
    const { req, res, next } = makeReqRes({ authorization: 'Token abc' });
    authMiddleware(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects requests with an invalid token signature', () => {
    const bad = jwt.sign({ sub: 'x', org_id: 'y' }, 'wrong-secret', { algorithm: 'HS256' });
    const { req, res, next } = makeReqRes({ authorization: `Bearer ${bad}` });
    authMiddleware(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects expired tokens', () => {
    const expired = jwt.sign(
      { sub: 'x', org_id: 'y', role: 'r' },
      SECRET,
      { algorithm: 'HS256', expiresIn: -10, issuer: 'ultralisk-auth' }
    );
    const { req, res, next } = makeReqRes({ authorization: `Bearer ${expired}` });
    authMiddleware(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects tokens missing required claims', () => {
    const noSub = jwt.sign({ org_id: 'y' }, SECRET, { algorithm: 'HS256' });
    const { req, res, next } = makeReqRes({ authorization: `Bearer ${noSub}` });
    authMiddleware(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts a valid Bearer token and sets x-user-id / x-org-id / x-user-role', () => {
    const tok = validClaims({ role: 'developer' });
    const { req, res, next } = makeReqRes({ authorization: `Bearer ${tok}` });
    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.headers['x-user-id']).toBe('usr_test');
    expect(req.headers['x-org-id']).toBe('00000000-0000-0000-0000-000000000001');
    expect(req.headers['x-user-role']).toBe('developer');
    expect(res.statusCode).toBe(200);
  });

  it('falls back to the jwt cookie when Authorization header is absent', () => {
    const tok = validClaims();
    const { req, res, next } = makeReqRes({ cookie: `jwt=${tok}` });
    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.headers['x-user-id']).toBe('usr_test');
  });
});
