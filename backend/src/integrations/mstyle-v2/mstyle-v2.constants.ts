export const MSTYLE_SCHEMA_VERSION = '2.0' as const;
export const MSTYLE_PRIVATE_PREFIX = 'internal/integrations/mstyle/v2';
export const MSTYLE_TOKEN_AUD = 'pass-mstyle-private-api';
export const MSTYLE_AUTH_SCOPE = 'mstyle.resident.authenticate';
export const MSTYLE_ADMIN_PROBE_CLIENT_ID = 'pass-admin-api-console';
export const MSTYLE_PROBLEM_BASE = 'https://pass.mstyle.ru/problems';

export const AUTH_CHANNELS = ['sms', 'telegram', 'email'] as const;
export const IDENTIFIER_TYPES = ['phone', 'email'] as const;

export const ALLOWED_AUTH_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['phone', 'sms'],
  ['phone', 'telegram'],
  ['email', 'email'],
];

export const AUTH_CHALLENGE_STATUSES = [
  'dispatch_pending',
  'awaiting_code',
  'consumed',
  'expired',
] as const;

export const IDENTITY_STATUSES = [
  'invited',
  'active',
  'blocked',
  'disabled',
  'deleted',
] as const;

export const PROFILE_TYPES = ['individual', 'company'] as const;
export const LEGAL_FORMS = ['ip', 'ooo'] as const;
export const PROFILE_STATUSES = [
  'draft',
  'active',
  'suspended',
  'closed',
  'deleted',
] as const;

export const MEMBERSHIP_ROLES = ['owner', 'employee'] as const;
export const MEMBERSHIP_STATUSES = [
  'invited',
  'active',
  'suspended',
  'revoked',
] as const;

export const CONTACT_TYPES = ['phone', 'email'] as const;
export const CONTACT_PURPOSES = ['primary', 'contract', 'billing'] as const;

export const CONSENT_STATUSES = ['accepted', 'withdrawn', 'required'] as const;

export const ACCESS_RESOURCE_TYPES = [
  'property',
  'office',
  'zone',
  'door',
] as const;
export const ACCESS_PERMISSIONS = ['enter', 'exit', 'visitor_invite'] as const;
export const ACCESS_STATUSES = [
  'active',
  'suspended',
  'revoked',
  'expired',
] as const;

export const PRIVATE_EDIT_POLICIES = [
  'initial',
  'self_service',
  'request_only',
  'locked',
] as const;

export const MSTYLE_REQUIRED_M0_SCOPES = [
  'mstyle.guest.booking.confirm',
  'mstyle.guest.create',
  'mstyle.integration.admin.members.read',
  'mstyle.integration.admin.profile.read',
  MSTYLE_AUTH_SCOPE,
  'mstyle.resident.consent.read',
  'mstyle.resident.consent.write',
  'mstyle.resident.contact.read',
  'mstyle.resident.contact.write',
  'mstyle.resident.context.read',
  'mstyle.resident.identity.write',
  'mstyle.resident.members.read',
  'mstyle.resident.members.write',
  'mstyle.resident.private.reveal',
  'mstyle.resident.private.status.read',
  'mstyle.resident.private.write',
  'mstyle.resident.profile.read',
  'mstyle.resident.profile.write',
  'mstyle.resident.snapshot.create',
  'mstyle.snapshot.operation.bind',
] as const;

/**
 * Additional scopes required by the mandatory M1/M2 routes. R-03 is kept
 * separate because it belongs exclusively to mstyle-reconcile-prod.
 */
export const MSTYLE_REQUIRED_M1_M2_SCOPES = [
  'mstyle.guest.claim',
  'mstyle.guest.contact.read',
  'mstyle.guest.private.reveal',
  'mstyle.guest.snapshot.contact.reveal',
  'mstyle.guest.snapshot.private.reveal',
  'mstyle.integration.admin.change_request.decide',
  'mstyle.integration.admin.guest.read',
  'mstyle.integration.admin.identity.read',
  'mstyle.integration.admin.onboarding.write',
  'mstyle.integration.admin.physical_access.read',
  'mstyle.integration.admin.profile.write',
  'mstyle.resident.change_request.read',
  'mstyle.resident.change_request.write',
  'mstyle.resident.physical_access.read',
  'mstyle.resident.snapshot.contact.reveal',
  'mstyle.resident.snapshot.private.reveal',
] as const;

