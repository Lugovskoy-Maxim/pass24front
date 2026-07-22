'use client';

/**
 * Обёртка защищённых страниц: ждёт auth, редирект на /login,
 * проверяет permissions. Рендерит Header + MobileNav + версию.
 *
 * Важно: дочерние страницы НЕ должны делать `if (!user) return null`
 * до рендера ProtectedLayout — иначе редирект не сработает.
 */
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { PendingApprovalBanner } from './PendingApprovalBanner';
import { AppVersion } from './AppVersion';
import { UserRole } from '@/lib/api';
import { getHomePath, hasAllPermissions, hasAnyPermission } from '@/lib/permissions';

interface ProtectedLayoutProps {
  children: React.ReactNode;
  roles?: UserRole[];
  permissions?: string[];
  anyPermissions?: string[];
}

function loginRedirectUrl(pathname: string | null, search = ''): string {
  if (!pathname || pathname === '/' || pathname.startsWith('/login') || pathname.startsWith('/invite')) {
    return '/login';
  }
  const target = `${pathname}${search || ''}`;
  const qs = new URLSearchParams({ next: target });
  return `/login?${qs.toString()}`;
}

export function ProtectedLayout({ children, roles, permissions, anyPermissions }: ProtectedLayoutProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const roleDenied = !!roles && !!user && !roles.includes(user.role);
  const permDenied = !!permissions?.length && !hasAllPermissions(user, ...permissions);
  const anyPermDenied = !!anyPermissions?.length && !hasAnyPermission(user, ...anyPermissions);
  const denied = roleDenied || permDenied || anyPermDenied;

  // Неавторизован → сразу на login (с next= для возврата после входа)
  useEffect(() => {
    if (loading) return;
    if (!user) {
      const search = typeof window !== 'undefined' ? window.location.search : '';
      router.replace(loginRedirectUrl(pathname, search));
    }
  }, [user, loading, router, pathname]);

  // Авторизован, но нет прав → домашняя страница роли
  useEffect(() => {
    if (loading || !user || !denied) return;
    router.replace(getHomePath(user));
  }, [user, loading, denied, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <div className="animate-pulse text-[var(--muted)]">Загрузка...</div>
        <AppVersion />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <div className="animate-pulse text-[var(--muted)]">Переход на страницу входа…</div>
        <AppVersion />
      </div>
    );
  }

  if (denied) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <div className="animate-pulse text-[var(--muted)]">Нет доступа, перенаправление…</div>
        <AppVersion />
      </div>
    );
  }

  return (
    <>
      <Header />
      <main className="app-main max-w-6xl mx-auto px-4 py-6">
        <PendingApprovalBanner user={user} />
        {children}
        <AppVersion className="mt-10 mb-2 pb-[env(safe-area-inset-bottom,0px)]" />
      </main>
      <MobileNav />
    </>
  );
}
