'use client';

import {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  forwardRef,
  ReactNode,
} from 'react';

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
}: {
  auto?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={['select-wrap', auto ? 'select-wrap--auto' : '', className].filter(Boolean).join(' ')}>
      {children}
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