import { PassStatus } from '@/lib/api';
import { getPassStatusBadgeClass } from '@/lib/pass-status';
import { getOverdueBadgeLabel, getStatusLabel, mergeUiLabels, UiLabels } from '@/lib/ui-labels';
import type { GuestOverdueKind } from '@/lib/pass-overdue';

type BadgeSize = 'sm' | 'md';

function badgeSizeClass(size: BadgeSize): string {
  return size === 'sm' ? 'pass-badge--sm' : '';
}

interface StatusBadgeProps {
  status: PassStatus;
  labels?: UiLabels;
  size?: BadgeSize;
  /** При просрочке — статус + отдельный бейдж просрочки */
  overdueKind?: GuestOverdueKind | null;
}

export function StatusBadge({ status, labels, size = 'md', overdueKind }: StatusBadgeProps) {
  const L = labels || mergeUiLabels();
  const badge = (
    <span className={[getPassStatusBadgeClass(status), badgeSizeClass(size)].filter(Boolean).join(' ')}>
      <span className="pass-badge__dot" aria-hidden />
      {getStatusLabel(status, L)}
    </span>
  );

  if (!overdueKind) return badge;

  return (
    <span className="pass-badge-group">
      {badge}
      <OverdueBadge kind={overdueKind} labels={L} size={size} />
    </span>
  );
}

interface OverdueBadgeProps {
  kind: GuestOverdueKind;
  labels?: UiLabels;
  size?: BadgeSize;
}

export function OverdueBadge({ kind, labels, size = 'md' }: OverdueBadgeProps) {
  const L = labels || mergeUiLabels();
  return (
    <span className={['pass-badge pass-badge--overdue', badgeSizeClass(size)].filter(Boolean).join(' ')}>
      <span className="pass-badge__dot pass-badge__dot--pulse" aria-hidden />
      {getOverdueBadgeLabel(kind, L)}
    </span>
  );
}