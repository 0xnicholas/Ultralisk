const JWT_KEY = 'ultralisk_jwt';

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  const fromStorage = localStorage.getItem(JWT_KEY);
  if (fromStorage) {
    headers['Authorization'] = `Bearer ${fromStorage}`;
  } else if (typeof document !== 'undefined') {
    const cookieMatch = document.cookie.match(/(?:^|;\s*)jwt=([^;]+)/);
    if (cookieMatch) {
      headers['Authorization'] = `Bearer ${decodeURIComponent(cookieMatch[1])}`;
    }
  }

  const res = await fetch(path, { ...options, headers, credentials: 'include' });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { code: 'unknown', message: res.statusText } }));
    throw new Error(err.error?.message ?? res.statusText);
  }

  return res.json();
}
