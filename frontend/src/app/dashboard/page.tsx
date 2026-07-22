'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { getHomePath } from '@/lib/permissions';
import { AppVersion } from '@/components/AppVersion';

/** Редирект со старой «Главной» на актуальную стартовую страницу по роли. */
export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(getHomePath(user));
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <div className="animate-pulse text-[var(--muted)]">Загрузка...</div>
      <AppVersion />
    </div>
  );
}