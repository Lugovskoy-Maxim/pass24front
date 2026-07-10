'use client';

import { formatVisitDateChip } from '@/lib/bookable-visit-dates';
import { getLocalDateString } from '@/lib/local-date';

interface VisitDatePickerProps {
  value: string;
  bookableDates: string[];
  onChange: (date: string) => void;
  invalid?: boolean;
}

export function VisitDatePicker({ value, bookableDates, onChange, invalid }: VisitDatePickerProps) {
  const today = getLocalDateString();

  if (!bookableDates.length) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Нет доступных дат для заказа. Проверьте настройки выходных дней бизнес-центра.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 max-w-sm" role="radiogroup" aria-label="Дата визита">
      {bookableDates.map((date) => {
        const chip = formatVisitDateChip(date, bookableDates, today);
        const selected = value === date;

        return (
          <button
            key={date}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(date)}
            className={[
              'rounded-xl border p-4 text-left transition-colors',
              selected
                ? 'border-[var(--status-approved-border)] bg-[var(--status-approved-soft)]'
                : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]',
              invalid && !selected ? 'border-[var(--status-rejected-border)]' : '',
            ].filter(Boolean).join(' ')}
          >
            <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{chip.month}</div>
            <div className="text-3xl font-semibold leading-none mt-1 tabular-nums">{chip.day}</div>
            <div className="text-sm text-[var(--muted)] mt-2">{chip.caption}</div>
          </button>
        );
      })}
    </div>
  );
}