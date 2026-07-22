'use client';

import { APP_VERSION } from '@/lib/app-version';

/**
 * Маленькая метка версии (v.DDMMYY) — footer защищённых страниц и login.
 */
export function AppVersion({ className = '' }: { className?: string }) {
  return (
    <div
      className={`app-version text-center select-none ${className}`.trim()}
      title={`Версия приложения ${APP_VERSION}`}
      aria-label={`Версия ${APP_VERSION}`}
    >
      {APP_VERSION}
    </div>
  );
}
