import { describe, it, expect, vi } from 'vitest';
import { requestIdMiddleware } from './requestId.js';

function makeReqRes(headers: Record<string, string> = {}) {
  const req: any = { headers: { ...headers }, method: 'GET', path: '/test' };
  const setHeaders: Record<string, string> = {};
  const res: any = {
    statusCode: 200,
    on(event: string, cb: () => void) { if (event === 'finish') this._finish = cb; return this; },
    setHeader(name: string, value: string) { setHeaders[name] = value; return this; },
  };
  const next = vi.fn();
  return { req, res, setHeaders, next };
}

describe('requestIdMiddleware', () => {
  it('attaches a UUID-shaped id and child logger when no header is inbound', () => {
    const { req, res, setHeaders, next } = makeReqRes();
    requestIdMiddleware(req, res, next);
    expect(req.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(req.log).toBeDefined();
    expect(req.log.info).toBeInstanceOf(Function);
    expect(setHeaders['x-request-id']).toBe(req.id);
    expect(next).toHaveBeenCalledOnce();
  });

  it('reuses an inbound x-request-id that matches the safe pattern', () => {
    const { req, res, setHeaders, next } = makeReqRes({ 'x-request-id': 'trace_abc.123-XYZ' });
    requestIdMiddleware(req, res, next);
    expect(req.id).toBe('trace_abc.123-XYZ');
    expect(setHeaders['x-request-id']).toBe('trace_abc.123-XYZ');
  });

  it('rejects inbound ids with spaces, quotes, or > 128 chars', () => {
    const cases = [
      'has space',
      'has"quote',
      'a'.repeat(129),
      '',
      'has/slash',
    ];
    for (const inbound of cases) {
      const { req, res, setHeaders } = makeReqRes({ 'x-request-id': inbound });
      requestIdMiddleware(req, res, vi.fn());
      expect(req.id).not.toBe(inbound);
      expect(setHeaders['x-request-id']).toBe(req.id);
      expect(req.id).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it('ignores array-valued x-request-id headers (defensive)', () => {
    const { req, res } = makeReqRes();
    req.headers['x-request-id'] = ['one', 'two'];
    requestIdMiddleware(req, res, vi.fn());
    expect(req.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('emits a structured log line on response finish', () => {
    const { req, res } = makeReqRes();
    let logged: any = null;
    requestIdMiddleware(req, res, vi.fn());
    // intercept the child logger's info call
    req.log.info = (obj: any, msg?: string) => { logged = { obj, msg }; };
    res.statusCode = 201;
    res._finish();
    expect(logged).not.toBeNull();
    expect(logged.obj.method).toBe('GET');
    expect(logged.obj.path).toBe('/test');
    expect(logged.obj.status).toBe(201);
    expect(typeof logged.obj.duration_ms).toBe('number');
  });
});
