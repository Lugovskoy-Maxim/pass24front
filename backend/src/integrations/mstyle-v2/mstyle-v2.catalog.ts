/** Каталог закрытого API Mstyle v2 — документ эндпоинты.md, 58 маршрутов. */

import {
  createMstyleMockResponse,
  MSTYLE_MOCK_MILESTONES,
} from './mstyle-v2.mock';

export type CatalogExample = {
  status: number;
  label: string;
  body: unknown;
  contentType?: string;
};

export type CatalogEndpoint = {
  id: string;
  group: string;
  milestone: 'M0' | 'M1' | 'M2';
  title: string;
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  headers: Record<string, string>;
  request?: unknown;
  requestForm?: string;
  success: CatalogExample;
  errors: CatalogExample[];
};

const PRIVATE = '/api/internal/integrations/mstyle/v2';
const SCHEMA = '2.0';
const CTX = {
  ipAddress: '192.0.2.10',
  userAgent: 'Mstyle test browser',
  locale: 'ru-RU',
};
const AUTH = {
  Authorization: 'Bearer {access_token}',
  'X-Request-ID': 'req_01J5Q8K2M7N4P6R9T1V3X5Z700',
};
const IDEM = {
  ...AUTH,
  'Idempotency-Key': 'idem_01TESTKEY',
};

function problem(
  status: number,
  code: string,
  title: string,
  retryable = false,
): CatalogExample {
  return {
    status,
    label: `${status} ${code}`,
    contentType: 'application/problem+json',
    body: {
      type: `https://pass.example/problems/${code.toLowerCase().replace(/_/g, '-')}`,
      title,
      status,
      code,
      requestId: 'req_01J5Q8K2M7N4P6R9T1V3X5Z700',
      retryable,
      errors: [],
    },
  };
}

const COMMON_AUTH_ERRORS = [
  problem(401, 'INVALID_SERVICE_TOKEN', 'Invalid service token'),
  problem(403, 'INSUFFICIENT_SCOPE', 'Insufficient scope'),
  problem(422, 'VALIDATION_FAILED', 'Validation failed'),
];

