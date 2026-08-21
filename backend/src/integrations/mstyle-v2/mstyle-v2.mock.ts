export type MstyleMockMilestone = 'M0' | 'M1' | 'M2';

export type MstyleMockInput = {
  id: string;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
};

export type MstyleMockResponse = {
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
};

const SCHEMA_VERSION = '2.0';
const NOW = '2026-08-14T10:00:00Z';
const UPDATED_AT = '2026-08-14T10:03:00Z';
const EXPIRES_AT = '2026-08-14T10:30:00Z';

export const MOCK_SUBJECT = 'usr_01J5Q8K2M7N4P6R9T1V3X5Z7AA';
export const MOCK_EMPLOYEE_SUBJECT = 'usr_01J5Q8K2M7N4P6R9T1V3X5Z7AB';
export const MOCK_PROFILE_ID = 'prf_01J5Q8K2M7N4P6R9T1V3X5Z7BB';
export const MOCK_OWNER_MEMBERSHIP_ID = 'mem_01J5Q8K2M7N4P6R9T1V3X5Z7CC';
export const MOCK_EMPLOYEE_MEMBERSHIP_ID = 'mem_01J5Q8K2M7N4P6R9T1V3X5Z7CD';
export const MOCK_CONTACT_ID = 'cnt_01J5Q8K2M7N4P6R9T1V3X5Z7CE';
export const MOCK_CONTACT_CHALLENGE_ID = 'cch_01J5Q8K2M7N4P6R9T1V3X5Z7CF';
export const MOCK_AUTH_CHALLENGE_ID = 'ach_01J5Q8K2M7N4P6R9T1V3X5Z7A2';
export const MOCK_SNAPSHOT_ID = 'snp_01J5Q8K2M7N4P6R9T1V3X5Z7DD';
export const MOCK_GUEST_ID = 'gst_01J5Q8K2M7N4P6R9T1V3X5Z7EE';
export const MOCK_GUEST_SNAPSHOT_ID = 'snp_01J5Q8K2M7N4P6R9T1V3X5Z7EF';
export const MOCK_GUEST_CHALLENGE_ID = 'gch_01J5Q8K2M7N4P6R9T1V3X5Z7EG';
export const MOCK_CHANGE_REQUEST_ID = 'crq_01J5Q8K2M7N4P6R9T1V3X5Z7FG';
export const MOCK_DELETION_REQUEST_ID = 'del_01J5Q8K2M7N4P6R9T1V3X5Z7FH';

export const MSTYLE_MOCK_ENDPOINT_IDS = [
  'A-01',
  'A-02',
  'A-03',
  'A-04',
  'A-05',
  'A-06',
  'R-01',
  'R-03',
  'R-04',
  'R-05',
  'R-06',
  'R-07',
  'R-08',
  'R-09',
  'R-10',
  'R-11',
  'R-12',
  'R-13',
  'R-14',
  'R-15',
  'R-16',
  'R-17',
  'M-01',
  'M-02',
  'M-03',
  'M-04',
  'M-05',
  'C-01',
  'C-02',
  'C-03',
  'C-04',
  'C-05',
  'S-01',
  'S-02',
  'S-03',
  'P-01',
  'P-02',
  'P-03',
  'P-04',
  'P-05',
  'P-06',
  'P-07',
  'P-08',
  'G-01',
  'G-02',
  'G-03',
  'G-04',
  'G-05',
  'G-06',
  'G-07',
  'G-08',
  'G-09',
  'G-10',
  'G-11',
  'G-12',
  'G-13',
  'G-14',
  'G-15',
] as const;

export const MSTYLE_MOCK_MILESTONES: Record<
  (typeof MSTYLE_MOCK_ENDPOINT_IDS)[number],
  MstyleMockMilestone