export const MSTYLE_DOCUMENTED_BACKEND_SCOPES = [
  ...MSTYLE_REQUIRED_M0_SCOPES,
  ...MSTYLE_REQUIRED_M1_M2_SCOPES,
] as const;

export const MSTYLE_RECONCILE_SCOPES = [
  'mstyle.integration.reconcile',
] as const;

export const LEGACY_DATA_SCOPES = [
  MSTYLE_AUTH_SCOPE,
  'mstyle.resident.context.read',
  'mstyle.residents.read',
  'mstyle.residents.write',
  'mstyle.profiles.read',
  'mstyle.profiles.write',
  'mstyle.memberships.read',
  'mstyle.memberships.write',
  'mstyle.contacts.read',
  'mstyle.contacts.write',
  'mstyle.consents.read',
  'mstyle.consents.write',
  'mstyle.private-data.read',
  'mstyle.private-data.write',
  'mstyle.guests.read',
  'mstyle.guests.write',
  'mstyle.admin.search',
] as const;

/**
 * Scope names used before the granular Mstyle contract was introduced.
 * Keep accepting them during migration, but authorize the canonical scopes
 * expected by the PHP adapter and acceptance kit.
 */
export const LEGACY_SCOPE_ALIASES: Readonly<Record<string, readonly string[]>> =
  {
    'mstyle.residents.read': ['mstyle.integration.admin.identity.read'],
    'mstyle.residents.write': ['mstyle.resident.identity.write'],
    'mstyle.profiles.read': [
      'mstyle.resident.profile.read',
      'mstyle.resident.physical_access.read',
      'mstyle.resident.change_request.read',
      'mstyle.integration.admin.profile.read',
      'mstyle.integration.admin.physical_access.read',
    ],
    'mstyle.profiles.write': [
      'mstyle.resident.profile.write',
      'mstyle.resident.change_request.write',
      'mstyle.integration.admin.onboarding.write',
      'mstyle.integration.admin.profile.write',
      'mstyle.integration.admin.change_request.decide',
    ],
    'mstyle.memberships.read': [
      'mstyle.resident.members.read',
      'mstyle.integration.admin.members.read',
    ],
    'mstyle.memberships.write': ['mstyle.resident.members.write'],
    'mstyle.contacts.read': ['mstyle.resident.contact.read'],
    'mstyle.contacts.write': ['mstyle.resident.contact.write'],
    'mstyle.consents.read': ['mstyle.resident.consent.read'],
    'mstyle.consents.write': ['mstyle.resident.consent.write'],
    'mstyle.private-data.read': [
      'mstyle.resident.private.status.read',
      'mstyle.resident.private.reveal',
      'mstyle.resident.snapshot.private.reveal',
      'mstyle.resident.snapshot.contact.reveal',
    ],
    'mstyle.private-data.write': [
      'mstyle.resident.private.write',
      'mstyle.resident.snapshot.create',
      'mstyle.snapshot.operation.bind',
    ],
    'mstyle.guests.read': [
      'mstyle.guest.read',
      'mstyle.guest.contact.read',
      'mstyle.guest.private.status.read',
      'mstyle.guest.private.reveal',
      'mstyle.guest.snapshot.contact.reveal',
      'mstyle.guest.snapshot.private.reveal',
      'mstyle.guest.consent.read',
      'mstyle.integration.admin.guest.read',
    ],
    'mstyle.guests.write': [
      'mstyle.guest.create',
      'mstyle.guest.contact.verify',
      'mstyle.guest.private.write',
      'mstyle.guest.snapshot.create',
      'mstyle.guest.booking.confirm',
      'mstyle.guest.claim',
      'mstyle.guest.consent.write',
    ],
    'mstyle.admin.search': [
      'mstyle.integration.admin.profile.read',
      'mstyle.integration.admin.members.read',
      'mstyle.integration.admin.guest.read',
    ],
    'mstyle.changes.read': ['mstyle.integration.reconcile'],
  };

export function expandMstyleScopes(scopes: readonly string[]): string[] {
  const expanded = new Set<string>();
  for (const raw of scopes) {
    const scope = raw.trim();
    if (!scope) continue;
    expanded.add(scope);
    for (const alias of LEGACY_SCOPE_ALIASES[scope] || []) {
      expanded.add(alias);
    }
  }
  return [...expanded];
}

