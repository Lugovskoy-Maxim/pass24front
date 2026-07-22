/**
 * Версия UI: v.DDMMYY (дата сборки без точек).
 * Переопределение: NEXT_PUBLIC_APP_VERSION=v.220726
 * В next.config.ts подставляется дата build, если env не задан.
 */
export const APP_VERSION: string =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_APP_VERSION)
    || 'v.000000';