> = {
  'A-01': 'M0',
  'A-02': 'M1',
  'A-03': 'M0',
  'A-04': 'M0',
  'A-05': 'M0',
  'A-06': 'M0',
  'R-01': 'M0',
  'R-03': 'M2',
  'R-04': 'M0',
  'R-05': 'M0',
  'R-06': 'M1',
  'R-07': 'M0',
  'R-08': 'M1',
  'R-09': 'M1',
  'R-10': 'M2',
  'R-11': 'M1',
  'R-12': 'M1',
  'R-13': 'M1',
  'R-14': 'M1',
  'R-15': 'M1',
  'R-16': 'M1',
  'R-17': 'M2',
  'M-01': 'M0',
  'M-02': 'M0',
  'M-03': 'M1',
  'M-04': 'M1',
  'M-05': 'M1',
  'C-01': 'M0',
  'C-02': 'M0',
  'C-03': 'M0',
  'C-04': 'M0',
  'C-05': 'M0',
  'S-01': 'M0',
  'S-02': 'M0',
  'S-03': 'M0',
  'P-01': 'M0',
  'P-02': 'M0',
  'P-03': 'M0',
  'P-04': 'M0',
  'P-05': 'M1',
  'P-06': 'M1',
  'P-07': 'M1',
  'P-08': 'M0',
  'G-01': 'M0',
  'G-02': 'M0',
  'G-03': 'M0',
  'G-04': 'M0',
  'G-05': 'M1',
  'G-06': 'M0',
  'G-07': 'M1',
  'G-08': 'M0',
  'G-09': 'M0',
  'G-10': 'M0',
  'G-11': 'M2',
  'G-12': 'M1',
  'G-13': 'M0',
  'G-14': 'M0',
  'G-15': 'M0',
};

const SAFE_IDENTITY = {
  subject: MOCK_SUBJECT,
  identityStatus: 'active',
  authVersion: 3,
  revision: 4,
  displayName: 'Иванов Иван Иванович',
  name: {
    lastName: 'Иванов',
    firstName: 'Иван',
    middleName: 'Иванович',
  },
  contactMasks: [
    { type: 'phone', masked: '+7******1234' },
    { type: 'email', masked: 'i***@example.test' },
  ],
};

const SAFE_PROFILE = {
  id: MOCK_PROFILE_ID,
  type: 'company',
  legalForm: 'ooo',
  status: 'active',
  label: 'ООО «Пример»',
  companyShortName: 'Пример',
  revision: 2,
  privateDataRevision: 1,
  privateDataComplete: true,
  memberPolicy: { employeeLimit: 10 },
  sourceLinks: [
    {
      sourceSystem: 'mstyle-wordpress',
      environment: 'staging',
      entityType: 'resident_profile',
      sourceId: 'resident-107',
      linkedAt: NOW,
    },
  ],
  createdAt: '2026-08-01T10:00:00Z',
  updatedAt: UPDATED_AT,
};

const OWNER_MEMBERSHIP = {
  id: MOCK_OWNER_MEMBERSHIP_ID,
  subject: MOCK_SUBJECT,
  profileId: MOCK_PROFILE_ID,
  role: 'owner',
  status: 'active',
  validFrom: '2026-08-01T10:00:00Z',
  validUntil: null,
  revision: 2,
};

const EMPLOYEE_MEMBERSHIP = {
  id: MOCK_EMPLOYEE_MEMBERSHIP_ID,
  subject: MOCK_EMPLOYEE_SUBJECT,
  profileId: MOCK_PROFILE_ID,
  role: 'employee',
  status: 'active',
  validFrom: NOW,
  validUntil: null,
  revision: 1,
};

const CONTACT = {
  contactId: MOCK_CONTACT_ID,
  type: 'phone',
  value: '+79990001234',
  masked: '+7******1234',
  verifiedAt: NOW,
  revision: 1,
};

const ASSIGNMENT = {
  assignmentId: 'asn_01J5Q8K2M7N4P6R9T1V3X5Z7CJ',
  purpose: 'primary',
  subject: MOCK_SUBJECT,
  contactId: MOCK_CONTACT_ID,
  contactType: 'phone',
  contactMask: '+7******1234',
  contactVerified: true,
  priority: 1,
  status: 'active',
  revision: 1,
};

const ACCESS_GRANT = {
  grantId: 'acc_01J5Q8K2M7N4P6R9T1V3X5Z7CK',
  profileId: MOCK_PROFILE_ID,
  resource: {
    type: 'office',
    id: 'off_01J5Q8K2M7N4P6R9T1V3X5Z7CL',
    mstyleLink: {
      sourceSystem: 'mstyle-wordpress',
      environment: 'staging',
      entityType: 'room',
      externalId: 'tf-room:107',
    },
  },
  permissions: ['enter', 'exit', 'visitor_invite'],
  status: 'active',
  validFrom: '2026-08-01T00:00:00Z',
  validUntil: null,
  revision: 1,
};

