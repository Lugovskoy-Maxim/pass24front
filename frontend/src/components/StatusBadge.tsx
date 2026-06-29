import { PassStatus } from '@/lib/api';
import { getStatusLabel, mergeUiLabels, UiLabels } from '@/lib/ui-labels';

const STYLES: Record<PassStatus, string> = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-[var(--accent-soft)] text-[#b85a14] border-[var(--accent-border)]',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  active: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  completed: 'bg-[var(--surface-muted)] text-[var(--muted)] border-[var(--border)]',
  expired: 'bg-[var(--surface-muted)] text-[var(--muted)] border-[var(--border)]',
  cancelled: 'bg-[var(--surface-muted)] text-[var(--muted)] border-[var(--border)]',
};

export function StatusBadge({ status, labels }: { status: PassStatus; labels?: UiLabels }) {
  const L = labels || mergeUiLabels();
  return (
    <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full border ${STYLES[status]}`}>
      {getStatusLabel(status, L)}
    </span>
  );
}