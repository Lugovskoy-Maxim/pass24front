export const MSTYLE_SCHEMA_VERSION = '2.0' as const;
export const MSTYLE_PRIVATE_PREFIX = 'internal/integrations/mstyle/v2';
export const MSTYLE_TOKEN_AUD = 'pass-mstyle-private-api';
export const MSTYLE_AUTH_SCOPE = 'mstyle.resident.authenticate';
export const MSTYLE_ADMIN_PROBE_CLIENT_ID = 'pass-admin-api-console';
export const MSTYLE_PROBLEM_BASE = 'https://pass.example/problems';

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

export const DEFAULT_DATA_SCOPES = [
  MSTYLE_AUTH_SCOPE,
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
  'mstyle.changes.read',
] as const;

/** Маршрут → нужный scope. A-02..A-06 — только authenticate. */
export const ROUTE_SCOPES: Array<{
  method: string;
  match: RegExp;
  scope: string;
}> = [
  {
    method: 'POST',
    match: /\/auth\/residents\/password-verify$/,
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
  { method: 'GET', match: /\/changes$/, scope: 'mstyle.changes.read' },
  {
    method: 'POST',
    match: /\/resident-profiles\/search$/,
    scope: 'mstyle.admin.search',
  },
  {
    method: 'POST',
    match: /\/guest-parties\/search$/,
    scope: 'mstyle.admin.search',
  },
  {
    method: 'GET',
    match: /\/residents\/[^/]+\/context$/,
    scope: 'mstyle.residents.read',
  },
  {
    method: 'PATCH',
    match: /\/residents\/[^/]+\/identity$/,
    scope: 'mstyle.residents.write',
  },
  {
    method: 'POST',
    match: /\/residents\/[^/]+\/contacts\/reveal$/,
    scope: 'mstyle.contacts.read',
  },
  {
    method: 'POST',
    match: /\/residents\/[^/]+\/contacts\//,
    scope: 'mstyle.contacts.write',
  },
  {
    method: 'GET',
    match: /\/residents\/[^/]+\/consents$/,
    scope: 'mstyle.consents.read',
  },
  {
    method: 'POST',
    match: /\/residents\/[^/]+\/consents\//,
    scope: 'mstyle.consents.write',
  },
  {
    method: 'GET',
    match: /\/identities\/[^/]+$/,
    scope: 'mstyle.residents.read',
  },
  {
    method: 'POST',
    match: /\/resident-onboarding$/,
    scope: 'mstyle.profiles.write',
  },
  {
    method: 'GET',
    match: /\/resident-profiles\/[^/]+\/memberships$/,
    scope: 'mstyle.memberships.read',
  },
  {
    method: 'POST',
    match: /\/resident-profiles\/[^/]+\/memberships$/,
    scope: 'mstyle.memberships.write',
  },
  {
    method: 'POST',
    match: /\/resident-profiles\/[^/]+\/owner-transfer$/,
    scope: 'mstyle.memberships.write',
  },
  {
    method: 'GET',
    match: /\/resident-profiles\/[^/]+\/contact-assignments$/,
    scope: 'mstyle.contacts.read',
  },
  {
    method: 'PATCH',
    match: /\/resident-profiles\/[^/]+\/contact-assignments$/,
    scope: 'mstyle.contacts.write',
  },
  {
    method: 'POST',
    match: /\/resident-profiles\/[^/]+\/contacts\/reveal$/,
    scope: 'mstyle.contacts.read',
  },
  {
    method: 'GET',
    match: /\/resident-profiles\/[^/]+\/private-data\/status$/,
    scope: 'mstyle.private-data.read',
  },
  {
    method: 'POST',
    match: /\/resident-profiles\/[^/]+\/private-data\/reveal$/,
    scope: 'mstyle.private-data.read',
  },
  {
    method: 'PATCH',
    match: /\/resident-profiles\/[^/]+\/private-data$/,
    scope: 'mstyle.private-data.write',
  },
  {
    method: 'POST',
    match: /\/resident-profiles\/[^/]+\/private-data\/snapshots$/,
    scope: 'mstyle.private-data.write',
  },
  {
    method: 'GET',
    match: /\/resident-profiles\/[^/]+\/physical-access$/,
    scope: 'mstyle.profiles.read',
  },
  {
    method: 'GET',
    match: /\/resident-profiles\/[^/]+\/change-requests\/current$/,
    scope: 'mstyle.profiles.read',
  },
  {
    method: 'POST',
    match: /\/resident-profiles\/[^/]+\/change-requests$/,
    scope: 'mstyle.profiles.write',
  },
  {
    method: 'POST',
    match: /\/resident-profiles\/[^/]+\/lifecycle-transitions$/,
    scope: 'mstyle.profiles.write',
  },
  {
    method: 'POST',
    match: /\/resident-profiles\/[^/]+\/deletion-requests$/,
    scope: 'mstyle.profiles.write',
  },
  {
    method: 'GET',
    match: /\/resident-profiles\/[^/]+$/,
    scope: 'mstyle.profiles.read',
  },
  {
    method: 'PATCH',
    match: /\/resident-profiles\/[^/]+$/,
    scope: 'mstyle.profiles.write',
  },
  {
    method: 'PATCH',
    match: /\/resident-memberships\/[^/]+$/,
    scope: 'mstyle.memberships.write',
  },
  {
    method: 'POST',
    match: /\/resident-memberships\/[^/]+\/revoke$/,
    scope: 'mstyle.memberships.write',
  },
  {
    method: 'POST',
    match: /\/resident-profile-change-requests\//,
    scope: 'mstyle.profiles.write',
  },
  {
    method: 'GET',
    match: /\/deletion-requests\//,
    scope: 'mstyle.profiles.read',
  },
  {
    method: 'POST',
    match: /\/private-data-snapshots\/[^/]+\/operation-bindings$/,
    scope: 'mstyle.private-data.write',
  },
  {
    method: 'POST',
    match: /\/private-data-snapshots\//,
    scope: 'mstyle.private-data.read',
  },
  {
    method: 'POST',
    match: /\/guest-parties$/,
    scope: 'mstyle.guests.write',
  },
  { method: 'GET', match: /\/guest-parties\//, scope: 'mstyle.guests.read' },
  { method: 'POST', match: /\/guest-parties\//, scope: 'mstyle.guests.write' },
  { method: 'PATCH', match: /\/guest-parties\//, scope: 'mstyle.guests.write' },
];

export const RESIDENT_PRIVATE_FIELDS = [
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
  'lastName',
  'firstName',
  'middleName',
  'birthDate',
  'documentType',
  'documentSeries',
  'documentNumber',
] as const;

export const REQUIRED_INDIVIDUAL_FIELDS = [
  'lastName',
  'firstName',
  'birthDate',
] as const;
export const REQUIRED_COMPANY_FIELDS = [
  'companyFullName',
  'inn',
  'ogrn',
] as const;
export const REQUIRED_GUEST_FIELDS = ['lastName', 'firstName'] as const;

export const AUTH_SUCCESS_REPLAY_MS = 60_000;
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
