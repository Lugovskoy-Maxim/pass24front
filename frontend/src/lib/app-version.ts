/**
 * Версия UI: v.DDMMYY.
 * Приоритет: значение из админки (config.appVersion) → NEXT_PUBLIC_APP_VERSION / дата сборки.
 */
export const BUILD_APP_VERSION: string =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_APP_VERSION)
    || 'v.000000';

/** @deprecated используйте resolveAppVersion / BUILD_APP_VERSION */
export const APP_VERSION = BUILD_APP_VERSION;

/** Версия для отображения: из настроек сайта или сборка. */
export function resolveAppVersion(configured?: string | null): string {
  const fromAdmin = configured?.trim();
  if (fromAdmin) return fromAdmin.slice(0, 32);
  return BUILD_APP_VERSION;
}
