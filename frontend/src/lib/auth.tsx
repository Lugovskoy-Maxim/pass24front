'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, User } from './api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  requestRegistrationCode: (data: {
    email: string;
    password: string;
    fullName?: string;
    lastName?: string;
    firstName?: string;
    middleName?: string;
    phone?: string;
    company: string;
  }) => Promise<string>;
  confirmRegistration: (email: string, code: string) => Promise<string>;
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

  const login = async (email: string, password: string) => {
    const { user, token } = await api.login(email, password);
    localStorage.setItem('pass24_token', token);
    setUser(user);
    return user;
  };

  const requestRegistrationCode = async (data: {
    email: string;
    password: string;
    fullName?: string;
    lastName?: string;
    firstName?: string;
    middleName?: string;
    phone?: string;
    company: string;
  }) => {
    const result = await api.registerRequestCode(data);
    return result.message;
  };

  const confirmRegistration = async (email: string, code: string) => {
    const result = await api.registerConfirm(email, code);
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