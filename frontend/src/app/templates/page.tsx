'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { AppVersion } from '@/components/AppVersion';

/** LEGACY URL → заказ пропуска (или login). */
export default function TemplatesPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login?next=/passes/new');
      return;
    }
    router.replace('/passes/new');
  }, [router, user, loading]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <div className="animate-pulse text-[var(--muted)]">Перенаправление…</div>
      <AppVersion />
    </div>
  );
}