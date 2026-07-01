'use client';

import { PersonNameLabels, PersonNameParts } from '@/lib/person-name';
import { FieldErrors } from '@/lib/form-validation';
import { FormField, FormInput } from './FormField';

interface PersonNameFieldsProps {
  value: PersonNameParts;
  labels: PersonNameLabels;
  onChange: (value: PersonNameParts) => void;
  required?: boolean;
  className?: string;
  errors?: FieldErrors;
  onClearError?: (field: 'lastName' | 'firstName' | 'middleName') => void;
}

export function PersonNameFields({
  value,
  labels,
  onChange,
  required = true,
  className = '',
  errors,
  onClearError,
}: PersonNameFieldsProps) {
  const set = (field: keyof PersonNameParts, next: string) => {
    onChange({ ...value, [field]: next });
    onClearError?.(field);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {labels.sectionTitle && (
        <p className="text-sm font-medium text-[var(--text)]">{labels.sectionTitle}</p>
      )}
      <div className="person-name-fields__grid form-grid-3">
        <FormField id="person-lastName" label={labels.lastName} required={required} error={errors?.lastName}>
          <FormInput
            id="person-lastName"
            value={value.lastName}
            onChange={(e) => set('lastName', e.target.value)}
            invalid={!!errors?.lastName}
            autoComplete="family-name"
          />
        </FormField>
        <FormField id="person-firstName" label={labels.firstName} required={required} error={errors?.firstName}>
          <FormInput
            id="person-firstName"
            value={value.firstName}
            onChange={(e) => set('firstName', e.target.value)}
            invalid={!!errors?.firstName}
            autoComplete="given-name"
          />
        </FormField>
        <FormField id="person-middleName" label={labels.middleName}>
          <FormInput
            id="person-middleName"
            value={value.middleName}
            onChange={(e) => set('middleName', e.target.value)}
            autoComplete="additional-name"
          />
        </FormField>
      </div>
    </div>
  );
}