'use client';

import { UI_ICON_OPTIONS } from '@/lib/lucide-icons';
import { SelectWrap } from '@/components/FormField';
import { UiIcon } from '@/components/UiIcon';

interface IconPickerFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}

export function IconPickerField({ label, value, onChange, hint }: IconPickerFieldProps) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-3">
        <SelectWrap className="flex-1">
          <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
            {UI_ICON_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        </SelectWrap>
        <span
          className="flex items-center justify-center w-10 h-10 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] shrink-0"
          aria-hidden
        >
          <UiIcon name={value} className="w-5 h-5 text-[var(--muted)]" />
        </span>
      </div>
      {hint && <p className="text-xs text-[var(--muted)] mt-1">{hint}</p>}
    </div>
  );
}