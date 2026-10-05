'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';
import { useWorkQueue } from '@/hooks/useWorkQueue';
import { useAuth } from '@/lib/auth';

export function WorkQueueBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="inline-flex min-w-5 h-5 px-1.5 items-center justify-center rounded-full bg-[var(--danger)] text-[var(--on-accent)] text-xs font-bold tabular-nums">
      {count > 99 ? '99+' : count}
    </span>
  );
}
export function WorkQueueIndicator() {
  const { user } = useAuth();
  const { counts, stale } = useWorkQueue();
  const pathname = usePathname();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (detailsRef.current) detailsRef.current.open = false;
  }, [pathname]);
  useEffect(() => {
    const dismiss = (event: PointerEvent | FocusEvent) => {
      const details = detailsRef.current;
      if (details?.open && !details.contains(event.target as Node)) {
        details.open = false;
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && detailsRef.current?.open) {
        detailsRef.current.open = false;
        detailsRef.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', dismiss);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('focusin', dismiss);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);
  if (!user?.permissions?.includes('admin.panel')) return null;
  const canBook = user.permissions.includes('bookings.manage');
  const canSupport = user.permissions.includes('support.manage');
  if (!canBook && !canSupport) return null;
  return (
    <details ref={detailsRef} className="relative">
      <summary
        className="app-header__control app-header__queue list-none"
        aria-label={`Требуют внимания: ${counts?.total ?? 0}`}
        title="Требуют внимания"
      >
        <Bell className="w-5 h-5" aria-hidden="true" />
        <WorkQueueBadge count={counts?.total || 0} />
      </summary>
      <div className="app-header__queue-panel fixed right-4 top-16 mt-2 w-[min(18rem,calc(100vw-2rem))] sm:absolute sm:right-0 sm:top-auto card p-3 shadow-lg z-50 text-[var(--text)]">
        <p className="font-semibold text-sm mb-2">Требуют внимания</p>
        {canBook && (
          <Link
            className="flex items-center justify-between gap-2 p-2 rounded hover:bg-[var(--surface-muted)]"
            href="/admin/booking-requests?tab=pending"
          >
            Бронирования
            <WorkQueueBadge count={counts?.bookings || 0} />
          </Link>
        )}
        {canSupport && (
          <Link
            className="flex items-center justify-between gap-2 p-2 rounded hover:bg-[var(--surface-muted)]"
            href="/admin/service-requests?needs_action=1"
          >
            Сервисные заявки
            <WorkQueueBadge count={counts?.support || 0} />
          </Link>
        )}
        {stale && (
          <p className="text-xs text-[var(--muted)] mt-2">
            Не удалось обновить. Показаны последние полученные данные.
          </p>
        )}
      </div>
    </details>
  );
}
