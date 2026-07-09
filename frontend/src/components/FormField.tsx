'use client';

import {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  forwardRef,
  ReactNode,
  useState,
} from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { UiIcon } from '@/components/UiIcon';
import { useConfig } from '@/hooks/useConfig';
import { resolveBrand } from '@/lib/brand-defaults';

export function getInputClassName(options?: {
  invalid?: boolean;
  auto?: boolean;
  mono?: boolean;
  iconLeft?: boolean;
  readOnly?: boolean;
  className?: string;
}): string {
  return [
    'input',
    options?.invalid ? 'input--invalid' : '',
    options?.auto ? 'input--auto' : '',
    options?.mono ? 'input--mono' : '',
    options?.iconLeft ? 'input--icon-left' : '',
    options?.readOnly ? 'input--readonly' : '',
    options?.className,
  ].filter(Boolean).join(' ');
}

interface FormFieldProps {
  id?: string;
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}

export function FormField({
  id,
  label,
  required,
  error,
  hint,
  className,
  children,
}: FormFieldProps) {
  const errorId = id && error ? `${id}-error` : undefined;
  const hintId = id && hint && !error ? `${id}-hint` : undefined;

  return (
    <div className={['form-field', error ? 'form-field--invalid' : '', className].filter(Boolean).join(' ')}>
      {label && (
        <label className="label" htmlFor={id}>
          {label}
          {required && <span className="label-required" aria-hidden> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={errorId} className="form-field__error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="form-field__hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type FormControlProps = {
  invalid?: boolean;
  inputAuto?: boolean;
  mono?: boolean;
  iconLeft?: boolean;
  className?: string;
};

export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & FormControlProps
>(function PasswordInput(
  { invalid, inputAuto, mono, iconLeft, className, readOnly, disabled, ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-field">
      <FormInput
        ref={ref}
        type={visible ? 'text' : 'password'}
        invalid={invalid}
        inputAuto={inputAuto}
        mono={mono}
        iconLeft={iconLeft}
        className={['password-field__input', className].filter(Boolean).join(' ')}
        readOnly={readOnly}
        disabled={disabled}
        {...props}
      />
      <button
        type="button"
        className="password-field__toggle"
        tabIndex={-1}
        aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
        aria-pressed={visible}
        disabled={disabled || readOnly}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
});

export const FormInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & FormControlProps
>(function FormInput(
  { invalid, inputAuto, mono, iconLeft, className, readOnly, disabled, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      readOnly={readOnly}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      className={getInputClassName({ invalid, auto: inputAuto, mono, iconLeft, readOnly: readOnly || disabled, className })}
      {...props}
    />
  );
});

export const FormSelect = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & FormControlProps
>(function FormSelect(
  { invalid, inputAuto, className, disabled, children, ...props },
  ref,
) {
  return (
    <SelectWrap auto={inputAuto}>
      <select
        ref={ref}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={getInputClassName({ invalid, auto: inputAuto, readOnly: disabled, className })}
        {...props}
      >
        {children}
      </select>
    </SelectWrap>
  );
});

export const FormTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & FormControlProps
>(function FormTextarea({ invalid, className, readOnly, disabled, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      readOnly={readOnly}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      className={getInputClassName({ invalid, readOnly: readOnly || disabled, className: ['input--textarea', className].filter(Boolean).join(' ') })}
      {...props}
    />
  );
});

export function SelectWrap({
  auto,
  className,
  children,
  iconName,
}: {
  auto?: boolean;
  className?: string;
  children: ReactNode;
  iconName?: string | null;
}) {
  const config = useConfig();
  const brand = resolveBrand(config);
  const chevron = iconName ?? brand.uiIconSelectChevron;

  return (
    <div className={['select-wrap', auto ? 'select-wrap--auto' : '', className].filter(Boolean).join(' ')}>
      {children}
      <span className="select-wrap__icon" aria-hidden>
        <UiIcon name={chevron} className="w-4 h-4 text-[var(--muted)]" />
      </span>
    </div>
  );
}

export function FormErrorBanner({ message, className = '' }: { message?: string; className?: string }) {
  if (!message) return null;
  return (
    <div className={['form-error-banner', className].filter(Boolean).join(' ')} role="alert">
      {message}
    </div>
  );
}