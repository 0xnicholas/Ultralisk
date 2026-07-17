import { createContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { User } from '@/types';
import { AUTH_EXPIRED_EVENT } from '@/api/client';
import { isJwtExpired, jwtExpiry } from '@/utils/jwt';

interface AuthState {
  user: User | null;
  jwt: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  acceptInvitation: (token: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);
export { AuthContext };

const JWT_KEY = 'ultralisk_jwt';
const USER_KEY = 'ultralisk_user';
const PROACTIVE_LOGOUT_LEEWAY_SEC = 30;

export function AuthProvider({ children }: { children: ReactNode }) {
  // On mount, drop the stored session if the JWT is already expired.
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      const jwt = localStorage.getItem(JWT_KEY);
      if (!stored || !jwt || isJwtExpired(jwt)) {
        // Expired or malformed -> wipe so AuthGuard sends the user to /login.
        localStorage.removeItem(JWT_KEY);
        localStorage.removeItem(USER_KEY);
        return null;
      }
      return JSON.parse(stored);
    } catch {
      return null;
    }
  });
  const [jwt, setJwt] = useState<string | null>(() => {
    const v = localStorage.getItem(JWT_KEY);
    if (v && !isJwtExpired(v)) return v;
    localStorage.removeItem(JWT_KEY);
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);

  const logout = useCallback(() => {
    setUser(null);
    setJwt(null);
    localStorage.removeItem(JWT_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  // 401 from apiFetch -> logout (AuthGuard will redirect to /login).
  useEffect(() => {
    const handler = () => logout();
    window.addEventListener(AUTH_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
  }, [logout]);

  // Schedule a proactive logout for `exp - leeway` so the user is
  // redirected before the very first API call returns 401. Cancelled
  // and re-armed on every saveAuth() and on jwt change.
  useEffect(() => {
    if (!jwt) return;
    const exp = jwtExpiry(jwt);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (exp === null) { logout(); return; }
    const ms = (exp - PROACTIVE_LOGOUT_LEEWAY_SEC) * 1000 - Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ms <= 0) { logout(); return; }
    const timer = setTimeout(() => logout(), ms);
    return () => clearTimeout(timer);
  }, [jwt, logout]);

  // On first mount with a valid stored token, validate it server-side.
  // getMe() returns the fresh user record (role / displayName may have
  // changed) when the token is still good. On 401/404 (user deactivated
  // or token revoked), we proactively log out so AuthGuard sends the
  // user to /login on first render rather than after a random API call.
  // Other errors (network down, 5xx) are left alone — the user can
  // continue with the cached state until something explicitly fails.
  useEffect(() => {
    if (!jwt) return;
    let cancelled = false;
    (async () => {
      try {
        const { getMe } = await import('@/api/auth');
        const { data } = await getMe();
        if (!cancelled && data) setUser(data);
      } catch (err) {
        const status = (err as { status?: number })?.status;
        if (status === 401 || status === 404) logout();
      }
    })();
    return () => { cancelled = true; };
  }, [jwt, logout]);

  const saveAuth = useCallback((user: User, jwt: string) => {
    setUser(user);
    setJwt(jwt);
    localStorage.setItem(JWT_KEY, jwt);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const { login: apiLogin } = await import('@/api/auth');
      const { data } = await apiLogin(email, password);
      saveAuth(data.user, data.jwt);
    } finally {
      setIsLoading(false);
    }
  }, [saveAuth]);

  const acceptInvitation = useCallback(async (token: string, password: string) => {
    setIsLoading(true);
    try {
      const { acceptInvitation: apiAccept } = await import('@/api/auth');
      const { data } = await apiAccept(token, password);
      saveAuth(data.user, data.jwt);
    } finally {
      setIsLoading(false);
    }
  }, [saveAuth]);

  return (
    <AuthContext.Provider value={{ user, jwt, isLoading, login, acceptInvitation, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
