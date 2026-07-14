'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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
    fullName?: string;
    lastName?: string;
    firstName?: string;
    middleName?: string;
    company: string;
  }) => Promise<{ message: string; verificationChannel: 'email' | 'phone' }>;
  confirmRegistration: (data: {
    email?: string;
    phone?: string;
    code: string;
  }) => Promise<string>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('pass24_token');
    if (!token) { setLoading(false); return; }
    api.me()
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
    };
  };

  const confirmRegistration = async (data: {
    email?: string;
    phone?: string;
    code: string;
  }) => {
    const result = await api.registerConfirm(data);
    return result.message;
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
    <AuthContext.Provider value={{ user, loading, login, requestRegistrationCode, confirmRegistration, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}