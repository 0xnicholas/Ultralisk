import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch, ApiError, TimeoutError, AUTH_EXPIRED_EVENT } from './client';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
  vi.stubGlobal('localStorage', makeStorageStub());
  // Most jsdom runtimes give us a `document` already; only stub it if absent.
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

describe('apiFetch - happy path', () => {
  it('returns parsed JSON on 200', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: { ok: true } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const r = await apiFetch<{ data: { ok: boolean } }>('/x');
    expect(r.data.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('attaches Authorization from localStorage when present', async () => {
    localStorage.setItem('ultralisk_jwt', 'tok-123');
    mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await apiFetch('/x');
    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer tok-123');
  });

  it('does not throw when no auth header source is available', async () => {
    mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const headers = mockFetch.mock.calls[0]?.[1]?.headers as Record<string, string> | undefined;
    await apiFetch('/x');
    // request should still go through, just without Authorization
    expect(headers?.Authorization).toBeUndefined();
  });

  it('sends credentials: include', async () => {
    mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await apiFetch('/x');
    expect(mockFetch.mock.calls[0][1].credentials).toBe('include');
  });
});

describe('apiFetch - error path', () => {
  it('throws ApiError with status + code + message on non-ok', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'not_found', message: 'nope' } }), { status: 404 }));
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 404, code: 'not_found', message: 'nope' });
  });

  it('dispatches AUTH_EXPIRED_EVENT on 401', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'token expired' } }), { status: 401 }));
    const handler = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, handler);
    await expect(apiFetch('/x')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledOnce();
    window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
  });

  it('does NOT dispatch AUTH_EXPIRED_EVENT when skipAuthExpired is true', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'invalid_credentials', message: 'bad' } }), { status: 401 }));
    const handler = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, handler);
    await expect(apiFetch('/auth/login', { skipAuthExpired: true })).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
  });

  it('handles non-JSON error bodies gracefully', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Bad Gateway', { status: 502, statusText: 'Bad Gateway' }));
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 502, message: 'Bad Gateway' });
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
    mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await apiFetch('/x', { timeoutMs: 0 });
    // signal should be undefined on init
    expect(mockFetch.mock.calls[0][1].signal).toBeUndefined();
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
