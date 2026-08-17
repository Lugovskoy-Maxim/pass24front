import { Ids } from '../integrations/mstyle-v2/mstyle-v2.ids';
import { MAX_TENANT_EMPLOYEES } from './tenant-limits';

export const IDENTITY_STATUSES = [
  'invited',
  'active',
  'blocked',
  'disabled',
  'deleted',
] as const;
export type IdentityStatus = (typeof IDENTITY_STATUSES)[number];

export const PROFILE_TYPES = ['individual', 'company'] as const;
export type ProfileType = (typeof PROFILE_TYPES)[number];

export const LEGAL_FORMS = ['ip', 'ooo'] as const;
export type LegalForm = (typeof LEGAL_FORMS)[number];

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

export type IdentitySource = {
  passSubject?: string | null;
  identityStatus?: string | null;
  authVersion?: number | null;
  displayName?: string | null;
  fullName?: string | null;
  lastName?: string | null;
  firstName?: string | null;
  middleName?: string | null;
  company?: string | null;
  companyShortName?: string | null;
  profileType?: string | null;
  legalForm?: string | null;
  employeeLimit?: number | null;
  privateDataComplete?: boolean | null;
  privateDataRevision?: number | null;
  isBlocked?: boolean | null;
  isActive?: boolean | null;
  invitePending?: boolean | null;
  parentTenantId?: unknown;
  role?: string | null;
};

export function deriveIdentityStatus(user: IdentitySource): IdentityStatus {
  if (user.identityStatus === 'deleted') return 'deleted';
  if (user.isBlocked) return 'blocked';
  if (user.parentTenantId && user.isActive === false) return 'disabled';
  if (user.invitePending) return 'invited';
  if (user.role === 'tenant' && !user.parentTenantId && user.isActive === false)
    return 'invited';
  return 'active';
}

export function defaultProfileType(user: IdentitySource): ProfileType {
  if (user.profileType === 'individual' || user.profileType === 'company') {
    return user.profileType;
  }
  return user.company?.trim() ? 'company' : 'individual';
}

export function normalizeLegalForm(
  profileType: ProfileType,
  legalForm?: string | null,
): LegalForm | null {
  if (profileType !== 'company') return null;
  if (legalForm === 'ip' || legalForm === 'ooo') return legalForm;
  return 'ooo';
}

export function resolveEmployeeLimit(user: IdentitySource): number {
  const raw = user.employeeLimit;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;
  return MAX_TENANT_EMPLOYEES;
}

export function shouldBumpAuthVersion(
  prev: IdentitySource,
  next: IdentitySource,
): boolean {
  if (!prev.isBlocked && next.isBlocked) return true;
  if (prev.isActive !== false && next.isActive === false && next.parentTenantId)
    return true;
  return false;
}

export function applyUserIdentityDefaults(
  user: IdentitySource,
  options?: { generateSubject?: boolean },
): IdentitySource & {
  passSubject: string;
  identityStatus: IdentityStatus;
  authVersion: number;
  profileType: ProfileType;
  legalForm: LegalForm | null;
} {
  const profileType = defaultProfileType(user);
  user.profileType = profileType;
  user.legalForm = normalizeLegalForm(profileType, user.legalForm);
  user.identityStatus = deriveIdentityStatus(user);
  user.authVersion =
    user.authVersion && user.authVersion > 0 ? user.authVersion : 1;
  user.displayName = user.displayName || user.fullName || '';
  if (user.privateDataComplete == null) user.privateDataComplete = false;
  if (options?.generateSubject !== false && !user.passSubject) {
    user.passSubject = Ids.subject();
  }
  return user as IdentitySource & {
    passSubject: string;
    identityStatus: IdentityStatus;
    authVersion: number;
    profileType: ProfileType;
    legalForm: LegalForm | null;
  };
}

/** Patch только дырок. Существующий passSubject не меняет. */
export function userAdaptPatch(
  user: IdentitySource,
): Record<string, unknown> | null {
  const keepSubject = !!user.passSubject;
  const next = applyUserIdentityDefaults(
    {
      ...user,
      profileType:
        user.profileType === 'individual' || user.profileType === 'company'
          ? user.profileType
          : undefined,
    },
    { generateSubject: !keepSubject },
  );
  const patch: Record<string, unknown> = {};
  if (!user.passSubject) patch.passSubject = next.passSubject;
  if (user.identityStatus !== next.identityStatus) {
    patch.identityStatus = next.identityStatus;
  }
  if (!user.authVersion || user.authVersion < 1) patch.authVersion = 1;
  if (!user.displayName) patch.displayName = next.displayName;
  if (user.profileType !== 'individual' && user.profileType !== 'company') {
    patch.profileType = next.profileType;
  }
  const type = (patch.profileType || user.profileType) as ProfileType;
  const form = normalizeLegalForm(
    type === 'individual' || type === 'company' ? type : next.profileType,
    user.legalForm,
  );
  if ((user.legalForm ?? null) !== form) patch.legalForm = form;
  if (user.privateDataComplete == null) patch.privateDataComplete = false;
  return Object.keys(patch).length ? patch : null;
}

export function identityView(user: IdentitySource) {
  const profileType = defaultProfileType(user);
  return {
    passSubject: user.passSubject || null,
    identityStatus: deriveIdentityStatus(user),
    authVersion:
      user.authVersion && user.authVersion > 0 ? user.authVersion : 1,
    displayName: user.displayName || user.fullName || '',
    profileType,
    legalForm: normalizeLegalForm(profileType, user.legalForm),
    companyShortName: user.companyShortName || null,
    employeeLimit: user.employeeLimit ?? null,
    employeeLimitEffective: resolveEmployeeLimit(user),
    privateDataComplete: !!user.privateDataComplete,
    privateDataRevision: user.privateDataRevision ?? null,
  };
}