const RESIDENT_SOURCE_REVISIONS = {
  profile: 2,
  profileContactAssignments: { phone: 1, email: 1 },
  contactIdentity: 4,
  identityContacts: { phone: 1, email: 1 },
  privateData: 1,
};

const GUEST_SOURCE_REVISIONS = {
  guestParty: 4,
  guestContacts: { phone: null, email: 1 },
  privateData: 1,
};

const RESIDENT_PRIVATE_VALUES: Record<string, unknown> = {
  companyFullName: 'Общество с ограниченной ответственностью «Пример»',
  companyShortName: 'ООО «Пример»',
  inn: '7700000000',
  kpp: '770001001',
  ogrn: '1027700000000',
  legalAddress: '123456, г. Москва, ул. Примерная, д. 1',
  actualAddress: '123456, г. Москва, ул. Примерная, д. 1',
  ceoName: 'Иванов Иван Иванович',
};

const GUEST_PRIVATE_VALUES: Record<string, unknown> = {
  displayName: 'Петров Пётр Петрович',
  lastName: 'Петров',
  firstName: 'Пётр',
  middleName: 'Петрович',
  birthDate: '1990-01-15',
  documentType: 'passport_rf',
  documentSeries: '4510',
  documentNumber: '123456',
};

function schema(extra: Record<string, unknown>) {
  return { schemaVersion: SCHEMA_VERSION, ...extra };
}

function eventId(suffix: string) {
  return `evt_01J5Q8K2M7N4P6R9T1V3X5${suffix}`;
}

function etag(kind: string, revision: number) {
  return { ETag: `"${kind}-${revision}"` };
}

function param(input: MstyleMockInput, name: string, fallback: string) {
  return input.params?.[name] || fallback;
}

function bodyString(input: MstyleMockInput, name: string, fallback: string) {
  const value = input.body?.[name];
  return typeof value === 'string' && value ? value : fallback;
}

function selectedValues(
  input: MstyleMockInput,
  values: Record<string, unknown>,
) {
  const codes = input.body?.fieldCodes;
  if (!Array.isArray(codes) || !codes.length) return { ...values };
  return Object.fromEntries(
    codes
      .filter((code): code is string => typeof code === 'string')
      .filter((code) => code in values)
      .map((code) => [code, values[code]]),
  );
}

function consent(input: MstyleMockInput, status: 'accepted' | 'withdrawn') {
  return {
    documentCode: param(input, 'documentCode', 'pdn'),
    documentVersion: bodyString(input, 'documentVersion', '1.0'),
    documentDigest: bodyString(input, 'documentDigest', 'sha256:mock-pdn'),
    documentUrl: bodyString(
      input,
      'documentUrl',
      'https://pass.example.test/documents/pdn/1.0',
    ),
    locale: bodyString(input, 'locale', 'ru-RU'),
    status,
    revision: status === 'accepted' ? 1 : 2,
    acceptedAt: status === 'accepted' ? NOW : NOW,
    withdrawnAt: status === 'withdrawn' ? UPDATED_AT : null,
    auditRef: eventId(status === 'accepted' ? '7CM' : '7CN'),
  };
}

function privateStatus(
  partyType: 'resident_profile' | 'guest_party',
  partyId: string,
) {
  return {
    partyType,
    partyId,
    profileType: partyType === 'resident_profile' ? 'company' : 'individual',
    ...(partyType === 'resident_profile' ? { legalForm: 'ooo' } : {}),
    exists: true,
    revision: 1,
    complete: true,
    missingFieldCodes: [],
    editPolicy: 'self_service',
    updatedAt: UPDATED_AT,
  };
}

function snapshot(
  snapshotId: string,
  partyType: 'resident_profile' | 'guest_party',
  partyId: string,
) {
  return schema({
    snapshotId,
    partyType,
    partyId,
    snapshotRevision: 1,
    contentDigest: {
      algorithm: 'HMAC-SHA-256',
      keyVersion: 1,
      value: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
    },
    eventIds: [eventId('7CP')],
    createdAt: UPDATED_AT,
    sourceRevisions:
      partyType === 'resident_profile'
        ? RESIDENT_SOURCE_REVISIONS
        : GUEST_SOURCE_REVISIONS,
  });
}

