'use client';

import { formatVisitDateChip } from '@/lib/bookable-visit-dates';

interface VisitDatePickerProps {
  value: string;
  bookableDates: string[];
  onChange: (date: string) => void;
  invalid?: boolean;
}

export function VisitDatePicker({ value, bookableDates, onChange, invalid }: VisitDatePickerProps) {
  if (!bookableDates.length) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Нет доступных дат для заказа. Проверьте настройки выходных дней бизнес-центра.
      </p>
    );
  }

  return (
    <div
      className="grid grid-cols-3 gap-2 w-full max-w-md"
      role="radiogroup"
      aria-label="Дата визита"
    >
      {bookableDates.map((date) => {
        const chip = formatVisitDateChip(date);
        const selected = value === date;

        return (
          <button
            key={date}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(date)}
            className={[
              'min-w-0 rounded-xl border px-2 py-2.5 sm:px-3 sm:py-3 text-center transition-colors',
              selected
                ? 'border-[var(--status-approved-border)] bg-[var(--status-approved-soft)]'
                : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]',
              invalid && !selected ? 'border-[var(--status-rejected-border)]' : '',
            ].filter(Boolean).join(' ')}
          >
            <div className="text-[10px] sm:text-[11px] uppercase tracking-wide text-[var(--muted)] truncate">
              {chip.month}
            </div>
            <div className="text-2xl sm:text-3xl font-semibold leading-none mt-1 tabular-nums">
              {chip.day}
            </div>
            <div className="text-xs sm:text-sm text-[var(--muted)] mt-1.5 uppercase truncate">
              {chip.weekday}
            </div>
          </button>
        );
      })}
    </div>
  );
}