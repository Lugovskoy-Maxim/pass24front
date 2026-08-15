'use client';

/**
 * Глобальная сессия: user + JWT в localStorage (`pass24_token`).
 * При mount — api.me() если токен есть.
 * После login/logout/refreshUser обновляет React state.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { api, User } from './api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (login: string, password: string) => Promise<User>;
  requestRegistrationCode: (data: {
    email?: string;
    phone?: string;
    verificationChannel?: 'email' | 'phone';
    password: string;
    passwordConfirm: string;
    fullName?: string;
    lastName?: string;
    firstName?: string;
    middleName?: string;
    company: string;
  }) => Promise<{
    message: string;
    verificationChannel: 'email' | 'phone';
    retryAfterSeconds?: number;
    registrationId?: string;
  }>;
  confirmRegistration: (data: {
    email?: string;
    phone?: string;
    code: string;
  }) => Promise<{ message: string; user: User }>;
  completeSession: (user: User, token: string) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('pass24_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => localStorage.removeItem('pass24_token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (loginValue: string, password: string) => {
    const { user, token } = await api.login(loginValue, password);
    localStorage.setItem('pass24_token', token);
    setUser(user);
    return user;
  };

  const requestRegistrationCode = async (data: {
    email?: string;
    phone?: string;
    verificationChannel?: 'email' | 'phone';
    password: string;
    passwordConfirm: string;
    fullName?: string;
    lastName?: string;
    firstName?: string;
    middleName?: string;
    company: string;
  }) => {
    const result = await api.registerRequestCode(data);
    return {
      message: result.message,
      verificationChannel: result.verificationChannel,
      retryAfterSeconds: result.retryAfterSeconds,
      registrationId: result.registrationId,
    };
  };

  const confirmRegistration = async (data: {
    email?: string;
    phone?: string;
    code: string;
  }) => {
    const result = await api.registerConfirm(data);
    completeSession(result.user, result.token);
    return { message: result.message, user: result.user };
  };

  const completeSession = (sessionUser: User, token: string) => {
    localStorage.setItem('pass24_token', token);
    setUser(sessionUser);
  };

  const logout = () => {
    localStorage.removeItem('pass24_token');
    setUser(null);
  };

  const refreshUser = async () => {
    const { user: me } = await api.me();
    setUser(me);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        requestRegistrationCode,
        confirmRegistration,
        completeSession,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
