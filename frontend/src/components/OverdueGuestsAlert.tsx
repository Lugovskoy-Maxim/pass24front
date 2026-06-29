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
  compact?: boolean;
  className?: string;
}

export function OverdueGuestsAlert({
  passes,
  labels,
  linkHref = '/control',
  linkLabel,
  compact = false,
  className = '',
}: OverdueGuestsAlertProps) {
  const { message, count } = getOverdueBannerText(passes, labels);
  if (count === 0) return null;

  const actionLabel = linkLabel || labels.reception.sectionActive;

  if (compact) {
    return (
      <Link
        href={linkHref}
        className={[
          'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium',
          'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 transition-colors',
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
        'p-4 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-sm',
        'flex flex-col sm:flex-row sm:items-center gap-2',
        className,
      ].join(' ')}
    >
      <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
      <div className="flex-1">
        <span className="font-semibold">{message}</span>
        <span className="text-amber-800 ml-1">({count})</span>
      </div>
      <Link href={linkHref} className="btn btn-secondary text-xs shrink-0">
        {actionLabel}
      </Link>
    </div>
  );
}