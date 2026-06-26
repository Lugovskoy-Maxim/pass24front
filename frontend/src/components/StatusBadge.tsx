import { PassStatus } from '@/lib/api';
import { getStatusLabel, mergeUiLabels, UiLabels } from '@/lib/ui-labels';

const STYLES: Record<PassStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-blue-50 text-blue-700 border-blue-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed: 'bg-slate-50 text-slate-600 border-slate-200',
  expired: 'bg-gray-50 text-gray-500 border-gray-200',
  cancelled: 'bg-gray-50 text-gray-500 border-gray-200',
};

export function StatusBadge({ status, labels }: { status: PassStatus; labels?: UiLabels }) {
  const L = labels || mergeUiLabels();
  return (
    <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full border ${STYLES[status]}`}>
      {getStatusLabel(status, L)}
    </span>
  );
}