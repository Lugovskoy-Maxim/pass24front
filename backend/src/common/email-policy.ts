/**
 * Политика email при регистрации арендаторов.
 * - Только зоны .ru / .рф / .su (если requireRuZone = true)
 * - Домены из blockedDomains запрещены (редактируется в админке)
 */

export const DEFAULT_BLOCKED_EMAIL_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'yahoo.com',
  'ymail.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
  'gmx.com',
  'mail.com',
  'zoho.com',
] as const;

export const REGISTRATION_EMAIL_POLICY_MESSAGE =
  'Для регистрации используйте корпоративную почту в зоне .ru (например name@company.ru). Адреса из списка запрещённых доменов (Gmail, Outlook, iCloud и др.) не принимаются.';

/** Нормализация списка доменов: lowercase, без @, без пробелов, уникальные. */
export function normalizeBlockedEmailDomains(raw?: string[] | null): string[] {
  if (!raw?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    let d = (item || '').trim().toLowerCase();
    if (!d) continue;
    if (d.startsWith('@')) d = d.slice(1);
    d = d.replace(/^https?:\/\//, '').split('/')[0];
    // только домен-подобная строка
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(d)
      && !/^[а-яё0-9]([а-яё0-9-]*[а-яё0-9])?(\.[а-яё0-9]([а-яё0-9-]*[а-яё0-9])?)+$/i.test(d)) {
      // допуск простых лат/кир доменов; иначе пропуск мусора
      if (!d.includes('.') || d.includes(' ')) continue;
    }
    if (seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  return out;
}

export function resolveBlockedEmailDomains(raw?: string[] | null): string[] {
  // null/undefined — дефолты; [] — админ очистил список
  if (raw === undefined || raw === null) {
    return [...DEFAULT_BLOCKED_EMAIL_DOMAINS];
  }
  return normalizeBlockedEmailDomains(raw);
}

export function isAllowedRegistrationEmail(
  email?: string | null,
  options?: {
    blockedDomains?: string[] | null;
    /** По умолчанию true: только .ru / .рф / .su */
    requireRuZone?: boolean;
  },
): boolean {
  const normalized = (email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return false;

  const domain = normalized.split('@')[1] || '';
  if (!domain || domain.includes('..') || domain.startsWith('.') || domain.endsWith('.')) {
    return false;
  }

  const blocked = new Set(resolveBlockedEmailDomains(options?.blockedDomains));
  if (blocked.has(domain)) return false;

  const requireRu = options?.requireRuZone !== false;
  if (requireRu) {
    return domain.endsWith('.ru') || domain.endsWith('.рф') || domain.endsWith('.su');
  }
  return true;
}
