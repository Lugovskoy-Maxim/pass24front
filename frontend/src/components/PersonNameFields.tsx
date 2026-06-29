'use client';

import { PersonNameLabels, PersonNameParts } from '@/lib/person-name';

interface PersonNameFieldsProps {
  value: PersonNameParts;
  labels: PersonNameLabels;
  onChange: (value: PersonNameParts) => void;
  required?: boolean;
  className?: string;
}

export function PersonNameFields({
  value,
  labels,
  onChange,
  required = true,
  className = '',
}: PersonNameFieldsProps) {
  const set = (field: keyof PersonNameParts, next: string) => {
    onChange({ ...value, [field]: next });
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {labels.sectionTitle && (
        <p className="text-sm font-medium text-[var(--text)]">{labels.sectionTitle}</p>
      )}
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="label">{labels.lastName}{required ? ' *' : ''}</label>
          <input
            className="input"
            value={value.lastName}
            onChange={(e) => set('lastName', e.target.value)}
            required={required}
            autoComplete="family-name"
          />
        </div>
        <div>
          <label className="label">{labels.firstName}{required ? ' *' : ''}</label>
          <input
            className="input"
            value={value.firstName}
            onChange={(e) => set('firstName', e.target.value)}
            required={required}
            autoComplete="given-name"
          />
        </div>
        <div>
          <label className="label">{labels.middleName}</label>
          <input
            className="input"
            value={value.middleName}
            onChange={(e) => set('middleName', e.target.value)}
            autoComplete="additional-name"
          />
        </div>
      </div>
    </div>
  );
}