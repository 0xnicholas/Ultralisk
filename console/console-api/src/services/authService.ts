const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3101';

export async function login(email: string, password: string) {
  const res = await fetch(`${AUTH_SERVICE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let detail = 'Login failed';
    try {
      const parsed = JSON.parse(text);
      detail = parsed.error || parsed.message || detail;
    } catch { /* ignore */ }
    throw Object.assign(new Error(detail), { status: res.status });
  }
  return res.json();
}

export function isAuthServiceConfigured(): boolean {
  return Boolean(process.env.AUTH_SERVICE_URL) || true;
}

export async function pingAuthService(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 800);
    const res = await fetch(`${AUTH_SERVICE_URL}/health`, { signal: ctrl.signal }).catch(() => null);
    clearTimeout(timer);
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}