export const DEFAULT_DATA_SCOPES = expandMstyleScopes([
  ...MSTYLE_REQUIRED_M0_SCOPES,
  ...MSTYLE_REQUIRED_M1_M2_SCOPES,
  ...LEGACY_DATA_SCOPES,
]);

/** Маршрут → нужный scope. A-02..A-06 — только authenticate. */
export const ROUTE_SCOPES: Array<{
  method: string;
  match: RegExp;
  scope: string;
  alternatives?: readonly string[];
}> = [
  {
    method: 'POST',
    match: /\/auth\/residents\/password(?::verify|-verify)$/,
    scope: MSTYLE_AUTH_SCOPE,
  },
  {
    method: 'POST',
    match: /\/auth\/residents\/code-challenges$/,
    scope: MSTYLE_AUTH_SCOPE,
  },
  {
    method: 'GET',
    match: /\/auth\/residents\/code-challenges\/[^/]+$/,
    scope: MSTYLE_AUTH_SCOPE,
  },
  {
    method: 'POST',
    match: /\/auth\/residents\/code-challenges\/[^/]+\/resend$/,
    scope: MSTYLE_AUTH_SCOPE,
  },
  {
    method: 'POST',
    match: /\/auth\/residents\/code-challenges\/[^/]+\/verify$/,
    scope: MSTYLE_AUTH_SCOPE,
  },
  {
    method: 'GET',
    match: /\/changes$/,
    scope: 'mstyle.integration.reconcile',
  },
  {
    method: 'POST',
    match: /\/resident-profiles\/search$/,
    scope: 'mstyle.integration.admin.profile.read',
  },
  {
    method: 'POST',
    match: /\/guest-parties\/search$/,
    scope: 'mstyle.integration.admin.guest.read',
  },
  {
    method: 'GET',
    match: /\/residents\/[^/]+\/context$/,
    scope: 'mstyle.resident.context.read',
  },
  {
    method: 'PATCH',
    match: /\/residents\/[^/]+\/identity$/,
    scope: 'mstyle.resident.identity.write',
  },
  {
    method: 'POST',
    match: /\/residents\/[^/]+\/contacts\/reveal$/,
    scope: 'mstyle.resident.contact.read',
  },
  {
    method: 'POST',
    match: /\/residents\/[^/]+\/contacts\//,
    scope: 'mstyle.resident.contact.write',
  },
  {
    method: 'GET',
    match: /\/residents\/[^/]+\/consents$/,
    scope: 'mstyle.resident.consent.read',
  },
  {
    method: 'POST',
    match: /\/residents\/[^/]+\/consents\//,
    scope: 'mstyle.resident.consent.write',
  },
  {
    method: 'GET',
    match: /\/identities\/[^/]+$/,
    scope: 'mstyle.integration.admin.identity.read',
  },
  {
    method: 'POST',
    match: /\/resident-onboarding$/,
    scope: 'mstyle.integration.admin.onboarding.write',
  },
  {
    method: 'GET',
    match: /\/resident-profiles\/[^/]+\/memberships$/,
    scope: 'mstyle.resident.members.read',
    alternatives: ['mstyle.integration.admin.members.read'],
  },
  {
    method: 'POST',
    match: /\/resident-profiles\/[^/]+\/memberships$/,
    scope: 'mstyle.resident.members.write',
  },
  {
    method: 'POST',
    match: /\/resident-profiles\/[^/]+\/owner-transfer$/,
    scope: 'mstyle.resident.members.write',
  },
  {
    method: 'GET',
    match: /\/resident-profiles\/[^/]+\/contact-assignments$/,
    scope: 'mstyle.resident.contact.read',
    alternatives: ['mstyle.integration.admin.profile.read'],
  },
  {
    method: 'PATCH',
    match: /\/resident-profiles\/[^/]+\/contact-assignments$/,
    scope: 'mstyle.resident.contact.write',
  },
  {
    method: 'POST',
    match: /\/resident-profiles\/[^/]+\/contacts\/reveal$/,
    scope: 'mstyle.resident.contact.read',
  },
  {
    method: 'GET',
    match: /\/resident-profiles\/[^/]+\/private-data\/status$/,
    scope: 'mstyle.resident.private.status.read',
  },
  {
    method: 'POST',
    match: /\/resident-profiles\/[^/]+\/private-data\/reveal$/,
    scope: 'mstyle.resident.private.reveal',
  },
  {
    method: 'PATCH',
    match: /\/resident-profiles\/[^/]+\/private-data$/,
    scope: 'mstyle.resident.private.write',
  },
  {
    method: 'POST',
    match: /\/resident-profiles\/[^/]+\/private-data\/snapshots$/,
    scope: 'mstyle.resident.snapshot.create',
  },
  {
    method: 'GET',
    match: /\/resident-profiles\/[^/]+\/physical-access$/,
    scope: 'mstyle.resident.physical_access.read',
    alternatives: ['mstyle.integration.admin.physical_access.read'],
  },
  {
    method: 'GET',
    match: /\/resident-profiles\/[^/]+\/change-requests\/current$/,
    scope: 'mstyle.resident.change_request.read',
  },
  {
    method: 'POST',
    match: /\/resident-profiles\/[^/]+\/change-requests$/,
    scope: 'mstyle.resident.change_request.write',
  },
  {
    method: 'POST',
    match: /\/resident-profiles\/[^/]+\/lifecycle-transitions$/,
    scope: 'mstyle.integration.admin.profile.write',
  },
  {
    method: 'POST',
    match: /\/resident-profiles\/[^/]+\/deletion-requests$/,
    scope: 'mstyle.integration.admin.profile.write',
  },
  {
    method: 'GET',
    match: /\/resident-profiles\/[^/]+$/,
    scope: 'mstyle.resident.profile.read',
    alternatives: ['mstyle.integration.admin.profile.read'],
  },
  {
    method: 'PATCH',
    match: /\/resident-profiles\/[^/]+$/,
    scope: 'mstyle.resident.profile.write',
  },
  {
    method: 'PATCH',
    match: /\/resident-memberships\/[^/]+$/,
    scope: 'mstyle.resident.members.write',
  },
  {
    method: 'POST',
    match: /\/resident-memberships\/[^/]+\/revoke$/,
    scope: 'mstyle.resident.members.write',
  },
  {
    method: 'POST',
    match: /\/resident-profile-change-requests\/[^/]+\/decisions$/,
    scope: 'mstyle.integration.admin.change_request.decide',
  },
  {
    method: 'POST',
    match: /\/resident-profile-change-requests\/[^/]+\/cancel$/,
    scope: 'mstyle.resident.change_request.write',
  },
  {
    method: 'GET',
    match: /\/deletion-requests\//,
    scope: 'mstyle.integration.admin.profile.read',
  },
  {
    method: 'POST',
    match: /\/private-data-snapshots\/[^/]+\/operation-bindings$/,
    scope: 'mstyle.snapshot.operation.bind',
  },
  {
    method: 'POST',
    match: /\/private-data-snapshots\/[^/]+\/contacts\/reveal$/,
    scope: 'mstyle.resident.snapshot.contact.reveal',
    alternatives: ['mstyle.guest.snapshot.contact.reveal'],
  },
  {
    method: 'POST',
    match: /\/private-data-snapshots\/[^/]+\/reveal$/,
    scope: 'mstyle.resident.snapshot.private.reveal',
    alternatives: ['mstyle.guest.snapshot.private.reveal'],
  },
  {
    method: 'POST',
    match: /\/guest-parties$/,
    scope: 'mstyle.guest.create',
  },
  {
    method: 'POST',
    match: /\/guest-parties\/[^/]+\/contact-challenges(?:\/[^/]+\/verify)?$/,
    scope: 'mstyle.guest.contact.verify',
  },
  {
    method: 'GET',
    match: /\/guest-parties\/[^/]+\/status$/,
    scope: 'mstyle.guest.read',
  },
  {
    method: 'POST',
    match: /\/guest-parties\/[^/]+\/contacts\/reveal$/,
    scope: 'mstyle.guest.contact.read',
  },
  {
    method: 'GET',
    match: /\/guest-parties\/[^/]+\/private-data\/status$/,
    scope: 'mstyle.guest.private.status.read',
  },
  {
    method: 'POST',
    match: /\/guest-parties\/[^/]+\/private-data\/reveal$/,
    scope: 'mstyle.guest.private.reveal',
  },
  {
    method: 'PATCH',
    match: /\/guest-parties\/[^/]+\/private-data$/,
    scope: 'mstyle.guest.private.write',
  },
  {
    method: 'POST',
    match: /\/guest-parties\/[^/]+\/snapshots$/,
    scope: 'mstyle.guest.snapshot.create',
  },
  {
    method: 'POST',
    match: /\/guest-parties\/[^/]+\/booking-confirmations$/,
    scope: 'mstyle.guest.booking.confirm',
  },
  {
    method: 'POST',
    match: /\/guest-parties\/[^/]+\/claim$/,
    scope: 'mstyle.guest.claim',
  },
  {
    method: 'GET',
    match: /\/guest-parties\/[^/]+\/consents$/,
    scope: 'mstyle.guest.consent.read',
  },
  {
    method: 'POST',
    match: /\/guest-parties\/[^/]+\/consents\//,
    scope: 'mstyle.guest.consent.write',
  },
];

