'use client';

import { formatPassNumber } from '@/lib/pass-display';

interface PassNumberProps {
  value?: string | null;
  className?: string;
  /** Крупный вид для билета / печати */
  size?: 'sm' | 'md' | 'lg';
  title?: string;
}

/**
 * Номер пропуска Pass-2026-5326 — всегда в одну строку, mono, без обрезки «…».
 */
export function PassNumber({
  value,
  className = '',
  size = 'md',
  title,
}: PassNumberProps) {
  const display = formatPassNumber(value);
  const sizeClass =
    size === 'lg'
      ? 'pass-number pass-number--lg'
      : size === 'sm'
        ? 'pass-number pass-number--sm'
        : 'pass-number';

  return (
    <span
      className={`${sizeClass} ${className}`.trim()}
      title={title || display}
    >
      {display}
    </span>
  );
}
