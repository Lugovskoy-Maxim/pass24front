import { bookingStatusTone } from '@/lib/booking-status';

export function OperationsStatusBadge({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  const tone =
    status === 'new'
      ? 'warning'
      : status === 'in_progress'
        ? 'info'
        : status === 'completed'
          ? 'success'
          : bookingStatusTone(status);
  const colors = {
    warning: 'text-[var(--warning)] bg-[var(--toast-warning-bg)]',
    info: 'text-[var(--primary)] bg-[var(--toast-info-bg)]',
    success: 'text-[var(--success)] bg-[var(--toast-success-bg)]',
    danger: 'text-[var(--danger)] bg-[var(--toast-error-bg)]',
    muted: 'text-[var(--muted)] bg-[var(--surface-muted)]',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border border-current/30 px-2 py-0.5 text-xs font-medium whitespace-nowrap ${colors[tone]}`}
    >
      {label}
    </span>
  );
}