const AUTH_FLOW_ERRORS = [
  problem(401, 'INVALID_CREDENTIALS', 'Invalid credentials'),
  problem(401, 'INVALID_SERVICE_TOKEN', 'Invalid service token'),
  problem(403, 'INSUFFICIENT_SCOPE', 'Insufficient scope'),
  problem(404, 'NOT_FOUND', 'Not found'),
  problem(409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency key reused'),
  problem(409, 'CHALLENGE_CONSUMED', 'Challenge consumed'),
  problem(410, 'CHALLENGE_EXPIRED', 'Challenge expired'),
  problem(422, 'VALIDATION_FAILED', 'Validation failed'),
  problem(429, 'RATE_LIMITED', 'Rate limited', true),
  problem(503, 'UPSTREAM_UNAVAILABLE', 'Upstream unavailable', true),
];

const IDENTITY = {
  schemaVersion: SCHEMA,
  subject: 'usr_01J5Q8K2M7N4P6R9T1V3X5Z7AA',
  identityStatus: 'active',
  authVersion: 3,
  revision: 4,
  displayName: 'Иванов Иван',
  name: { lastName: 'Иванов', firstName: 'Иван', middleName: 'Иванович' },
  contactMasks: [{ type: 'phone', masked: '+7 ••• •••-12-34' }],
};

const PROFILE = {
  schemaVersion: SCHEMA,
  id: 'prf_01J5Q8K2M7N4P6R9T1V3X5Z7BB',
  type: 'company',
  legalForm: 'ooo',
  status: 'active',
  label: 'ООО Пример',
  companyShortName: 'Пример',
  revision: 2,
  privateDataRevision: 1,
  privateDataComplete: true,
  memberPolicy: { employeeLimit: 3 },
  sourceLinks: [],
  createdAt: '2026-08-01T10:00:00Z',
  updatedAt: '2026-08-14T10:00:00Z',
};

const MEMBERSHIP = {
  schemaVersion: SCHEMA,
  id: 'mem_01J5Q8K2M7N4P6R9T1V3X5Z7CC',
  subject: IDENTITY.subject,
  profileId: PROFILE.id,
  role: 'owner',
  status: 'active',
  validFrom: '2026-08-01T10:00:00Z',
  validUntil: null,
  revision: 1,
};

const CHALLENGE = {
  schemaVersion: SCHEMA,
  challengeId: 'ach_01J5Q8K2M7N4P6R9T1V3X5Z7A2',
  status: 'awaiting_code',
  channel: 'sms',
  codeLength: 4,
  expiresAt: '2026-08-14T10:05:00Z',
  resendAfter: '2026-08-14T10:01:00Z',
  pollAfterMs: 1500,
};

const SNAPSHOT = {
  schemaVersion: SCHEMA,
  snapshotId: 'snp_01J5Q8K2M7N4P6R9T1V3X5Z7DD',
  partyId: PROFILE.id,
  snapshotRevision: 1,
  contentDigest: {
    algorithm: 'HMAC-SHA-256',
    value: 'abc123digest',
  },
};

const GUEST = {
  schemaVersion: SCHEMA,
  guestPartyId: 'gst_01J5Q8K2M7N4P6R9T1V3X5Z7EE',
  status: 'draft',
  revision: 1,
};

function ep(
  partial: Omit<CatalogEndpoint, 'headers' | 'errors'> & {
    headers?: Record<string, string>;
    errors?: CatalogExample[];
  },
): CatalogEndpoint {
  return {
    headers: AUTH,
    errors: COMMON_AUTH_ERRORS,
    ...partial,
  };
}

const MSTYLE_V2_CATALOG_BASE: CatalogEndpoint[] = [
  {
    id: 'A-01',
    group: 'A — вход',
    milestone: 'M0',
    title: 'Сервисный токен',
    method: 'POST',
    path: '/api/oauth2/token',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    requestForm:
      'grant_type=client_credentials&client_id=mstyle-backend-staging&scope=mstyle.resident.authenticate&client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer&client_assertion=<JWT>',
    success: {
      status: 200,
      label: '200 token',
      body: {
        access_token: 'svc_opaque_token',
        token_type: 'Bearer',
        expires_in: 300,
        scope: 'mstyle.resident.authenticate',
      },
    },
    errors: [
      {
        status: 401,
        label: '401 invalid_client',
        contentType: 'application/json',
        body: {
          error: 'invalid_client',
          error_description: 'Client authentication failed',
        },
      },
      {
        status: 400,
        label: '400 unsupported_grant_type',
        contentType: 'application/json',
        body: { error: 'unsupported_grant_type' },
      },
    ],
  },
  ep({
    id: 'A-02',
    group: 'A — вход',
    milestone: 'M1',
    title: 'Логин и пароль резидента',
    method: 'POST',
    path: `${PRIVATE}/auth/residents/password-verify`,
    headers: IDEM,
    request: {
      schemaVersion: SCHEMA,
      login: 'resident-login',
      password: 'test-password',
      context: CTX,
    },
    success: {
      status: 200,
      label: '200 authenticated',
      body: {
        schemaVersion: SCHEMA,
        authenticationId: 'aut_01J5Q8K2M7N4P6R9T1V3X5Z7A1',
        subject: IDENTITY.subject,
        identityStatus: 'active',
        authVersion: 3,
        authenticatedAt: '2026-08-14T10:00:00Z',
        authenticationMethod: 'password',
      },
    },
    errors: [
      ...AUTH_FLOW_ERRORS,
      problem(409, 'IDEMPOTENCY_REPLAY_EXPIRED', 'Idempotency replay expired'),
    ],
  }),
  ep({
    id: 'A-03',
    group: 'A — вход',
    milestone: 'M0',
    title: 'Начать вход по коду',
    method: 'POST',
    path: `${PRIVATE}/auth/residents/code-challenges`,
    headers: IDEM,
    request: {
      schemaVersion: SCHEMA,
      identifier: { type: 'phone', value: '+79990001234' },
      channel: 'sms',
      context: CTX,
    },
    success: {
      status: 202,
      label: '202 challenge',
      body: { ...CHALLENGE, status: 'dispatch_pending' },
    },
    errors: AUTH_FLOW_ERRORS,
  }),
  ep({
    id: 'A-04',
    group: 'A — вход',
    milestone: 'M0',
    title: 'Состояние попытки входа',
    method: 'GET',
    path: `${PRIVATE}/auth/residents/code-challenges/{challengeId}`,
    success: { status: 200, label: '200 awaiting_code', body: CHALLENGE },
    errors: AUTH_FLOW_ERRORS,
  }),
  ep({
    id: 'A-05',
    group: 'A — вход',
    milestone: 'M0',
    title: 'Повторно отправить код',
    method: 'POST',
    path: `${PRIVATE}/auth/residents/code-challenges/{challengeId}/resend`,
    headers: IDEM,
    success: {
      status: 202,
      label: '202 resent',
      body: { ...CHALLENGE, status: 'dispatch_pending' },
    },
    errors: AUTH_FLOW_ERRORS,
  }),
  ep({
    id: 'A-06',
    group: 'A — вход',
    milestone: 'M0',
    title: 'Проверить код',
    method: 'POST',
    path: `${PRIVATE}/auth/residents/code-challenges/{challengeId}/verify`,
    headers: IDEM,
    request: { schemaVersion: SCHEMA, code: '1234', context: CTX },
    success: {
      status: 200,
      label: '200 authenticated',
      body: {
        schemaVersion: SCHEMA,
        authenticationId: 'aut_01J5Q8K2M7N4P6R9T1V3X5Z7A3',
        subject: IDENTITY.subject,
        identityStatus: 'active',
        authVersion: 3,
        authenticatedAt: '2026-08-14T10:03:00Z',
        authenticationMethod: 'sms',
      },
    },
    errors: AUTH_FLOW_ERRORS,
  }),
  ep({
    id: 'R-01',
    group: 'R — резиденты',
    milestone: 'M0',
    title: 'Контекст резидента',
    method: 'GET',
    path: `${PRIVATE}/residents/{subject}/context`,
    success: {
      status: 200,
      label: '200 context',
      body: {
        schemaVersion: SCHEMA,
        subject: IDENTITY.subject,
        identityStatus: IDENTITY.identityStatus,
        authVersion: IDENTITY.authVersion,
        identityDisplay: {
          displayName: IDENTITY.displayName,
          contactMasks: IDENTITY.contactMasks,
        },
        profiles: [
          {
            profileId: PROFILE.id,
            membershipId: MEMBERSHIP.id,
            membershipRole: 'owner',
            membershipStatus: 'active',
            profileStatus: 'active',
            profileType: 'company',
            legalForm: 'ooo',
            profileRevision: 2,
            privateDataRevision: 1,
            privateDataComplete: true,
            display: { label: 'ООО Пример' },
            memberPolicy: { employeeLimit: 3 },
            snapshotSources: {
              primary: {
                profile: 2,
                profileContactAssignments: { phone: 1, email: null },
                contactIdentity: 4,
                identityContacts: { phone: 1, email: null },
                privateData: 1,
              },
            },
          },
        ],
        physicalAccessFacts: { revision: 1, grants: [] },
        contextRevision: 5,
        generatedAt: '2026-08-14T10:00:00Z',
      },
    },
  }),
  ep({
    id: 'R-03',
    group: 'R — резиденты',
    milestone: 'M2',
    title: 'Лента изменений',
    method: 'GET',
    path: `${PRIVATE}/changes?after={cursor}&limit=50`,
    success: {
      status: 200,
      label: '200 changes',
      body: {
        schemaVersion: SCHEMA,
        items: [
          {
            eventId: 'evt_01J5',
            type: 'identity.updated',
            occurredAt: '2026-08-14T10:00:00Z',
          },
        ],
        nextCursor: 'cur_01J5',
      },
    },
  }),
  ep({
    id: 'R-04',
    group: 'R — резиденты',
    milestone: 'M0',
    title: 'Профиль резидента',
    method: 'GET',
    path: `${PRIVATE}/resident-profiles/{profileId}`,
    success: { status: 200, label: '200 profile', body: PROFILE },
  }),
  ep({
    id: 'R-05',
    group: 'R — резиденты',
    milestone: 'M0',
    title: 'Изменить профиль',
    method: 'PATCH',
    path: `${PRIVATE}/resident-profiles/{profileId}`,
    headers: { ...AUTH, 'If-Match': '"2"' },
    request: {
      schemaVersion: SCHEMA,
      companyShortName: 'Пример+',
      expectedRevision: 2,
    },
    success: {
      status: 200,
      label: '200 profile',
      body: { ...PROFILE, companyShortName: 'Пример+', revision: 3 },
    },
    errors: [
      ...COMMON_AUTH_ERRORS,
      problem(412, 'PRECONDITION_FAILED', 'Precondition failed'),
    ],
  }),
  ep({
    id: 'R-06',
    group: 'R — резиденты',
    milestone: 'M0',
    title: 'Поиск профилей',
    method: 'POST',
    path: `${PRIVATE}/resident-profiles/search`,
    request: { schemaVersion: SCHEMA, query: 'Пример', limit: 20 },
    success: {
      status: 200,
      label: '200 items',
      body: { schemaVersion: SCHEMA, items: [PROFILE] },
    },
  }),
  ep({
    id: 'R-07',
    group: 'R — резиденты',
    milestone: 'M0',
    title: 'Изменить identity',
    method: 'PATCH',
    path: `${PRIVATE}/residents/{subject}/identity`,
    headers: { ...AUTH, 'If-Match': '"4"' },
    request: {
      schemaVersion: SCHEMA,
      displayName: 'Иванов И. И.',
      expectedRevision: 4,
    },
    success: {
      status: 200,
      label: '200 identity',
      body: { ...IDENTITY, displayName: 'Иванов И. И.', revision: 5 },
    },
  }),
  ep({
    id: 'R-08',
    group: 'R — резиденты',
    milestone: 'M1',
    title: 'Онбординг резидента',
    method: 'POST',
    path: `${PRIVATE}/resident-onboarding`,
    request: {
      schemaVersion: SCHEMA,
      phone: '+79990001234',
      profileType: 'company',
      legalForm: 'ooo',
      company: 'ООО Пример',
    },
    success: {
      status: 201,
      label: '201 created',
      body: {
        schemaVersion: SCHEMA,
        subject: IDENTITY.subject,
        profileId: PROFILE.id,
        membershipId: MEMBERSHIP.id,
      },
    },
  }),
  ep({
    id: 'R-09',
    group: 'R — резиденты',
    milestone: 'M1',
    title: 'Переход жизненного цикла',
    method: 'POST',
    path: `${PRIVATE}/resident-profiles/{profileId}/lifecycle-transitions`,
    headers: { ...AUTH, 'If-Match': '"2"' },
    request: { schemaVersion: SCHEMA, transition: 'suspend', reason: 'manual' },
    success: {
      status: 200,
      label: '200 profile',
      body: { ...PROFILE, status: 'suspended' },
    },
  }),
  ep({
    id: 'R-10',
    group: 'R — резиденты',
    milestone: 'M1',
    title: 'Заявка на удаление',
    method: 'POST',
    path: `${PRIVATE}/resident-profiles/{profileId}/deletion-requests`,
    request: { schemaVersion: SCHEMA, reason: 'client_request' },
    success: {
      status: 201,
      label: '201 deletion',
      body: {
        schemaVersion: SCHEMA,
        deletionRequestId: 'del_01J5',
        status: 'pending',
      },
    },
  }),
  ep({
    id: 'R-11',
    group: 'R — резиденты',
    milestone: 'M1',
    title: 'Заявка на смену профиля',
    method: 'POST',
    path: `${PRIVATE}/resident-profiles/{profileId}/change-requests`,
    request: { schemaVersion: SCHEMA, patch: { companyShortName: 'Новое' } },
    success: {
      status: 201,
      label: '201 change',
      body: {
        schemaVersion: SCHEMA,
        changeRequestId: 'crq_01J5',
        status: 'pending',
      },
    },
  }),
  ep({
    id: 'R-12',
    group: 'R — резиденты',
    milestone: 'M1',
    title: 'Текущая заявка на смену',
    method: 'GET',
    path: `${PRIVATE}/resident-profiles/{profileId}/change-requests/current`,
    success: {
      status: 200,
      label: '200 current',
      body: {
        schemaVersion: SCHEMA,
        changeRequestId: 'crq_01J5',
        status: 'pending',
      },
    },
  }),
  ep({
    id: 'R-13',
    group: 'R — резиденты',
    milestone: 'M0',
    title: 'Физический доступ',
    method: 'GET',
    path: `${PRIVATE}/resident-profiles/{profileId}/physical-access`,
    success: {
      status: 200,
      label: '200 grants',
      body: {
        schemaVersion: SCHEMA,
        items: [
          {
            grantId: 'grt_01J5Q8K2M7N4P6R9T1V3X5Z7AQ',
            profileId: PROFILE.id,
            resource: {
              type: 'office',
              id: 'off_01J5',
              mstyleLink: {
                sourceSystem: 'mstyle-wordpress',
                environment: 'prod',
                entityType: 'room',
                externalId: 'tf-room:107',
              },
            },
            permissions: ['enter', 'visitor_invite'],
            status: 'active',
            validFrom: null,
            validUntil: null,
            revision: 1,
          },
        ],
      },
    },
  }),
  ep({
    id: 'R-14',
    group: 'R — резиденты',
    milestone: 'M0',
    title: 'Identity по subject',
    method: 'GET',
    path: `${PRIVATE}/identities/{subject}`,
    success: { status: 200, label: '200 identity', body: IDENTITY },
  }),
  ep({
    id: 'R-15',
    group: 'R — резиденты',
    milestone: 'M1',
    title: 'Решение по заявке на смену',
    method: 'POST',
    path: `${PRIVATE}/resident-profile-change-requests/{changeRequestId}/decisions`,
    request: { schemaVersion: SCHEMA, decision: 'approve' },
    success: {
      status: 200,
      label: '200 decided',
      body: {
        schemaVersion: SCHEMA,
        changeRequestId: 'crq_01J5',
        status: 'approved',
      },
    },
  }),
  ep({
    id: 'R-16',
    group: 'R — резиденты',
    milestone: 'M1',
    title: 'Отмена заявки на смену',
    method: 'POST',
    path: `${PRIVATE}/resident-profile-change-requests/{changeRequestId}/cancel`,
    success: {
      status: 200,
      label: '200 cancelled',
      body: {
        schemaVersion: SCHEMA,
        changeRequestId: 'crq_01J5',
        status: 'cancelled',
      },
    },
  }),
  ep({
    id: 'R-17',
    group: 'R — резиденты',
    milestone: 'M1',
    title: 'Статус заявки на удаление',
    method: 'GET',
    path: `${PRIVATE}/deletion-requests/{deletionRequestId}`,
    success: {
      status: 200,
      label: '200 deletion',
      body: {
        schemaVersion: SCHEMA,
        deletionRequestId: 'del_01J5',
        status: 'pending',
      },
    },
  }),
  ep({
    id: 'M-01',
    group: 'M — сотрудники',
    milestone: 'M0',
    title: 'Список membership',
    method: 'GET',
    path: `${PRIVATE}/resident-profiles/{profileId}/memberships`,
    success: {
      status: 200,
      label: '200 memberships',
      body: { schemaVersion: SCHEMA, items: [MEMBERSHIP] },
    },
  }),
  ep({
    id: 'M-02',
    group: 'M — сотрудники',
    milestone: 'M0',
    title: 'Добавить сотрудника',
    method: 'POST',
    path: `${PRIVATE}/resident-profiles/{profileId}/memberships`,
    request: {
      schemaVersion: SCHEMA,
      subject: 'usr_01EMPLOYEE',
      role: 'employee',
    },
    success: {
      status: 201,
      label: '201 membership',
      body: {
        ...MEMBERSHIP,
        id: 'mem_emp',
        role: 'employee',
        status: 'invited',
      },
    },
  }),
  ep({
    id: 'M-03',
    group: 'M — сотрудники',
    milestone: 'M1',
    title: 'Изменить membership',
    method: 'PATCH',
    path: `${PRIVATE}/resident-memberships/{membershipId}`,
    request: { schemaVersion: SCHEMA, status: 'suspended' },
    success: {
      status: 200,
      label: '200 membership',
      body: { ...MEMBERSHIP, status: 'suspended' },
    },
  }),
  ep({
    id: 'M-04',
    group: 'M — сотрудники',
    milestone: 'M0',
    title: 'Отозвать membership',
    method: 'POST',
    path: `${PRIVATE}/resident-memberships/{membershipId}/revoke`,
    success: {
      status: 200,
      label: '200 revoked',
      body: { ...MEMBERSHIP, status: 'revoked' },
    },
  }),
  ep({
    id: 'M-05',
    group: 'M — сотрудники',
    milestone: 'M1',
    title: 'Передать владельца',
    method: 'POST',
    path: `${PRIVATE}/resident-profiles/{profileId}/owner-transfer`,
    request: { schemaVersion: SCHEMA, toSubject: 'usr_01NEWOWNER' },
    success: {
      status: 200,
      label: '200 transferred',
      body: {
        schemaVersion: SCHEMA,
        profileId: PROFILE.id,
        ownerSubject: 'usr_01NEWOWNER',
      },
    },
  }),
  ep({
    id: 'C-01',
    group: 'C — контакты',
    milestone: 'M0',
    title: 'Challenge контакта',
    method: 'POST',
    path: `${PRIVATE}/residents/{subject}/contacts/challenges`,
    request: { schemaVersion: SCHEMA, type: 'phone', value: '+79990001234' },
    success: {
      status: 202,
      label: '202 challenge',
      body: {
        schemaVersion: SCHEMA,
        challengeId: 'cch_01J5',
        status: 'awaiting_code',
      },
    },
  }),
  ep({
    id: 'C-02',
    group: 'C — контакты',
    milestone: 'M0',
    title: 'Подтвердить контакт',
    method: 'POST',
    path: `${PRIVATE}/residents/{subject}/contacts/challenges/{challengeId}/verify`,
    request: { schemaVersion: SCHEMA, code: '1234' },
    success: {
      status: 200,
      label: '200 verified',
      body: {
        schemaVersion: SCHEMA,
        contactId: 'cnt_01J5',
        type: 'phone',
        masked: '+7 ••• •••-12-34',
        verifiedAt: '2026-08-14T10:00:00Z',
      },
    },
  }),
  ep({
    id: 'C-03',
    group: 'C — контакты',
    milestone: 'M0',
    title: 'Назначения контактов',
    method: 'GET',
    path: `${PRIVATE}/resident-profiles/{profileId}/contact-assignments`,
    success: {
      status: 200,
      label: '200 assignments',
      body: {
        schemaVersion: SCHEMA,
        phoneContactId: 'cnt_phone',
        emailContactId: 'cnt_email',
      },
    },
  }),
  ep({
    id: 'C-04',
    group: 'C — контакты',
    milestone: 'M0',
    title: 'Заменить назначения',
    method: 'PATCH',
    path: `${PRIVATE}/resident-profiles/{profileId}/contact-assignments`,
    request: {
      schemaVersion: SCHEMA,
      phoneContactId: 'cnt_phone',
      emailContactId: 'cnt_email',
    },
    success: {
      status: 200,
      label: '200 assignments',
      body: {
        schemaVersion: SCHEMA,
        phoneContactId: 'cnt_phone',
        emailContactId: 'cnt_email',
      },
    },
  }),
  ep({
    id: 'C-05',
    group: 'C — контакты',
    milestone: 'M0',
    title: 'Раскрыть контакты identity',
    method: 'POST',
    path: `${PRIVATE}/residents/{subject}/contacts/reveal`,
    success: {
      status: 200,
      label: '200 contacts',
      body: {
        schemaVersion: SCHEMA,
        items: [
          {
            contactId: 'cnt_01J5',
            type: 'phone',
            value: '+79990001234',
            masked: '+7 ••• •••-12-34',
            verifiedAt: '2026-08-14T10:00:00Z',
            revision: 1,
          },
        ],
      },
    },
  }),
  ep({
    id: 'S-01',
    group: 'S — согласия',
    milestone: 'M0',
    title: 'Список согласий',
    method: 'GET',
    path: `${PRIVATE}/residents/{subject}/consents`,
    success: {
      status: 200,
      label: '200 consents',
      body: {
        schemaVersion: SCHEMA,
        items: [
          {
            documentCode: 'pdn',
            documentVersion: '1.0',
            documentDigest: 'sha256:abc',
            documentUrl: 'https://example.test/pdn',
            locale: 'ru',
            status: 'required',
            revision: 1,
            acceptedAt: null,
            withdrawnAt: null,
            auditRef: null,
          },
        ],
      },
    },
  }),
  ep({
    id: 'S-02',
    group: 'S — согласия',
    milestone: 'M0',
    title: 'Принять согласие',
    method: 'POST',
    path: `${PRIVATE}/residents/{subject}/consents/{documentCode}/accept`,
    request: {
      schemaVersion: SCHEMA,
      documentVersion: '1.0',
      documentDigest: 'sha256:abc',
    },
    success: {
      status: 200,
      label: '200 accepted',
      body: {
        schemaVersion: SCHEMA,
        documentCode: 'pdn',
        status: 'accepted',
        acceptedAt: '2026-08-14T10:00:00Z',
      },
    },
  }),
  ep({
    id: 'S-03',
    group: 'S — согласия',
    milestone: 'M0',
    title: 'Отозвать согласие',
    method: 'POST',
    path: `${PRIVATE}/residents/{subject}/consents/{documentCode}/withdraw`,
    success: {
      status: 200,
      label: '200 withdrawn',
      body: {
        schemaVersion: SCHEMA,
        documentCode: 'pdn',
        status: 'withdrawn',
        withdrawnAt: '2026-08-14T10:00:00Z',
      },
    },
  }),
  ep({
    id: 'P-01',
    group: 'P — private data',
    milestone: 'M0',
    title: 'Статус анкеты',
    method: 'GET',
    path: `${PRIVATE}/resident-profiles/{profileId}/private-data/status`,
    success: {
      status: 200,
      label: '200 status',
      body: {
        schemaVersion: SCHEMA,
        partyType: 'resident_profile',
        partyId: PROFILE.id,
        profileType: 'company',
        legalForm: 'ooo',
        exists: true,
        revision: 1,
        complete: true,
        missingFieldCodes: [],
        editPolicy: 'self_service',
        updatedAt: '2026-08-14T10:00:00Z',
      },
    },
  }),
  ep({
    id: 'P-02',
    group: 'P — private data',
    milestone: 'M0',
    title: 'Раскрыть анкету',
    method: 'POST',
    path: `${PRIVATE}/resident-profiles/{profileId}/private-data/reveal`,
    request: { schemaVersion: SCHEMA, fieldCodes: ['inn', 'ogrn'] },
    success: {
      status: 200,
      label: '200 fields',
      body: {
        schemaVersion: SCHEMA,
        fields: { inn: '7700000000', ogrn: '1027700000000' },
      },
    },
  }),
  ep({
    id: 'P-03',
    group: 'P — private data',
    milestone: 'M0',
    title: 'Изменить анкету',
    method: 'PATCH',
    path: `${PRIVATE}/resident-profiles/{profileId}/private-data`,
    request: { schemaVersion: SCHEMA, fields: { inn: '7700000001' } },
    success: {
      status: 200,
      label: '200 patched',
      body: { schemaVersion: SCHEMA, revision: 2, complete: true },
    },
  }),
  ep({
    id: 'P-04',
    group: 'P — private data',
    milestone: 'M0',
    title: 'Снимок анкеты',
    method: 'POST',
    path: `${PRIVATE}/resident-profiles/{profileId}/private-data/snapshots`,
    success: { status: 201, label: '201 snapshot', body: SNAPSHOT },
  }),
  ep({
    id: 'P-05',
    group: 'P — private data',
    milestone: 'M0',
    title: 'Раскрыть контакты профиля',
    method: 'POST',
    path: `${PRIVATE}/resident-profiles/{profileId}/contacts/reveal`,
    success: {
      status: 200,
      label: '200 contacts',
      body: {
        schemaVersion: SCHEMA,
        items: [{ type: 'email', value: 'office@example.test' }],
      },
    },
  }),
  ep({
    id: 'P-06',
    group: 'P — private data',
    milestone: 'M0',
    title: 'Раскрыть снимок',
    method: 'POST',
    path: `${PRIVATE}/private-data-snapshots/{snapshotId}/reveal`,
    request: { schemaVersion: SCHEMA, fieldCodes: ['inn'] },
    success: {
      status: 200,
      label: '200 fields',
      body: {
        schemaVersion: SCHEMA,
        snapshotId: SNAPSHOT.snapshotId,
        fields: { inn: '7700000000' },
      },
    },
  }),
  ep({
    id: 'P-07',
    group: 'P — private data',
    milestone: 'M0',
    title: 'Раскрыть контакты снимка',
    method: 'POST',
    path: `${PRIVATE}/private-data-snapshots/{snapshotId}/contacts/reveal`,
    success: {
      status: 200,
      label: '200 contacts',
      body: {
        schemaVersion: SCHEMA,
        items: [{ type: 'phone', value: '+79990001234' }],
      },
    },
  }),
  ep({
    id: 'P-08',
    group: 'P — private data',
    milestone: 'M1',
    title: 'Привязать снимок к операции',
    method: 'POST',
    path: `${PRIVATE}/private-data-snapshots/{snapshotId}/operation-bindings`,
    request: {
      schemaVersion: SCHEMA,
      operationType: 'pass_issue',
      operationId: 'pass_01J5',
    },
    success: {
      status: 200,
      label: '200 bound',
      body: {
        schemaVersion: SCHEMA,
        snapshotId: SNAPSHOT.snapshotId,
        operationId: 'pass_01J5',
      },
    },
  }),
  ep({
    id: 'G-01',
    group: 'G — гости',
    milestone: 'M0',
    title: 'Создать гостя',
    method: 'POST',
    path: `${PRIVATE}/guest-parties`,
    request: {
      schemaVersion: SCHEMA,
      visitorName: 'Петров Пётр',
      visitDate: '2026-08-20',
    },
    success: { status: 201, label: '201 guest', body: GUEST },
  }),
  ep({
    id: 'G-02',
    group: 'G — гости',
    milestone: 'M0',
    title: 'Challenge контакта гостя',
    method: 'POST',
    path: `${PRIVATE}/guest-parties/{guestPartyId}/contact-challenges`,
    request: { schemaVersion: SCHEMA, type: 'phone', value: '+79990005555' },
    success: {
      status: 202,
      label: '202 challenge',
      body: {
        schemaVersion: SCHEMA,
        challengeId: 'gch_01J5',
        status: 'awaiting_code',
      },
    },
  }),
  ep({
    id: 'G-03',
    group: 'G — гости',
    milestone: 'M0',
    title: 'Подтвердить контакт гостя',
    method: 'POST',
    path: `${PRIVATE}/guest-parties/{guestPartyId}/contact-challenges/{challengeId}/verify`,
    request: { schemaVersion: SCHEMA, code: '1234' },
    success: {
      status: 200,
      label: '200 verified',
      body: { schemaVersion: SCHEMA, contactId: 'gct_01J5', type: 'phone' },
    },
  }),
  ep({
    id: 'G-04',
    group: 'G — гости',
    milestone: 'M0',
    title: 'Статус гостя',
    method: 'GET',
    path: `${PRIVATE}/guest-parties/{guestPartyId}/status`,
    success: { status: 200, label: '200 status', body: GUEST },
  }),
  ep({
    id: 'G-05',
    group: 'G — гости',
    milestone: 'M0',
    title: 'Раскрыть контакты гостя',
    method: 'POST',
    path: `${PRIVATE}/guest-parties/{guestPartyId}/contacts/reveal`,
    success: {
      status: 200,
      label: '200 contacts',
      body: {
        schemaVersion: SCHEMA,
        items: [{ type: 'phone', value: '+79990005555' }],
      },
    },
  }),
  ep({
    id: 'G-06',
    group: 'G — гости',
    milestone: 'M0',
    title: 'Статус анкеты гостя',
    method: 'GET',
    path: `${PRIVATE}/guest-parties/{guestPartyId}/private-data/status`,
    success: {
      status: 200,
      label: '200 status',
      body: {
        schemaVersion: SCHEMA,
        partyType: 'guest_party',
        partyId: GUEST.guestPartyId,
        profileType: 'individual',
        exists: false,
        revision: null,
        complete: false,
        missingFieldCodes: ['passport'],
      },
    },
  }),
  ep({
    id: 'G-07',
    group: 'G — гости',
    milestone: 'M0',
    title: 'Раскрыть анкету гостя',
    method: 'POST',
    path: `${PRIVATE}/guest-parties/{guestPartyId}/private-data/reveal`,
    request: { schemaVersion: SCHEMA, fieldCodes: ['passport'] },
    success: {
      status: 200,
      label: '200 fields',
      body: { schemaVersion: SCHEMA, fields: { passport: '4510 123456' } },
    },
  }),
  ep({
    id: 'G-08',
    group: 'G — гости',
    milestone: 'M0',
    title: 'Изменить анкету гостя',
    method: 'PATCH',
    path: `${PRIVATE}/guest-parties/{guestPartyId}/private-data`,
    request: { schemaVersion: SCHEMA, fields: { passport: '4510 123456' } },
    success: {
      status: 200,
      label: '200 patched',
      body: { schemaVersion: SCHEMA, revision: 1, complete: true },
    },
  }),
  ep({
    id: 'G-09',
    group: 'G — гости',
    milestone: 'M0',
    title: 'Снимок гостя',
    method: 'POST',
    path: `${PRIVATE}/guest-parties/{guestPartyId}/snapshots`,
    success: {
      status: 201,
      label: '201 snapshot',
      body: { ...SNAPSHOT, partyId: GUEST.guestPartyId },
    },
  }),
  ep({
    id: 'G-10',
    group: 'G — гости',
    milestone: 'M0',
    title: 'Подтвердить бронь',
    method: 'POST',
    path: `${PRIVATE}/guest-parties/{guestPartyId}/booking-confirmations`,
    request: {
      schemaVersion: SCHEMA,
      visitDate: '2026-08-20',
      officeExternalId: 'tf-room:107',
    },
    success: {
      status: 200,
      label: '200 booked',
      body: { ...GUEST, status: 'confirmed' },
    },
  }),
  ep({
    id: 'G-11',
    group: 'G — гости',
    milestone: 'M1',
    title: 'Присвоить гостя резиденту',
    method: 'POST',
    path: `${PRIVATE}/guest-parties/{guestPartyId}/claim`,
    request: { schemaVersion: SCHEMA, subject: IDENTITY.subject },
    success: {
      status: 200,
      label: '200 claimed',
      body: { ...GUEST, status: 'claimed' },
    },
  }),
  ep({
    id: 'G-12',
    group: 'G — гости',
    milestone: 'M0',
    title: 'Поиск гостей',
    method: 'POST',
    path: `${PRIVATE}/guest-parties/search`,
    request: { schemaVersion: SCHEMA, query: 'Петров', limit: 20 },
    success: {
      status: 200,
      label: '200 items',
      body: { schemaVersion: SCHEMA, items: [GUEST] },
    },
  }),
  ep({
    id: 'G-13',
    group: 'G — гости',
    milestone: 'M0',
    title: 'Согласия гостя',
    method: 'GET',
    path: `${PRIVATE}/guest-parties/{guestPartyId}/consents`,
    success: {
      status: 200,
      label: '200 consents',
      body: { schemaVersion: SCHEMA, items: [] },
    },
  }),
  ep({
    id: 'G-14',
    group: 'G — гости',
    milestone: 'M0',
    title: 'Принять согласие гостя',
    method: 'POST',
    path: `${PRIVATE}/guest-parties/{guestPartyId}/consents/{documentCode}/accept`,
    request: {
      schemaVersion: SCHEMA,
      documentVersion: '1.0',
      documentDigest: 'sha256:abc',
    },
    success: {
      status: 200,
      label: '200 accepted',
      body: {
        schemaVersion: SCHEMA,
        documentCode: 'guest_pdn',
        status: 'accepted',
      },
    },
  }),
  ep({
    id: 'G-15',
    group: 'G — гости',
    milestone: 'M0',
    title: 'Отозвать согласие гостя',
    method: 'POST',
    path: `${PRIVATE}/guest-parties/{guestPartyId}/consents/{documentCode}/withdraw`,
    success: {
      status: 200,
      label: '200 withdrawn',
      body: {
        schemaVersion: SCHEMA,
        documentCode: 'guest_pdn',
        status: 'withdrawn',
      },
    },
  }),
];

const ADMIN = {
  ...AUTH,
  'X-Actor-Ref': 'wp-admin:42',
  'X-Admin-Step-Up-Assertion': '{signed_admin_assertion}',
};
const ADMIN_REVIEW = {
  ...ADMIN,
  'X-Purpose-Code': 'admin_support_review',
};
const RESIDENT = {
  ...AUTH,
  'X-Resident-Subject': IDENTITY.subject,
  'X-Actor-Ref': `resident:${IDENTITY.subject}`,
  'X-Step-Up-Authentication-ID': 'aut_01J5Q8K2M7N4P6R9T1V3X5Z7A1',
};
const DELIVERY = {
  ...AUTH,
  'X-Actor-Ref': 'system:delivery',
  'X-Purpose-Code': 'booking_document_render',
};
const OPERATION_REF = {
  sourceSystem: 'mstyle',
  environment: 'production',
  operationType: 'booking',
  operationId: 'booking:107',
};

type M1M2CatalogOverride = {
  path?: string;
  headers?: Record<string, string>;
  request?: unknown;
};

/** Final M1/M2 contract overlays the older 58-route draft catalog. */
const M1_M2_CATALOG_OVERRIDES: Record<string, M1M2CatalogOverride> = {
  'A-02': {
    path: `${PRIVATE}/auth/residents/password:verify`,
    headers: IDEM,
  },
  'R-03': {
    path: `${PRIVATE}/changes?after={cursor}&limit=100`,
    headers: { ...AUTH, 'X-Actor-Ref': 'system:reconcile' },
  },
  'R-06': {
    headers: ADMIN_REVIEW,
    request: {
      schemaVersion: SCHEMA,
      cursor: null,
      limit: 100,
      sort: { field: 'updatedAt', direction: 'desc' },
      query: { type: 'email', value: 'ninzak@ya.ru' },
    },
  },
  'R-08': {
    headers: {
      ...ADMIN,
      'X-Purpose-Code': 'resident_onboarding',
      'Idempotency-Key': 'idem_01TESTKEY',
    },
    request: {
      schemaVersion: SCHEMA,
      owner: {
        invitation: {
          displayName: 'Вадим тест',
          phone: '+79990001234',
          email: 'ninzak@ya.ru',
        },
      },
      profile: {
        type: 'company',
        legalForm: 'ooo',
        label: 'Вадим тест',
        companyShortName: 'Вадим тест',
        memberPolicy: { employeeLimit: 5 },
      },
      privateData: {
        profileType: 'company',
        legalForm: 'ooo',
        data: {
          fullName: 'Вадим тест',
          inn: '7700000000',
          kpp: '770001001',
          ogrn: '1027700000000',
          legalAddress: 'Москва',
          actualAddress: 'Москва',
          generalDirector: 'Вадим тест',
        },
      },
      initialContactAssignments: [
        {
          purpose: 'primary',
          source: {
            kind: 'owner_invitation_contact',
            contactType: 'email',
          },
          priority: 1,
        },
      ],
      sourceLink: {
        sourceSystem: 'mstyle-wordpress',
        environment: 'production',
        entityType: 'resident',
        externalId: 'mstyle-user:107',
      },
    },
  },
  'R-09': {
    headers: {
      ...ADMIN,
      'If-Match': '"profile-2"',
      'Idempotency-Key': 'idem_01TESTKEY',
    },
    request: {
      schemaVersion: SCHEMA,
      targetStatus: 'suspended',
      reasonCode: 'admin_suspension',
    },
  },
  'R-10': {
    headers: {
      ...ADMIN,
      'If-Match': '"profile-2"',
      'Idempotency-Key': 'idem_01TESTKEY',
    },
    request: {
      schemaVersion: SCHEMA,
      mode: 'anonymize',
      reasonCode: 'resident_request',
    },
  },
  'R-11': {
    headers: {
      ...RESIDENT,
      'X-Purpose-Code': 'profile_change_request',
      'If-Match': '"profile-2"',
      'Idempotency-Key': 'idem_01TESTKEY',
    },
    request: {
      schemaVersion: SCHEMA,
      reasonCode: 'requisites_update',
      expectedPrivateDataRevision: 1,
      privateData: {
        profileType: 'company',
        legalForm: 'ooo',
        data: { legalAddress: 'Новый адрес' },
      },
    },
  },
  'R-12': { headers: RESIDENT },
  'R-13': { headers: RESIDENT },
  'R-14': { headers: ADMIN },
  'R-15': {
    headers: {
      ...ADMIN_REVIEW,
      'If-Match': '"change-request-1"',
      'Idempotency-Key': 'idem_01TESTKEY',
    },
    request: {
      schemaVersion: SCHEMA,
      decision: 'approve',
      reasonCode: 'documents_verified',
    },
  },
  'R-16': {
    headers: {
      ...RESIDENT,
      'If-Match': '"change-request-1"',
      'Idempotency-Key': 'idem_01TESTKEY',
    },
    request: { schemaVersion: SCHEMA, reasonCode: 'author_cancelled' },
  },
  'R-17': { headers: ADMIN },
  'M-03': {
    headers: {
      ...RESIDENT,
      'If-Match': '"memberships-2"',
      'Idempotency-Key': 'idem_01TESTKEY',
    },
    request: {
      schemaVersion: SCHEMA,
      status: 'suspended',
      validFrom: null,
      validUntil: null,
      reasonCode: 'temporary_suspension',
    },
  },
  'M-04': {
    headers: {
      ...RESIDENT,
      'If-Match': '"memberships-2"',
      'Idempotency-Key': 'idem_01TESTKEY',
    },
    request: {
      schemaVersion: SCHEMA,
      reasonCode: 'owner_removed_employee',
    },
  },
  'M-05': {
    headers: { ...RESIDENT, 'Idempotency-Key': 'idem_01TESTKEY' },
    request: {
      schemaVersion: SCHEMA,
      newOwnerSubject: 'usr_01NEWOWNER',
      expectedProfileRevision: 2,
      expectedMembershipSetRevision: 2,
      reasonCode: 'owner_transfer',
    },
  },
  'P-05': {
    headers: { ...RESIDENT, 'X-Purpose-Code': 'account_profile_view' },
    request: {
      schemaVersion: SCHEMA,
      contactPurpose: 'primary',
      fieldCodes: ['displayName', 'phone', 'email'],
    },
  },
  'P-06': {
    headers: DELIVERY,
    request: {
      schemaVersion: SCHEMA,
      operationRef: OPERATION_REF,
      fieldCodes: ['company.fullName', 'company.inn'],
    },
  },
  'P-07': {
    headers: DELIVERY,
    request: {
      schemaVersion: SCHEMA,
      operationRef: OPERATION_REF,
      fieldCodes: ['displayName', 'phone', 'email'],
    },
  },
  'G-05': {
    headers: ADMIN_REVIEW,
    request: { schemaVersion: SCHEMA, fieldCodes: ['phone', 'email'] },
  },
  'G-07': {
    headers: ADMIN_REVIEW,
    request: {
      schemaVersion: SCHEMA,
      fieldCodes: ['displayName', 'individual.inn'],
    },
  },
  'G-11': {
    headers: { ...RESIDENT, 'Idempotency-Key': 'idem_01TESTKEY' },
    request: {
      schemaVersion: SCHEMA,
      profileId: PROFILE.id,
      expectedGuestPartyRevision: 4,
    },
  },
  'G-12': {
    headers: ADMIN_REVIEW,
    request: {
      schemaVersion: SCHEMA,
      cursor: null,
      limit: 100,
      sort: { field: 'updatedAt', direction: 'desc' },
      query: { type: 'email', value: 'ninzak@ya.ru' },
    },
  },
};

/**
 * Каталог и фактический dev/mock-режим используют один набор ответов.
 * Это не даёт примерам в админке разойтись с тем, что получает Mstyle.
 */
export const MSTYLE_V2_CATALOG: CatalogEndpoint[] = MSTYLE_V2_CATALOG_BASE.map(
  (endpoint) => {
    const contract = M1_M2_CATALOG_OVERRIDES[endpoint.id] || {};
    const mock = createMstyleMockResponse({ id: endpoint.id });
    return {
      ...endpoint,
      ...contract,
      headers: contract.headers || endpoint.headers,
      milestone:
        MSTYLE_MOCK_MILESTONES[
          endpoint.id as keyof typeof MSTYLE_MOCK_MILESTONES
        ] || endpoint.milestone,
      success: {
        ...endpoint.success,
        status: mock.status,
        label: `${mock.status} mock`,
        body: mock.body,
      },
    };
  },
);

export function mstyleCatalogMeta() {
  return {
    title: 'Pass ↔ Mstyle v2',
    privateBase: PRIVATE,
    tokenUrl: '/api/oauth2/token',
    schemaVersion: SCHEMA,
    count: MSTYLE_V2_CATALOG.length,
    groups: [...new Set(MSTYLE_V2_CATALOG.map((item) => item.group))],
  };
}
