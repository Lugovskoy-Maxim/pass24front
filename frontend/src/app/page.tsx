'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { getHomePath } from '@/lib/permissions';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    // Неавторизованный → /login, иначе home по роли
    router.replace(getHomePath(user));
  }, [user, loading, router]);

  return (
    <div className="app-shell-center flex flex-col items-center justify-center gap-3">
      <div className="animate-pulse text-[var(--muted)]">Загрузка...</div>
    </div>
  );
}