export const RESIDENT_PRIVATE_FIELDS = [
  'company.fullName',
  'company.inn',
  'company.kpp',
  'company.ogrn',
  'company.legalAddress',
  'company.actualAddress',
  'company.generalDirector',
  'representative.fullName',
  'representative.birthDate',
  'bank.name',
  'bank.bik',
  'bank.accountNumber',
  'bank.correspondentAccountNumber',
  'entrepreneur.inn',
  'entrepreneur.ogrnip',
  'entrepreneur.registrationAddress',
  'individual.birthDate',
  'individual.inn',
  'individual.registrationAddress',
  'individual.passport.fullName',
  'individual.passport.gender',
  'individual.passport.birthDate',
  'individual.passport.number',
  'individual.passport.departmentCode',
  'individual.passport.issuedDate',
  'individual.passport.issuedBy',
  // Legacy M0 field codes remain readable while clients migrate to the
  // structured M1/M2 field paths above.
  'lastName',
  'firstName',
  'middleName',
  'displayName',
  'birthDate',
  'birthPlace',
  'documentType',
  'documentSeries',
  'documentNumber',
  'documentIssuedBy',
  'documentIssuedAt',
  'documentCode',
  'registrationAddress',
  'inn',
  'snils',
  'companyFullName',
  'companyShortName',
  'kpp',
  'ogrn',
  'legalAddress',
  'actualAddress',
  'ceoName',
] as const;

