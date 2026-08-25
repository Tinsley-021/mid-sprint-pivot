import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiRequest, ApiError } from './api.js';

export interface AuthUser {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: string;
  emailVerified: boolean;
}

export interface Session {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  register: (input: { organizationName: string; name: string; email: string; password: string }) => Promise<void>;
  login: (input: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, password: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  verifyEmail: (token: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  listSessions: () => Promise<Session[]>;
  revokeSession: (id: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  // On load, try to turn the httpOnly refresh cookie (if any) into a live access
  // token — this is what makes "stay logged in across a page reload" work without
  // ever putting a long-lived token in localStorage where an XSS bug could read it.
  useEffect(() => {
    apiRequest<{ user: AuthUser; accessToken: string }>('/api/auth/refresh', { method: 'POST' })
      .then((res) => {
        setUser(res.user);
        setAccessToken(res.accessToken);
        setStatus('authenticated');
      })
      .catch(() => setStatus('unauthenticated'));
  }, []);

  const register = useCallback(
    async (input: { organizationName: string; name: string; email: string; password: string }) => {
      const res = await apiRequest<{ user: AuthUser; accessToken: string }>('/api/auth/register', {
        method: 'POST',
        body: input,
      });
      setUser(res.user);
      setAccessToken(res.accessToken);
      setStatus('authenticated');
    },
    [],
  );

  const login = useCallback(async (input: { email: string; password: string }) => {
    const res = await apiRequest<{ user: AuthUser; accessToken: string }>('/api/auth/login', {
      method: 'POST',
      body: input,
    });
    setUser(res.user);
    setAccessToken(res.accessToken);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
    setAccessToken(null);
    setStatus('unauthenticated');
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    await apiRequest('/api/auth/forgot-password', { method: 'POST', body: { email } });
  }, []);

  const resetPassword = useCallback(async (token: string, password: string) => {
    await apiRequest('/api/auth/reset-password', { method: 'POST', body: { token, password } });
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        accessToken,
        body: { currentPassword, newPassword },
      });
    },
    [accessToken],
  );

  const verifyEmail = useCallback(async (token: string) => {
    await apiRequest('/api/auth/verify-email', { method: 'POST', body: { token } });
    setUser((u) => (u ? { ...u, emailVerified: true } : u));
  }, []);

  const resendVerification = useCallback(async () => {
    await apiRequest('/api/auth/resend-verification', { method: 'POST', accessToken });
  }, [accessToken]);

  const listSessions = useCallback(async () => {
    const res = await apiRequest<{ sessions: Session[] }>('/api/auth/sessions', { accessToken });
    return res.sessions;
  }, [accessToken]);

  const revokeSession = useCallback(
    async (id: string) => {
      await apiRequest(`/api/auth/sessions/${id}`, { method: 'DELETE', accessToken });
    },
    [accessToken],
  );

  const value = useMemo(
    () => ({
      user,
      accessToken,
      status,
      register,
      login,
      logout,
      forgotPassword,
      resetPassword,
      changePassword,
      verifyEmail,
      resendVerification,
      listSessions,
      revokeSession,
    }),
    [
      user,
      accessToken,
      status,
      register,
      login,
      logout,
      forgotPassword,
      resetPassword,
      changePassword,
      verifyEmail,
      resendVerification,
      listSessions,
      revokeSession,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { ApiError };
