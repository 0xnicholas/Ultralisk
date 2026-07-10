const JWT_KEY = 'ultralisk_jwt';

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const jwt = localStorage.getItem(JWT_KEY);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`;

  const res = await fetch(path, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { code: 'unknown', message: res.statusText } }));
    throw new Error(err.error?.message ?? res.statusText);
  }

  return res.json();
}
