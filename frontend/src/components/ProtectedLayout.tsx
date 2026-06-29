'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from './Header';
import { UserRole } from '@/lib/api';
import { hasAllPermissions, hasAnyPermission } from '@/lib/permissions';

interface ProtectedLayoutProps {
  children: React.ReactNode;
  roles?: UserRole[];
  permissions?: string[];
  anyPermissions?: string[];
}

export function ProtectedLayout({ children, roles, permissions, anyPermissions }: ProtectedLayoutProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const roleDenied = !!roles && !!user && !roles.includes(user.role);
  const permDenied = !!permissions?.length && !hasAllPermissions(user, ...permissions);
  const anyPermDenied = !!anyPermissions?.length && !hasAnyPermission(user, ...anyPermissions);
  const denied = roleDenied || permDenied || anyPermDenied;

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!loading && user && denied) router.replace('/dashboard');
  }, [user, loading, denied, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-[var(--muted)]">Загрузка...</div>
      </div>
    );
  }

  if (!user) return null;

  if (denied) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[var(--muted)]">Нет доступа к этой странице</div>
      </div>
    );
  }

  return (
    <>
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </>
  );
}