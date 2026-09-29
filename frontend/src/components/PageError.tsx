'use client';

import { AlertCircle, RefreshCw, WifiOff } from 'lucide-react';
import { getErrorStatus, isNetworkError } from '@/lib/api-errors';

interface PageErrorProps {
  message: string;
  error?: unknown;
  title?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
  compact?: boolean;
}

export function PageError({
  message,
  error,
  title,
  onRetry,
  retryLabel = 'Повторить',
  className = '',
  compact = false,
}: PageErrorProps) {
  const status = getErrorStatus(error);
  const network = isNetworkError(error);
  const Icon = network ? WifiOff : AlertCircle;
  const heading =
    title || (network ? 'Нет связи с сервером' : 'Не удалось загрузить данные');

  return (
    <div
      className={`card ${compact ? 'p-3' : 'p-4'} ${className}`}
      style={{
        borderColor: 'var(--form-error-border)',
        background: 'var(--form-error-bg)',
        color: 'var(--form-error-text)',
      }}
      role="alert"
    >
      <div
        className={`flex gap-3 ${onRetry ? 'items-start justify-between' : 'items-start'}`}
      >
        <div className="flex gap-3 min-w-0">
          <Icon
            className={`shrink-0 ${compact ? 'w-4 h-4 mt-0.5' : 'w-5 h-5 mt-0.5'}`}
            style={{ color: 'var(--input-error-text)' }}
          />
          <div className="min-w-0">
            <p
              className={`font-medium ${compact ? 'text-sm' : ''}`}
              style={{ color: 'var(--form-error-text)' }}
            >
              {heading}
            </p>
            <p
              className={`${compact ? 'text-sm mt-0.5' : 'text-sm mt-1'}`}
              style={{ color: 'var(--form-error-text)' }}
            >
              {message}
            </p>
            {status != null && status !== 500 && status < 500 && (
              <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                Если ошибка повторяется — обновите страницу или обратитесь к
                администратору.
              </p>
            )}
          </div>
        </div>
        {onRetry && (
          <button
            type="button"
            className="btn btn-secondary text-xs shrink-0"
            onClick={onRetry}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}
