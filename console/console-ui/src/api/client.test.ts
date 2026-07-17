import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch, ApiError, TimeoutError, AUTH_EXPIRED_EVENT } from './client';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
  vi.stubGlobal('localStorage', makeStorageStub());
  if (typeof document === 'undefined') {
    vi.stubGlobal('document', { cookie: '' } as any);
  }
});

function makeStorageStub(): Storage {
  const store: Record<string, string> = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    key: (i) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
  } as Storage;
}

// Build a Response-shaped object so apiFetch's body parser is happy.
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('apiFetch - happy path', () => {
  it('returns parsed JSON on 200', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { data: { ok: true } }));
    const r = await apiFetch<{ data: { ok: boolean } }>('/x');
    expect(r.data.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('attaches Authorization from localStorage when present', async () => {
    localStorage.setItem('ultralisk_jwt', 'tok-123');
    mockFetch.mockResolvedValueOnce(jsonResponse(200, {}));
    await apiFetch('/x');
    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer tok-123');
  });

  it('sends credentials: include', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, {}));
    await apiFetch('/x');
    expect(mockFetch.mock.calls[0][1].credentials).toBe('include');
  });
});

describe('apiFetch - error path', () => {
  it('throws ApiError with status + code + message on non-ok', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(404, { error: { code: 'not_found', message: 'nope' } }));
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 404, code: 'not_found', message: 'nope' });
  });

  it('dispatches AUTH_EXPIRED_EVENT on 401', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(401, { error: { code: 'unauthorized', message: 'token expired' } }));
    const handler = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, handler);
    await expect(apiFetch('/x')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledOnce();
    window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
  });

  it('does NOT dispatch AUTH_EXPIRED_EVENT when skipAuthExpired is true', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(401, { error: { code: 'invalid_credentials', message: 'bad' } }));
    const handler = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, handler);
    await expect(apiFetch('/auth/login', { skipAuthExpired: true })).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
  });

  it('handles non-JSON error bodies gracefully', async () => {
    // retries: 0 so we get the 502 immediately instead of retrying
    // (502 is now retryable on transient errors).
    mockFetch.mockResolvedValueOnce(new Response('Bad Gateway', { status: 502, statusText: 'Bad Gateway' }));
    await expect(apiFetch('/x', { retries: 0 })).rejects.toMatchObject({ status: 502, message: 'Bad Gateway' });
  });
});

describe('apiFetch - timeout', () => {
  it('aborts and throws TimeoutError when timeoutMs elapses', async () => {
    mockFetch.mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_, rej) => {
      init.signal?.addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        rej(e);
      });
    }));
    await expect(apiFetch('/slow', { timeoutMs: 50 })).rejects.toBeInstanceOf(TimeoutError);
  });

  it('does not start a timer when timeoutMs is 0', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, {}));
    await apiFetch('/x', { timeoutMs: 0 });
    expect(mockFetch.mock.calls[0][1].signal).toBeUndefined();
  });
});

describe('apiFetch - retry on transient failure', () => {
  it('retries on 502 and eventually succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(502, { error: { code: 'bad_gateway', message: 'down' } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { ok: true } }));
    const r = await apiFetch<{ data: { ok: boolean } }>('/x');
    expect(r.data.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on 503 and gives up after retries+1 attempts', async () => {
    mockFetch.mockResolvedValue(jsonResponse(503, { error: { code: 'unavailable', message: 'still down' } }));
    await expect(apiFetch('/x', { retries: 2, retryBackoffMs: 1 })).rejects.toMatchObject({ status: 503 });
    expect(mockFetch).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('does NOT retry on 4xx (client error)', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(400, { error: { code: 'bad_request', message: 'no' } }));
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 400 });
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('does NOT retry POST (would risk double-execute)', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(503, { error: { code: 'unavailable', message: 'down' } }));
    await expect(apiFetch('/x', { method: 'POST' })).rejects.toMatchObject({ status: 503 });
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('does NOT retry DELETE', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(502, { error: { code: 'bad_gateway', message: 'down' } }));
    await expect(apiFetch('/x', { method: 'DELETE' })).rejects.toMatchObject({ status: 502 });
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('retries on network error (TypeError "Failed to fetch")', async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200, { data: { ok: true } }));
    const r = await apiFetch<{ data: { ok: boolean } }>('/x', { retryBackoffMs: 1 });
    expect(r.data.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('gives up on network error after retries', async () => {
    mockFetch.mockRejectedValue(new TypeError('NetworkError'));
    await expect(apiFetch('/x', { retries: 1, retryBackoffMs: 1 })).rejects.toBeInstanceOf(TypeError);
    expect(mockFetch).toHaveBeenCalledTimes(2); // initial + 1 retry
  });

  it('does NOT retry on TimeoutError (would extend the wait)', async () => {
    mockFetch.mockImplementation((_url: string, init: RequestInit) => new Promise((_, rej) => {
      init.signal?.addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        rej(e);
      });
    }));
    await expect(apiFetch('/x', { timeoutMs: 20, retries: 5, retryBackoffMs: 1 })).rejects.toBeInstanceOf(TimeoutError);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('respects retries: 0 to disable', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(502, { error: { code: 'bad_gateway', message: 'down' } }));
    await expect(apiFetch('/x', { retries: 0 })).rejects.toMatchObject({ status: 502 });
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('treats 408 and 429 as retryable', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(408, { error: { code: 'timeout', message: 't' } }))
      .mockResolvedValueOnce(jsonResponse(429, { error: { code: 'rate_limited', message: 'rl' } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { ok: true } }));
    const r = await apiFetch<{ data: { ok: boolean } }>('/x', { retryBackoffMs: 1 });
    expect(r.data.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

describe('ApiError', () => {
  it('preserves name, status, code, message', () => {
    const e = new ApiError(401, 'unauthorized', 'token expired');
    expect(e.name).toBe('ApiError');
    expect(e.status).toBe(401);
    expect(e.code).toBe('unauthorized');
    expect(e.message).toBe('token expired');
    expect(e).toBeInstanceOf(Error);
  });
});
