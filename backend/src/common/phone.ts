/** Russian mobile phone in E.164: +79XXXXXXXXX */
export const RU_MOBILE_PHONE_REGEX = /^\+79\d{9}$/;

export function normalizeRuMobilePhone(input?: string | null): string | null {
  if (!input?.trim()) return null;

  let digits = input.trim().replace(/\D/g, '');
  if (!digits) return null;

  if (digits.length === 11 && digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`;
  } else if (digits.length === 10 && digits.startsWith('9')) {
    digits = `7${digits}`;
  }

  if (digits.length !== 11 || !digits.startsWith('7')) return null;

  const normalized = `+${digits}`;
  return RU_MOBILE_PHONE_REGEX.test(normalized) ? normalized : null;
}

export function isValidRuMobilePhone(input?: string | null): boolean {
  return normalizeRuMobilePhone(input) !== null;
}

export function formatRuMobilePhone(input?: string | null): string {
  const phone = normalizeRuMobilePhone(input);
  if (!phone) return input?.trim() || '';
  const digits = phone.slice(2);
  return `+7 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
}

/** Digits only for SMS Aero API (79001234567). */
export function ruPhoneToSmsNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}