export const GUEST_PRIVATE_FIELDS = [
  'displayName',
  'individual.birthDate',
  'individual.inn',
  'individual.registrationAddress',
  'individual.passport.fullName',
  'individual.passport.gender',
  'individual.passport.birthDate',
  'individual.passport.number',
  'individual.passport.departmentCode',
  'individual.passport.issuedDate',
  'individual.passport.issuedBy',
  'lastName',
  'firstName',
  'middleName',
  'birthDate',
  'documentType',
  'documentSeries',
  'documentNumber',
] as const;

export const REQUIRED_INDIVIDUAL_FIELDS = [
  'individual.birthDate',
  'individual.passport.fullName',
] as const;
export const REQUIRED_COMPANY_FIELDS = [
  'company.fullName',
  'company.inn',
  'company.ogrn',
] as const;
export const REQUIRED_GUEST_FIELDS = [
  'displayName',
  'individual.birthDate',
] as const;

export const AUTH_SUCCESS_REPLAY_MS = 60_000;
export const STEP_UP_TTL_MS = 12 * 60 * 60_000;
export const CHALLENGE_TTL_MS = 5 * 60_000;
export const RESEND_MIN_MS = 60_000;
export const MAX_VERIFY_ATTEMPTS = 5;
export const CODE_LENGTH = 4;
export const POLL_AFTER_MS = 1500;
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60_000;
export const CLIENT_ASSERTION_MAX_TTL_SEC = 60;
export const DEFAULT_TOKEN_TTL_SEC = 300;
export const DEFAULT_GUEST_TTL_MS = 7 * 24 * 60 * 60_000;

export const RATE_LIMITS = {
  startByIdentifier: { limit: 5, windowMs: 15 * 60_000 },
  startByIp: { limit: 30, windowMs: 15 * 60_000 },
  startByClientIp: { limit: 20, windowMs: 15 * 60_000 },
  resendByChallenge: { limit: 5, windowMs: 15 * 60_000 },
  verifyByIp: { limit: 40, windowMs: 15 * 60_000 },
} as const;
