const JWT_KEY = 'ultralisk_jwt';

// Dispatched on the window whenever apiFetch hits a 401. AuthContext
// listens for this and clears local auth state, which makes AuthGuard
// redirect to /login. Use a CustomEvent (not a state field) so apiFetch
// doesn't have to know about React/AuthContext.
export const AUTH_EXPIRED_EVENT = 'ultralisk:auth-expired';

// HTTP statuses that are safe to retry: transient gateway / upstream
// errors. 4xx is the caller's fault (don't retry; would just hide the
// real error). 408 (Request Timeout) is sometimes returned by proxies
// in place of 504; treat it as transient.
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

// Network errors that look like 'the API is briefly unavailable':
// fetch throws TypeError with messages like "Failed to fetch" /
// "NetworkError when attempting to fetch resource" / "Load failed".
function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return false;
  if (err instanceof TypeError) return true;
  // Some browsers wrap network failures in DOMException.
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) return true;
  return false;
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Request timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export interface ApiFetchOptions extends RequestInit {
  /** Request timeout in ms. Default 30s. Set 0 to disable. */
  timeoutMs?: number;
  /** If true, do not dispatch AUTH_EXPIRED_EVENT on 401. Use for the
   *  login endpoint itself (which is expected to return 401). */
  skipAuthExpired?: boolean;
  /** Max number of retry attempts on transient failures. Default 2.
   *  Set 0 to disable. Each retry is bounded by timeoutMs. */
  retries?: number;
  /** Base delay for exponential backoff (ms). Default 250. */
  retryBackoffMs?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const {
    timeoutMs = 30_000,
    skipAuthExpired,
    retries = 2,
    retryBackoffMs = 250,
    ...init
  } = options;

  // Don't retry mutating verbs — a retry could double-execute.
  const method = (init.method ?? 'GET').toUpperCase();
  const safeRetry = method === 'GET' || method === 'HEAD';

  const maxAttempts = safeRetry ? retries + 1 : 1;

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      // Exponential backoff with full jitter: 250ms, 500ms, 1000ms, ...
      // plus a tiny random spread so a thundering-herd of UIs
      // hitting the API at the same time don't all retry at once.
      const base = retryBackoffMs * 2 ** (attempt - 1);
      const jitter = Math.random() * base * 0.5;
      await delay(base + jitter);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string>),
    };
    const fromStorage = localStorage.getItem(JWT_KEY);
    if (fromStorage) {
      headers['Authorization'] = `Bearer ${fromStorage}`;
    } else if (typeof document !== 'undefined') {
      const cookieMatch = document.cookie.match(/(?:^|;\s*)jwt=([^;]+)/);
      if (cookieMatch) headers['Authorization'] = `Bearer ${decodeURIComponent(cookieMatch[1])}`;
    }

    let res: Response | null = null;
    try {
      if (timeoutMs > 0) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        init.signal = ctrl.signal;
        try {
          res = await fetch(path, { ...init, headers, credentials: 'include' });
        } catch (err) {
          clearTimeout(timer);
          if ((err as Error).name === 'AbortError') throw new TimeoutError(timeoutMs);
          throw err;
        }
        clearTimeout(timer);
      } else {
        res = await fetch(path, { ...init, headers, credentials: 'include' });
      }
    } catch (err) {
      lastError = err;
      if (isNetworkError(err) && attempt < maxAttempts - 1) continue;
      // Not a network error, or no retries left — propagate.
      throw err;
    }

    if (res.ok) return res.json();

    // Non-OK: parse body for code/message.
    const body = await res.json().catch(() => ({ error: { code: 'unknown', message: res.statusText } }));
    const code = body.error?.code ?? 'unknown';
    const message = body.error?.message ?? res.statusText;

    if (RETRYABLE_STATUSES.has(res.status) && attempt < maxAttempts - 1) {
      lastError = new ApiError(res.status, code, message);
      continue; // retry
    }

    if (res.status === 401 && !skipAuthExpired && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    }
    throw new ApiError(res.status, code, message);
  }

  // All attempts exhausted.
  throw lastError;
}
