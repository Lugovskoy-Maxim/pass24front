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
  const heading = title || (network ? 'Нет связи с сервером' : 'Не удалось загрузить данные');

  return (
    <div
      className={`card border-red-200 bg-red-50 text-red-900 ${compact ? 'p-3' : 'p-4'} ${className}`}
      role="alert"
    >
      <div className={`flex gap-3 ${onRetry ? 'items-start justify-between' : 'items-start'}`}>
        <div className="flex gap-3 min-w-0">
          <Icon className={`shrink-0 text-red-600 ${compact ? 'w-4 h-4 mt-0.5' : 'w-5 h-5 mt-0.5'}`} />
          <div className="min-w-0">
            <p className={`font-medium text-red-900 ${compact ? 'text-sm' : ''}`}>{heading}</p>
            <p className={`text-red-800 ${compact ? 'text-sm mt-0.5' : 'text-sm mt-1'}`}>{message}</p>
            {status != null && status !== 500 && status < 500 && (
              <p className="text-xs text-red-700/80 mt-1">Если ошибка повторяется — обновите страницу или обратитесь к администратору.</p>
            )}
          </div>
        </div>
        {onRetry && (
          <button type="button" className="btn btn-secondary text-xs shrink-0" onClick={onRetry}>
            <RefreshCw className="w-3.5 h-3.5" />
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}