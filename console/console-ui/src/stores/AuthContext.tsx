import { createContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { User } from '@/types';
import { AUTH_EXPIRED_EVENT } from '@/api/client';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [jwt, setJwt] = useState<string | null>(() => localStorage.getItem(JWT_KEY));
  const [isLoading, setIsLoading] = useState(false);

  const logout = useCallback(() => {
    setUser(null);
    setJwt(null);
    localStorage.removeItem(JWT_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  // apiFetch dispatches AUTH_EXPIRED_EVENT on any 401 (except login).
  // Clear local state so AuthGuard redirects to /login.
  useEffect(() => {
    const handler = () => logout();
    window.addEventListener(AUTH_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
  }, [logout]);

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
