/**
 * Политика email при регистрации арендаторов.
 * Разрешены только зоны .ru / .рф / .su (корпоративная и российская почта).
 * Gmail, Outlook, iCloud и прочие зарубежные free-mail — запрещены.
 */

const BLOCKED_FREE_MAIL_DOMAINS = new Set([
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
]);

export const REGISTRATION_EMAIL_POLICY_MESSAGE =
  'Для регистрации используйте корпоративную почту в зоне .ru (например name@company.ru). Gmail, Outlook, iCloud и другие зарубежные почты не принимаются.';

export function isAllowedRegistrationEmail(email?: string | null): boolean {
  const normalized = (email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return false;

  const domain = normalized.split('@')[1] || '';
  if (!domain || domain.includes('..') || domain.startsWith('.') || domain.endsWith('.')) {
    return false;
  }

  if (BLOCKED_FREE_MAIL_DOMAINS.has(domain)) return false;

  return domain.endsWith('.ru') || domain.endsWith('.рф') || domain.endsWith('.su');
}
