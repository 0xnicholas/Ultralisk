const JWT_KEY = 'ultralisk_jwt';

// Dispatched on the window whenever apiFetch hits a 401. AuthContext
// listens for this and clears local auth state, which makes AuthGuard
// redirect to /login. Use a CustomEvent (not a state field) so apiFetch
// doesn't have to know about React/AuthContext.
export const AUTH_EXPIRED_EVENT = 'ultralisk:auth-expired';

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
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { timeoutMs = 30_000, skipAuthExpired, ...init } = options;
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

  let res: Response;
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

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { code: 'unknown', message: res.statusText } }));
    const code = body.error?.code ?? 'unknown';
    const message = body.error?.message ?? res.statusText;
    if (res.status === 401 && !skipAuthExpired && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    }
    throw new ApiError(res.status, code, message);
  }

  return res.json();
}