export function createMstyleMockResponse(
  input: MstyleMockInput,
): MstyleMockResponse {
  const subject = param(input, 'subject', MOCK_SUBJECT);
  const profileId = param(input, 'profileId', MOCK_PROFILE_ID);
  const membershipId = param(
    input,
    'membershipId',
    MOCK_EMPLOYEE_MEMBERSHIP_ID,
  );
  const guestPartyId = param(input, 'guestPartyId', MOCK_GUEST_ID);
  const snapshotId = param(input, 'snapshotId', MOCK_SNAPSHOT_ID);
  const changeRequestId = param(
    input,
    'changeRequestId',
    MOCK_CHANGE_REQUEST_ID,
  );
  const deletionRequestId = param(
    input,
    'deletionRequestId',
    MOCK_DELETION_REQUEST_ID,
  );
  const challengeId = param(input, 'challengeId', MOCK_AUTH_CHALLENGE_ID);

  switch (input.id) {
    case 'A-01':
      return {
        status: 200,
        body: {
          access_token: 'svc_mock_mstyle_token',
          token_type: 'Bearer',
          expires_in: 300,
          scope: 'mstyle.resident.authenticate',
        },
      };
    case 'A-02':
    case 'A-06':
      return {
        status: 200,
        body: schema({
          authenticationId: 'aut_01J5Q8K2M7N4P6R9T1V3X5Z7A3',
          subject,
          identityStatus: 'active',
          authVersion: 3,
          authenticatedAt: UPDATED_AT,
          authenticationMethod: input.id === 'A-02' ? 'password' : 'email',
        }),
      };
    case 'A-03':
    case 'A-04':
    case 'A-05': {
      const responseChallengeId =
        input.id === 'A-03' ? MOCK_AUTH_CHALLENGE_ID : challengeId;
      return {
        status: input.id === 'A-04' ? 200 : 202,
        body: schema({
          challengeId: responseChallengeId,
          status: input.id === 'A-04' ? 'awaiting_code' : 'dispatch_pending',
          channel: 'email',
          codeLength: 6,
          expiresAt:
            input.id === 'A-05'
              ? '2026-08-14T10:10:00Z'
              : '2026-08-14T10:05:00Z',
          resendAfter:
            input.id === 'A-05'
              ? '2026-08-14T10:06:00Z'
              : '2026-08-14T10:01:00Z',
          pollAfterMs: 1500,
        }),
      };
    }
    case 'R-01':
      return {
        status: 200,
        body: schema({
          subject,
          identityStatus: 'active',
          authVersion: 3,
          identityDisplay: SAFE_IDENTITY.displayName,
          profiles: [
            {
              profileId,
              membershipId: MOCK_OWNER_MEMBERSHIP_ID,
              membershipRole: 'owner',
              membershipStatus: 'active',
              profileStatus: 'active',
              profileType: 'company',
              legalForm: 'ooo',
              profileRevision: 2,
              privateDataRevision: 1,
              privateDataComplete: true,
              display: { label: SAFE_PROFILE.label },
              memberPolicy: { employeeLimit: 10 },
              snapshotSources: { primary: RESIDENT_SOURCE_REVISIONS },
            },
          ],
          physicalAccessFacts: { revision: 1, grants: [ACCESS_GRANT] },
          contextRevision: 5,
          generatedAt: UPDATED_AT,
        }),
      };
    case 'R-03':
      return {
        status: 200,
        body: schema({
          streamName: 'mstyle-resident-sync',
          items: [
            schema({
              streamName: 'mstyle-resident-sync',
              environment: 'staging',
              sequence: 42,
              eventId: eventId('7CQ'),
              type: 'profile.updated',
              occurredAt: UPDATED_AT,
              aggregate: { type: 'profile', id: profileId, revision: 2 },
              subject,
              profileId,
              payload: { changedFieldCodes: ['companyShortName'] },
            }),
          ],
          nextCursor: 'cur_00000000000000000000000042',
          hasMore: false,
          asOfSequence: 42,
          generatedAt: UPDATED_AT,
        }),
      };
    case 'R-04':
      return {
        status: 200,
        body: schema({ ...SAFE_PROFILE, id: profileId }),
        headers: etag('profile', 2),
      };
    case 'R-05':
      return {
        status: 200,
        body: schema({
          ...SAFE_PROFILE,
          id: profileId,
          revision: 3,
          contextRevision: 6,
          eventIds: [eventId('7CR')],
        }),
        headers: etag('profile', 3),
      };
    case 'R-06':
      return {
        status: 200,
        body: schema({
          items: [
            {
              profileId,
              status: 'active',
              profileType: 'company',
              legalForm: 'ooo',
              profileRevision: 2,
              privateDataRevision: 1,
              privateDataComplete: true,
              memberPolicy: { employeeLimit: 10 },
              updatedAt: UPDATED_AT,
              display: {
                label: SAFE_PROFILE.label,
                contactMasks: SAFE_IDENTITY.contactMasks,
              },
            },
          ],
          nextCursor: null,
          generatedAt: UPDATED_AT,
        }),
      };
    case 'R-07':
      return {
        status: 200,
        body: schema({
          identity: { ...SAFE_IDENTITY, subject, revision: 5 },
          identityRevision: 5,
          contextRevision: 6,
          eventIds: [eventId('7CS')],
        }),
        headers: etag('identity', 5),
      };
    case 'R-08':
      return {
        status: 201,
        body: schema({
          subject: MOCK_SUBJECT,
          profileId: MOCK_PROFILE_ID,
          ownerMembershipId: MOCK_OWNER_MEMBERSHIP_ID,
          identityRevision: 1,
          profileRevision: 1,
          membershipRevision: 1,
          assignmentSetRevision: 1,
          privateDataRevision: null,
          invitationStatus: 'invited',
          contextRevision: 1,
          eventIds: [eventId('7CT')],
        }),
        headers: etag('profile', 1),
      };
    case 'R-09':
      return {
        status: 200,
        body: schema({
          profileId,
          profileStatus: 'active',
          profileRevision: 3,
          contextRevision: 6,
          eventIds: [eventId('7CU')],
        }),
        headers: etag('profile', 3),
      };
    case 'R-10':
      return {
        status: 202,
        body: schema({
          deletionRequestId: MOCK_DELETION_REQUEST_ID,
          profileId,
          status: 'pending',
          deletionRequestRevision: 1,
          eventIds: [eventId('7CV')],
          createdAt: UPDATED_AT,
        }),
      };
    case 'R-11':
      return {
        status: 201,
        body: schema({
          changeRequestId: MOCK_CHANGE_REQUEST_ID,
          profileId,
          status: 'pending',
          changeRequestRevision: 1,
          profileRevisionAtRequest: 2,
          expiresAt: EXPIRES_AT,
          eventIds: [eventId('7CW')],
        }),
        headers: etag('change-request', 1),
      };
    case 'R-12':
      return {
        status: 200,
        body: schema({
          changeRequestId: MOCK_CHANGE_REQUEST_ID,
          profileId,
          status: 'pending',
          changeRequestRevision: 1,
          profileRevisionAtRequest: 2,
          changedFieldCodes: ['companyShortName'],
          reasonCode: 'resident_request',
          expiresAt: EXPIRES_AT,
          createdAt: UPDATED_AT,
        }),
        headers: etag('change-request', 1),
      };
    case 'R-13':
      return {
        status: 200,
        body: schema({
          profileId,
          accessFactsRevision: 1,
          grants: [{ ...ACCESS_GRANT, profileId }],
          generatedAt: UPDATED_AT,
        }),
      };
    case 'R-14':
      return {
        status: 200,
        body: schema({ identity: { ...SAFE_IDENTITY, subject } }),
      };
    case 'R-15':
      return {
        status: 200,
        body: schema({
          changeRequestId,
          status: 'approved',
          changeRequestRevision: 2,
          profileRevision: 3,
          privateDataRevision: 2,
          contextRevision: 7,
          eventIds: [eventId('7CX')],
        }),
        headers: etag('change-request', 2),
      };
    case 'R-16':
      return {
        status: 200,
        body: schema({
          changeRequestId,
          status: 'cancelled',
          changeRequestRevision: 2,
          eventIds: [eventId('7CY')],
        }),
        headers: etag('change-request', 2),
      };
    case 'R-17':
      return {
        status: 200,
        body: schema({
          deletionRequestId,
          profileId,
          status: 'pending',
          reasonCodes: ['resident_request'],
          deletionRequestRevision: 1,
          createdAt: UPDATED_AT,
          latestEventId: eventId('7CV'),
        }),
      };
    case 'M-01':
      return {
        status: 200,
        body: schema({
          profileId,
          membershipSetRevision: 2,
          policy: {
            profileRevision: 2,
            employeeLimit: 10,
            activeEmployeeCount: 1,
            canAdd: true,
          },
          items: [
            {
              membership: { ...OWNER_MEMBERSHIP, profileId },
              identityDisplay: {
                displayName: SAFE_IDENTITY.displayName,
                contactMasks: SAFE_IDENTITY.contactMasks,
              },
            },
            {
              membership: { ...EMPLOYEE_MEMBERSHIP, profileId },
              identityDisplay: {
                displayName: 'Сидоров Сидор',
                contactMasks: [{ type: 'email', masked: 's***@example.test' }],
              },
            },
          ],
          nextCursor: null,
        }),
        headers: etag('memberships', 2),
      };
    case 'M-02':
      return {
        status: 201,
        body: schema({
          membership: { ...EMPLOYEE_MEMBERSHIP, profileId, status: 'invited' },
          identityDisplay: {
            displayName: 'Сидоров Сидор',
            contactMasks: [{ type: 'email', masked: 's***@example.test' }],
          },
          invitationStatus: 'invited',
          membershipSetRevision: 3,
          contextRevisions: [
            { subject, contextRevision: 6 },
            { subject: MOCK_EMPLOYEE_SUBJECT, contextRevision: 1 },
          ],
          eventIds: [eventId('7CZ')],
        }),
        headers: etag('memberships', 3),
      };
    case 'M-03':
    case 'M-04':
      return {
        status: 200,
        body: schema({
          membership: {
            ...EMPLOYEE_MEMBERSHIP,
            id: membershipId,
            status: input.id === 'M-04' ? 'revoked' : 'active',
            revision: 2,
          },
          membershipSetRevision: 4,
          contextRevisions: [
            { subject: MOCK_EMPLOYEE_SUBJECT, contextRevision: 2 },
          ],
          eventIds: [eventId(input.id === 'M-04' ? '7D1' : '7D0')],
        }),
        headers: etag('memberships', 4),
      };
    case 'M-05':
      return {
        status: 200,
        body: schema({
          profileId,
          previousOwner: {
            ...OWNER_MEMBERSHIP,
            profileId,
            role: 'employee',
            revision: 3,
          },
          newOwner: {
            ...EMPLOYEE_MEMBERSHIP,
            profileId,
            role: 'owner',
            revision: 2,
          },
          profileRevision: 3,
          membershipSetRevision: 5,
          contextRevisions: [
            { subject, contextRevision: 7 },
            { subject: MOCK_EMPLOYEE_SUBJECT, contextRevision: 3 },
          ],
          eventIds: [eventId('7D2')],
        }),
        headers: etag('memberships', 5),
      };
    case 'C-01':
      return {
        status: 201,
        body: schema({
          challengeId: MOCK_CONTACT_CHALLENGE_ID,
          contactType: 'phone',
          displayMasked: '+7******1234',
          expectedContactValueRevision: 0,
          expiresAt: '2026-08-14T10:05:00Z',
          resendAfter: '2026-08-14T10:01:00Z',
          eventIds: [eventId('7D3')],
        }),
      };
    case 'C-02':
      return {
        status: 200,
        body: schema({
          contact: CONTACT,
          identityRevision: 5,
          contextRevision: 7,
          eventIds: [eventId('7D4')],
        }),
        headers: etag('identity', 5),
      };
    case 'C-03':
      return {
        status: 200,
        body: schema({
          profileId,
          assignmentSetRevision: 1,
          items: [{ ...ASSIGNMENT, subject, profileId }],
        }),
        headers: etag('assignments', 1),
      };
    case 'C-04':
      return {
        status: 200,
        body: schema({
          profileId,
          assignmentSetRevision: 2,
          items: [{ ...ASSIGNMENT, subject, profileId, revision: 2 }],
          contextRevision: 8,
          eventIds: [eventId('7D5')],
        }),
        headers: etag('assignments', 2),
      };
    case 'C-05':
      return {
        status: 200,
        body: schema({ subject, contacts: [CONTACT] }),
        headers: { 'Cache-Control': 'no-store, private' },
      };
    case 'S-01':
      return {
        status: 200,
        body: schema({
          subject,
          consentSetRevision: 1,
          items: [consent(input, 'accepted')],
        }),
        headers: etag('consents', 1),
      };
    case 'S-02':
    case 'S-03': {
      const accepted = input.id === 'S-02';
      return {
        status: 200,
        body: schema({
          subject,
          consentSetRevision: accepted ? 1 : 2,
          item: consent(input, accepted ? 'accepted' : 'withdrawn'),
          eventIds: [eventId(accepted ? '7D6' : '7D7')],
        }),
        headers: etag('consents', accepted ? 1 : 2),
      };
    }
    case 'P-01':
      return {
        status: 200,
        body: schema(privateStatus('resident_profile', profileId)),
      };
    case 'P-02':
      return {
        status: 200,
        body: schema({
          partyType: 'resident_profile',
          partyId: profileId,
          profileType: 'company',
          legalForm: 'ooo',
          revision: 1,
          sourceRevisions: RESIDENT_SOURCE_REVISIONS,
          values: selectedValues(input, RESIDENT_PRIVATE_VALUES),
        }),
      };
    case 'P-03':
      return {
        status: 200,
        body: schema({
          status: privateStatus('resident_profile', profileId),
          contextRevision: 9,
          eventIds: [eventId('7D8')],
        }),
        headers: etag('private', 1),
      };
    case 'P-04':
      return {
        status: 201,
        body: snapshot(MOCK_SNAPSHOT_ID, 'resident_profile', profileId),
      };
    case 'P-05':
      return {
        status: 200,
        body: schema({
          partyType: 'resident_profile',
          partyId: profileId,
          sourceRevisions: RESIDENT_SOURCE_REVISIONS,
          values: {
            displayName: SAFE_IDENTITY.displayName,
            phone: '+79990001234',
            email: 'ivanov@example.test',
          },
        }),
      };
    case 'P-06':
      return {
        status: 200,
        body: schema({
          snapshotId,
          partyType: 'resident_profile',
          partyId: profileId,
          snapshotRevision: 1,
          sourceRevisions: RESIDENT_SOURCE_REVISIONS,
          values: selectedValues(input, RESIDENT_PRIVATE_VALUES),
        }),
      };
    case 'P-07':
      return {
        status: 200,
        body: schema({
          snapshotId,
          partyType: 'resident_profile',
          partyId: profileId,
          snapshotRevision: 1,
          sourceRevisions: RESIDENT_SOURCE_REVISIONS,
          values: {
            displayName: SAFE_IDENTITY.displayName,
            phone: '+79990001234',
            email: 'ivanov@example.test',
          },
        }),
      };
    case 'P-08':
      return {
        status: 200,
        body: schema({
          bindingId: 'bnd_01J5Q8K2M7N4P6R9T1V3X5Z7D9',
          bindingRevision: 1,
          snapshotId,
          operationRef: bodyString(input, 'operationRef', 'booking:107'),
          status: 'bound',
          boundAt: UPDATED_AT,
          eventIds: [eventId('7D9')],
        }),
      };
    case 'G-01':
      return {
        status: 201,
        body: schema({
          guestPartyId: MOCK_GUEST_ID,
          revision: 1,
          expiresAt: EXPIRES_AT,
          guestFlowAccessToken: 'gft_mock_guest_flow_token',
          eventIds: [eventId('7DA')],
        }),
      };
    case 'G-02':
      return {
        status: 201,
        body: schema({
          challengeId: MOCK_GUEST_CHALLENGE_ID,
          contactType: 'email',
          displayMasked: 'g***@example.test',
          expectedContactValueRevision: 0,
          expiresAt: '2026-08-14T10:05:00Z',
          resendAfter: '2026-08-14T10:01:00Z',
          eventIds: [eventId('7DB')],
        }),
      };
    case 'G-03':
      return {
        status: 200,
        body: schema({
          guestPartyId,
          guestPartyStatus: 'contact_verified',
          guestPartyRevision: 2,
          contact: {
            contactId: 'gct_01J5Q8K2M7N4P6R9T1V3X5Z7DC',
            type: 'email',
            value: 'guest@example.test',
            masked: 'g***@example.test',
            verifiedAt: NOW,
            revision: 1,
          },
          eventIds: [eventId('7DC')],
        }),
        headers: etag('guest', 2),
      };
    case 'G-04':
      return {
        status: 200,
        body: schema({
          id: guestPartyId,
          status: 'contact_verified',
          purpose: 'booking',
          primaryContact: {
            type: 'email',
            displayMasked: 'g***@example.test',
            verifiedAt: NOW,
          },
          privateDataRevision: 1,
          revision: 3,
          expiresAt: EXPIRES_AT,
          createdAt: NOW,
          updatedAt: UPDATED_AT,
        }),
        headers: etag('guest', 3),
      };
    case 'G-05':
      return {
        status: 200,
        body: schema({
          guestPartyId,
          sourceRevisions: {
            guestContacts: GUEST_SOURCE_REVISIONS.guestContacts,
          },
          values: { email: 'guest@example.test' },
        }),
      };
    case 'G-06':
      return {
        status: 200,
        body: schema(privateStatus('guest_party', guestPartyId)),
      };
    case 'G-07':
      return {
        status: 200,
        body: schema({
          partyType: 'guest_party',
          partyId: guestPartyId,
          revision: 1,
          sourceRevisions: GUEST_SOURCE_REVISIONS,
          values: selectedValues(input, GUEST_PRIVATE_VALUES),
        }),
      };
    case 'G-08':
      return {
        status: 200,
        body: schema({
          status: privateStatus('guest_party', guestPartyId),
          guestPartyRevision: 4,
          eventIds: [eventId('7DD')],
        }),
        headers: etag('guest', 4),
      };
    case 'G-09':
      return {
        status: 201,
        body: snapshot(MOCK_GUEST_SNAPSHOT_ID, 'guest_party', guestPartyId),
      };
    case 'G-10':
      return {
        status: 200,
        body: schema({
          guestPartyId,
          status: 'booked',
          revision: 5,
          operationLink: {
            operationRef: bodyString(input, 'operationRef', 'booking:107'),
            snapshotId: bodyString(input, 'snapshotId', MOCK_GUEST_SNAPSHOT_ID),
            bindingRevision: 1,
          },
          eventIds: [eventId('7DE')],
        }),
        headers: etag('guest', 5),
      };
    case 'G-11':
      return {
        status: 200,
        body: schema({
          guestPartyId,
          status: 'claimed',
          claimedBySubject: bodyString(input, 'subject', MOCK_SUBJECT),
          claimedProfileId: bodyString(
            input,
            'claimedProfileId',
            MOCK_PROFILE_ID,
          ),
          revision: 6,
          eventIds: [eventId('7DF')],
        }),
        headers: etag('guest', 6),
      };
    case 'G-12':
      return {
        status: 200,
        body: schema({
          items: [
            {
              guestPartyId: MOCK_GUEST_ID,
              status: 'booked',
              revision: 5,
              contactMasks: [{ type: 'email', masked: 'g***@example.test' }],
            },
          ],
          nextCursor: null,
          generatedAt: UPDATED_AT,
        }),
      };
    case 'G-13':
      return {
        status: 200,
        body: schema({
          guestPartyId,
          consentSetRevision: 1,
          items: [consent(input, 'accepted')],
        }),
        headers: etag('consents', 1),
      };
    case 'G-14':
    case 'G-15': {
      const accepted = input.id === 'G-14';
      return {
        status: 200,
        body: schema({
          guestPartyId,
          consentSetRevision: accepted ? 1 : 2,
          item: consent(input, accepted ? 'accepted' : 'withdrawn'),
          eventIds: [eventId(accepted ? '7DG' : '7DH')],
        }),
        headers: etag('consents', accepted ? 1 : 2),
      };
    }
    default:
      throw new Error(`Unknown Mstyle mock endpoint: ${input.id}`);
  }
}

export type MstyleMockMatch = {
  endpoint: MstyleMockCatalogEndpoint;
  params: Record<string, string>;
};

type MstyleMockCatalogEndpoint = {
  id: string;
  method: string;
  path: string;
};

export function matchMstyleMockEndpoint(
  endpoints: MstyleMockCatalogEndpoint[],
  method: string,
  originalUrl: string,
): MstyleMockMatch | null {
  const path = originalUrl
    .split('?')[0]
    .replace(/password:verify/g, 'password-verify');
  for (const endpoint of endpoints) {
    if (endpoint.method !== method.toUpperCase()) continue;
    const names: string[] = [];
    const endpointPath = endpoint.path.split('?')[0];
    const segments = endpointPath.split('/').map((segment) => {
      const placeholder = segment.match(/^\{([^}]+)\}$/);
      if (placeholder) {
        names.push(placeholder[1]);
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    const match = path.match(new RegExp(`^${segments.join('/')}$`));
    if (!match) continue;
    return {
      endpoint,
      params: Object.fromEntries(
        names.map((name, index) => [
          name,
          decodeURIComponent(match[index + 1]),
        ]),
      ),
    };
  }
  return null;
}
