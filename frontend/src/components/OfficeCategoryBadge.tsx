'use client';
import { OfficeCategory } from '@/lib/office-services';
export function OfficeCategoryBadge({
  category,
}: {
  category?: OfficeCategory | null;
}) {
  if (!category) return null;
  const color = /^#[0-9a-f]{6}$/i.test(category.color)
    ? category.color
    : '#64748b';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2 py-1 text-xs font-semibold bg-[var(--surface)] text-[var(--text)]">
      <span
        className="h-2.5 w-2.5 rounded-full shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {category.name}
    </span>
  );
}
