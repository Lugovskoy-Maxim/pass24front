'use client';

import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { Pass } from '@/lib/api';
import { getOverdueBannerText, UiLabels } from '@/lib/ui-labels';

interface OverdueGuestsAlertProps {
  passes: Pass[];
  labels: UiLabels;
  linkHref?: string;
  linkLabel?: string;
  onActionClick?: () => void;
  compact?: boolean;
  className?: string;
}

export function OverdueGuestsAlert({
  passes,
  labels,
  linkHref = '/control',
  linkLabel,
  onActionClick,
  compact = false,
  className = '',
}: OverdueGuestsAlertProps) {
  const { message, count } = getOverdueBannerText(passes, labels);
  if (count === 0) return null;

  const actionLabel = linkLabel || labels.reception.sectionOverdue;

  if (compact) {
    return (
      <Link
        href={linkHref}
        className={[
          'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium',
          'theme-alert border hover:opacity-90 transition-opacity',
          className,
        ].join(' ')}
      >
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{count}</span>
      </Link>
    );
  }

  return (
    <div
      className={[
        'p-4 rounded-lg border theme-alert text-sm',
        'flex flex-col sm:flex-row sm:items-center gap-2',
        className,
      ].join(' ')}
    >
      <AlertCircle className="w-5 h-5 shrink-0 opacity-80" />
      <div className="flex-1">
        <span className="font-semibold">{message}</span>
        <span className="opacity-80 ml-1">({count})</span>
      </div>
      {onActionClick ? (
        <button type="button" onClick={onActionClick} className="btn btn-secondary text-xs shrink-0">
          {actionLabel}
        </button>
      ) : (
        <Link href={linkHref} className="btn btn-secondary text-xs shrink-0">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}