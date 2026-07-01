import { PASS_TYPE_LABELS } from '../access/access.constants';

export function deriveVisitPurpose(passType: string): string {
  return PASS_TYPE_LABELS[passType] || passType;
}

export function normalizePhone(phone?: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function normalizePersonName(name?: string | null): string {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizePassport(series?: string | null, number?: string | null): string {
  const s = (series || '').replace(/\s/g, '').toUpperCase();
  const n = (number || '').replace(/\s/g, '');
  return s || n ? `${s}${n}` : '';
}