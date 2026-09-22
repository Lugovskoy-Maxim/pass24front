'use client';
import Link from 'next/link';
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
  if (!user?.permissions?.includes('admin.panel')) return null;
  const canBook = user.permissions.includes('bookings.manage');
  const canSupport = user.permissions.includes('support.manage');
  if (!canBook && !canSupport) return null;
  return (
    <details className="relative">
      <summary
        className="cursor-pointer list-none flex items-center gap-1.5 p-2 rounded hover:bg-[var(--surface-muted)]"
        aria-label={`Требуют внимания: ${counts?.total ?? 0}`}
      >
        <Bell className="w-5 h-5" />
        <WorkQueueBadge count={counts?.total || 0} />
      </summary>
      <div className="absolute right-0 mt-2 w-72 card p-3 shadow-lg z-50 text-[var(--text)]">
        <p className="font-semibold text-sm mb-2">Требуют внимания</p>
        {canBook && (
          <Link
            className="flex items-center justify-between gap-2 p-2 rounded hover:bg-[var(--surface-muted)]"
            href="/admin/booking-requests?tab=pending"
          >
            Заявки
            <WorkQueueBadge count={counts?.bookings || 0} />
          </Link>
        )}
        {canSupport && (
          <Link
            className="flex items-center justify-between gap-2 p-2 rounded hover:bg-[var(--surface-muted)]"
            href="/admin/service-requests?needs_action=1"
          >
            Обращения в сервисную службу
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
