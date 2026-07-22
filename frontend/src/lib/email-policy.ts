/**
 * Политика email при регистрации (зеркало backend common/email-policy.ts).
 * blockedDomains приходит из /api/config (админка → Регистрация).
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

export function normalizeBlockedEmailDomains(raw?: string[] | null): string[] {
  if (!raw?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    let d = (item || '').trim().toLowerCase();
    if (!d) continue;
    if (d.startsWith('@')) d = d.slice(1);
    d = d.replace(/^https?:\/\//, '').split('/')[0];
    if (!d.includes('.') || d.includes(' ')) continue;
    if (seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  return out;
}

export function resolveBlockedEmailDomains(raw?: string[] | null): string[] {
  if (raw === undefined || raw === null) {
    return [...DEFAULT_BLOCKED_EMAIL_DOMAINS];
  }
  return normalizeBlockedEmailDomains(raw);
}

export function isAllowedRegistrationEmail(
  email?: string | null,
  options?: {
    blockedDomains?: string[] | null;
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

/** Текст из textarea (по строке) → массив доменов. */
export function parseBlockedDomainsText(text: string): string[] {
  return normalizeBlockedEmailDomains(
    text.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean),
  );
}

export function formatBlockedDomainsText(domains?: string[] | null): string {
  return resolveBlockedEmailDomains(domains).join('\n');
}
