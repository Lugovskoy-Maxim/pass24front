'use client';
import { OfficeCategory } from '@/lib/office-services';
export function OfficeCategoryBadge({
  category,
  compact = false,
}: {
  category?: OfficeCategory | null;
  compact?: boolean;
}) {
  if (!category) return null;
  const color = /^#[0-9a-f]{6}$/i.test(category.color)
    ? category.color
    : '#64748b';
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 text-xs font-semibold text-[var(--text)] ${compact ? 'py-0.5' : 'py-1'}`}
      style={{ backgroundColor: `${color}18`, borderColor: `${color}60` }}
      title={`Категория офиса: ${category.name}`}
      aria-label={`Категория офиса: ${category.name}`}
    >
      <span
        className="h-2 w-2 rounded-full shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span className="truncate">{category.name}</span>
    </span>
  );
}
