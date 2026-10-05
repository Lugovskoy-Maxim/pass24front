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
    warning: 'text-[var(--status-pending)] bg-[var(--status-pending-soft)]',
    info: 'text-[var(--status-approved)] bg-[var(--status-approved-soft)]',
    success: 'text-[var(--status-active)] bg-[var(--status-active-soft)]',
    danger: 'text-[var(--status-rejected)] bg-[var(--status-rejected-soft)]',
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
