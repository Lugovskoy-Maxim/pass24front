'use client';

import { useConfig } from '@/hooks/useConfig';
import { resolveAppVersion } from '@/lib/app-version';

/**
 * Маленькая метка версии — footer страниц.
 * Значение из админки (Базовые настройки → Версия сайта), иначе дата сборки.
 */
export function AppVersion({ className = '' }: { className?: string }) {
  const config = useConfig();
  const version = resolveAppVersion(config?.appVersion);

  return (
    <div
      className={`app-version text-center select-none ${className}`.trim()}
      title={`Версия сайта ${version}`}
      aria-label={`Версия ${version}`}
    >
      {version}
    </div>
  );
}
