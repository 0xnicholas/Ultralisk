// Minimal JWT payload decoder. Does NOT verify signature — only reads
// the `exp` claim to decide whether the token is still usable. Signature
// verification always happens server-side; the client only needs expiry.

interface JwtPayload {
  sub?: string;
  org_id?: string;
  role?: string;
  exp?: number;
  iat?: number;
  iss?: string;
}

function b64urlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  // atob is available in browsers and modern Node; this util only runs in
  // the UI bundle so the node fallback isn't needed.
  return atob(padded + pad);
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = b64urlDecode(parts[1]);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function jwtExpiry(token: string): number | null {
  const payload = decodeJwtPayload(token);
  return typeof payload?.exp === 'number' ? payload.exp : null;
}

export function isJwtExpired(token: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
  const exp = jwtExpiry(token);
  return exp === null ? true : exp <= nowSec;
}