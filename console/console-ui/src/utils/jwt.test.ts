import { describe, it, expect } from 'vitest';
import { decodeJwtPayload, jwtExpiry, isJwtExpired } from './jwt';

// Helper: build a JWT-shaped string with a chosen exp claim, no signature check.
function fakeJwt(payload: Record<string, unknown>): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const b64 = (o: object) => btoa(JSON.stringify(o))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64(header)}.${b64(payload)}.signature`;
}

describe('decodeJwtPayload', () => {
  it('returns null on malformed input', () => {
    expect(decodeJwtPayload('')).toBeNull();
    expect(decodeJwtPayload('a.b')).toBeNull();
    expect(decodeJwtPayload('not.a.jwt')).toBeNull();
    expect(decodeJwtPayload('a.b.c.d')).toBeNull();
    expect(decodeJwtPayload(null as any)).toBeNull();
  });

  it('decodes a valid JWT body', () => {
    const tok = fakeJwt({ sub: 'usr_1', org_id: 'org_1', role: 'admin', exp: 12345, iat: 12000 });
    const p = decodeJwtPayload(tok);
    expect(p).toEqual({ sub: 'usr_1', org_id: 'org_1', role: 'admin', exp: 12345, iat: 12000 });
  });

  it('returns null when the middle segment is not valid JSON', () => {
    const tok = `${btoa('header').replace(/=/g, '')}.${btoa('not-json{').replace(/=/g, '')}.sig`;
    expect(decodeJwtPayload(tok)).toBeNull();
  });
});

describe('jwtExpiry', () => {
  it('returns the exp value when present', () => {
    expect(jwtExpiry(fakeJwt({ exp: 9999 }))).toBe(9999);
  });

  it('returns null when exp is absent', () => {
    expect(jwtExpiry(fakeJwt({ sub: 'u' }))).toBeNull();
  });

  it('returns null on malformed input', () => {
    expect(jwtExpiry('garbage')).toBeNull();
  });
});

describe('isJwtExpired', () => {
  it('returns true for a token whose exp is in the past', () => {
    expect(isJwtExpired(fakeJwt({ exp: 1000 }), 2000)).toBe(true);
  });

  it('returns true for a token whose exp is exactly now', () => {
    expect(isJwtExpired(fakeJwt({ exp: 2000 }), 2000)).toBe(true);
  });

  it('returns false for a token whose exp is in the future', () => {
    expect(isJwtExpired(fakeJwt({ exp: 5000 }), 2000)).toBe(false);
  });

  it('returns true for a token without an exp claim', () => {
    expect(isJwtExpired(fakeJwt({ sub: 'u' }), 2000)).toBe(true);
  });

  it('returns true for malformed input', () => {
    expect(isJwtExpired('garbage', 2000)).toBe(true);
  });
});
