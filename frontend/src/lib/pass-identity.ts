export type IdentityStatus =
  | 'invited'
  | 'active'
  | 'blocked'
  | 'disabled'
  | 'deleted';

export type ProfileType = 'individual' | 'company';
export type LegalForm = 'ip' | 'ooo';

export const IDENTITY_STATUS_LABELS: Record<IdentityStatus, string> = {
  invited: 'Приглашён',
  active: 'Активен',
  blocked: 'Заблокирован',
  disabled: 'Отключён',
  deleted: 'Удалён',
};

export const PROFILE_TYPE_LABELS: Record<ProfileType, string> = {
  individual: 'Физлицо',
  company: 'Компания',
};

export const LEGAL_FORM_LABELS: Record<LegalForm, string> = {
  ip: 'ИП',
  ooo: 'ООО',
};

export function identityStatusLabel(status?: string | null): string {
  if (status && status in IDENTITY_STATUS_LABELS) {
    return IDENTITY_STATUS_LABELS[status as IdentityStatus];
  }
  return '—';
}

export function profileTypeLabel(type?: string | null): string {
  if (type && type in PROFILE_TYPE_LABELS) {
    return PROFILE_TYPE_LABELS[type as ProfileType];
  }
  return '—';
}

export function legalFormLabel(form?: string | null): string {
  if (!form) return '—';
  if (form in LEGAL_FORM_LABELS) return LEGAL_FORM_LABELS[form as LegalForm];
  return form;
}
