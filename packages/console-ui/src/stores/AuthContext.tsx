import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  jwt: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  acceptInvitation: (token: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

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

  const logout = useCallback(() => {
    setUser(null);
    setJwt(null);
    localStorage.removeItem(JWT_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ user, jwt, isLoading, login, acceptInvitation, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
