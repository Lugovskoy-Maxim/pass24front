import { firstValueFrom, of } from 'rxjs';
import { MSTYLE_V2_CATALOG } from './mstyle-v2.catalog';
import { MstyleMockResponseInterceptor } from './mstyle-v2.mock.interceptor';
import {
  createMstyleMockResponse,
  matchMstyleMockEndpoint,
  MSTYLE_MOCK_ENDPOINT_IDS,
} from './mstyle-v2.mock';
import { MstyleResult } from './mstyle-v2.problem';

const REQUIRED_TOP_LEVEL: Record<string, string[]> = {
  'A-01': ['access_token', 'token_type', 'expires_in', 'scope'],
  'A-02': [
    'schemaVersion',
    'authenticationId',
    'subject',
    'identityStatus',
    'authVersion',
    'authenticatedAt',
    'authenticationMethod',
  ],
  'A-03': [
    'schemaVersion',
    'challengeId',
    'status',
    'channel',
    'codeLength',
    'expiresAt',
    'resendAfter',
    'pollAfterMs',
  ],
  'A-04': [
    'schemaVersion',
    'challengeId',
    'status',
    'channel',
    'codeLength',
    'expiresAt',
    'resendAfter',
    'pollAfterMs',
  ],
  'A-05': [
    'schemaVersion',
    'challengeId',
    'status',
    'channel',
    'codeLength',
    'expiresAt',
    'resendAfter',
    'pollAfterMs',
  ],
  'A-06': [
    'schemaVersion',
    'authenticationId',
    'subject',
    'identityStatus',
    'authVersion',
    'authenticatedAt',
    'authenticationMethod',
  ],
  'R-01': [
    'schemaVersion',
    'subject',
    'identityStatus',
    'authVersion',
    'profiles',
    'physicalAccessFacts',
    'contextRevision',
    'generatedAt',
  ],
  'R-03': [
    'schemaVersion',
    'streamName',
    'items',
    'nextCursor',
    'hasMore',
    'asOfSequence',
    'generatedAt',
  ],
  'R-04': [
    'schemaVersion',
    'id',
    'type',
    'legalForm',
    'status',
    'label',
    'companyShortName',
    'revision',
    'privateDataRevision',
    'privateDataComplete',
    'memberPolicy',
    'sourceLinks',
    'createdAt',
    'updatedAt',
  ],
  'R-05': ['schemaVersion', 'id', 'contextRevision', 'eventIds'],
  'R-06': ['schemaVersion', 'items', 'nextCursor', 'generatedAt'],
  'R-07': [
    'schemaVersion',
    'identity',
    'identityRevision',
    'contextRevision',
    'eventIds',
  ],
  'R-08': [
    'schemaVersion',
    'subject',
    'profileId',
    'ownerMembershipId',
    'identityRevision',
    'profileRevision',
    'membershipRevision',
    'assignmentSetRevision',
    'privateDataRevision',
    'invitationStatus',
    'contextRevision',
    'eventIds',
  ],
  'R-09': [
    'schemaVersion',
    'profileId',
    'profileStatus',
    'profileRevision',
    'contextRevision',
    'eventIds',
  ],
  'R-10': [
    'schemaVersion',
    'deletionRequestId',
    'profileId',
    'status',
    'deletionRequestRevision',
    'eventIds',
    'createdAt',
  ],
  'R-11': [
    'schemaVersion',
    'changeRequestId',
    'profileId',
    'status',
    'changeRequestRevision',
    'profileRevisionAtRequest',
    'expiresAt',
    'eventIds',
  ],
  'R-12': [
    'schemaVersion',
    'changeRequestId',
    'profileId',
    'status',
    'changeRequestRevision',
    'profileRevisionAtRequest',
    'changedFieldCodes',
    'reasonCode',
    'expiresAt',
    'createdAt',
  ],
  'R-13': [
    'schemaVersion',
    'profileId',
    'accessFactsRevision',
    'grants',
    'generatedAt',
  ],
  'R-14': ['schemaVersion', 'identity'],
  'R-15': [
    'schemaVersion',
    'changeRequestId',
    'status',
    'changeRequestRevision',
    'eventIds',
  ],
  'R-16': [
    'schemaVersion',
    'changeRequestId',
    'status',
    'changeRequestRevision',
    'eventIds',
  ],
  'R-17': [
    'schemaVersion',
    'deletionRequestId',
    'profileId',
    'status',
    'reasonCodes',
    'deletionRequestRevision',
    'createdAt',
  ],
  'M-01': [
    'schemaVersion',
    'profileId',
    'membershipSetRevision',
    'policy',
    'items',
    'nextCursor',
  ],
  'M-02': [
    'schemaVersion',
    'membership',
    'identityDisplay',
    'invitationStatus',
    'membershipSetRevision',
    'contextRevisions',
    'eventIds',
  ],
  'M-03': [
    'schemaVersion',
    'membership',
    'membershipSetRevision',
    'contextRevisions',
    'eventIds',
  ],
  'M-04': [
    'schemaVersion',
    'membership',
    'membershipSetRevision',
    'contextRevisions',
    'eventIds',
  ],
  'M-05': [
    'schemaVersion',
    'profileId',
    'previousOwner',
    'newOwner',
    'profileRevision',
    'membershipSetRevision',
    'contextRevisions',
    'eventIds',
  ],
  'C-01': [
    'schemaVersion',
    'challengeId',
    'contactType',
    'displayMasked',
    'expectedContactValueRevision',
    'expiresAt',
    'resendAfter',
    'eventIds',
  ],
  'C-02': [
    'schemaVersion',
    'contact',
    'identityRevision',
    'contextRevision',
    'eventIds',
  ],
  'C-03': ['schemaVersion', 'profileId', 'assignmentSetRevision', 'items'],
  'C-04': [
    'schemaVersion',
    'profileId',
    'assignmentSetRevision',
    'items',
    'contextRevision',
    'eventIds',
  ],
  'C-05': ['schemaVersion', 'subject', 'contacts'],
  'S-01': ['schemaVersion', 'subject', 'consentSetRevision', 'items'],
  'S-02': [
    'schemaVersion',
    'subject',
    'consentSetRevision',
    'item',
    'eventIds',
  ],
  'S-03': [
    'schemaVersion',
    'subject',
    'consentSetRevision',
    'item',
    'eventIds',
  ],
  'P-01': [
    'schemaVersion',
    'partyType',
    'partyId',
    'profileType',
    'exists',
    'revision',
    'complete',
    'missingFieldCodes',
    'updatedAt',
  ],
  'P-02': [
    'schemaVersion',
    'partyType',
    'partyId',
    'profileType',
    'legalForm',
    'revision',
    'sourceRevisions',
    'values',
  ],
  'P-03': ['schemaVersion', 'status', 'contextRevision', 'eventIds'],
  'P-04': [
    'schemaVersion',
    'snapshotId',
    'partyType',
    'partyId',
    'snapshotRevision',
    'contentDigest',
    'eventIds',
    'createdAt',
    'sourceRevisions',
  ],
  'P-05': [
    'schemaVersion',
    'partyType',
    'partyId',
    'sourceRevisions',
    'values',
  ],
  'P-06': [
    'schemaVersion',
    'snapshotId',
    'partyType',
    'partyId',
    'snapshotRevision',
    'sourceRevisions',
    'values',
  ],
  'P-07': [
    'schemaVersion',
    'snapshotId',
    'partyType',
    'partyId',
    'snapshotRevision',
    'sourceRevisions',
    'values',
  ],
  'P-08': [
    'schemaVersion',
    'bindingId',
    'bindingRevision',
    'snapshotId',
    'operationRef',
    'status',
    'boundAt',
    'eventIds',
  ],
  'G-01': [
    'schemaVersion',
    'guestPartyId',
    'revision',
    'expiresAt',
    'eventIds',
  ],
  'G-02': [
    'schemaVersion',
    'challengeId',
    'contactType',
    'displayMasked',
    'expectedContactValueRevision',
    'expiresAt',
    'resendAfter',
    'eventIds',
  ],
  'G-03': [
    'schemaVersion',
    'guestPartyId',
    'guestPartyStatus',
    'guestPartyRevision',
    'contact',
    'eventIds',
  ],
  'G-04': [
    'schemaVersion',
    'id',
    'status',
    'purpose',
    'privateDataRevision',
    'revision',
    'expiresAt',
    'createdAt',
    'updatedAt',
  ],
  'G-05': ['schemaVersion', 'guestPartyId', 'sourceRevisions', 'values'],
  'G-06': [
    'schemaVersion',
    'partyType',
    'partyId',
    'profileType',
    'exists',
    'revision',
    'complete',
    'missingFieldCodes',
    'updatedAt',
  ],
  'G-07': [
    'schemaVersion',
    'partyType',
    'partyId',
    'revision',
    'sourceRevisions',
    'values',
  ],
  'G-08': ['schemaVersion', 'status', 'guestPartyRevision', 'eventIds'],
  'G-09': [
    'schemaVersion',
    'snapshotId',
    'partyType',
    'partyId',
    'snapshotRevision',
    'contentDigest',
    'eventIds',
    'createdAt',
    'sourceRevisions',
  ],
  'G-10': [
    'schemaVersion',
    'guestPartyId',
    'status',
    'revision',
    'operationLink',
    'eventIds',
  ],
  'G-11': [
    'schemaVersion',
    'guestPartyId',
    'status',
    'claimedBySubject',
    'claimedProfileId',
    'revision',
    'eventIds',
  ],
  'G-12': ['schemaVersion', 'items', 'nextCursor', 'generatedAt'],
  'G-13': ['schemaVersion', 'guestPartyId', 'consentSetRevision', 'items'],
  'G-14': [
    'schemaVersion',
    'guestPartyId',
    'consentSetRevision',
    'item',
    'eventIds',
  ],
  'G-15': [
    'schemaVersion',
    'guestPartyId',
    'consentSetRevision',
    'item',
    'eventIds',
  ],
};

describe('Mstyle v2 contract mocks', () => {
  it('covers all 58 contract endpoints exactly once', () => {
    expect(MSTYLE_MOCK_ENDPOINT_IDS).toHaveLength(58);
    expect(new Set(MSTYLE_MOCK_ENDPOINT_IDS).size).toBe(58);
    expect(MSTYLE_V2_CATALOG).toHaveLength(58);
    expect(MSTYLE_V2_CATALOG.map((item) => item.id).sort()).toEqual(
      [...MSTYLE_MOCK_ENDPOINT_IDS].sort(),
    );
  });

  it('uses the documented M0/M1/M2 distribution', () => {
    const counts = MSTYLE_V2_CATALOG.reduce<Record<string, number>>(
      (acc, endpoint) => {
        acc[endpoint.milestone] = (acc[endpoint.milestone] || 0) + 1;
        return acc;
      },
      {},
    );
    expect(counts).toEqual({ M0: 35, M1: 19, M2: 4 });
  });

  it.each(MSTYLE_MOCK_ENDPOINT_IDS)(
    '%s contains every mandatory top-level response field',
    (id) => {
      const response = createMstyleMockResponse({ id });
      expect(Object.keys(response.body)).toEqual(
        expect.arrayContaining(REQUIRED_TOP_LEVEL[id]),
      );
      if (id !== 'A-01') {
        expect(response.body.schemaVersion).toBe('2.0');
      }
    },
  );

  it('uses the documented success status for every create/async route', () => {
    const created = new Set([
      'R-08',
      'R-11',
      'M-02',
      'C-01',
      'P-04',
      'G-01',
      'G-02',
      'G-09',
    ]);
    const accepted = new Set(['A-03', 'A-05', 'R-10']);
    for (const id of MSTYLE_MOCK_ENDPOINT_IDS) {
      const expected = created.has(id) ? 201 : accepted.has(id) ? 202 : 200;
      expect(createMstyleMockResponse({ id }).status).toBe(expected);
    }
  });

  it.each(['A-03', 'A-04', 'A-05'])(
    '%s returns a four-digit challenge length',
    (id) => {
      expect(createMstyleMockResponse({ id }).body.codeLength).toBe(4);
    },
  );

  it('returns selected private fields and complete snapshot metadata', () => {
    const reveal = createMstyleMockResponse({
      id: 'P-02',
      body: { fieldCodes: ['inn'] },
    }).body;
    expect(reveal.values).toEqual({ inn: '7700000000' });

    const snapshot = createMstyleMockResponse({ id: 'P-04' }).body;
    expect(snapshot.contentDigest).toMatchObject({
      algorithm: 'HMAC-SHA-256',
      keyVersion: 1,
    });
    expect(snapshot.sourceRevisions).toHaveProperty(
      'profileContactAssignments',
    );
  });

  it('matches every catalog path, including parameters and query strings', () => {
    for (const endpoint of MSTYLE_V2_CATALOG) {
      const concretePath = endpoint.path.replace(/\{[^}]+\}/g, 'mock-id');
      const result = matchMstyleMockEndpoint(
        MSTYLE_V2_CATALOG,
        endpoint.method,
        concretePath,
      );
      expect(result?.endpoint.id).toBe(endpoint.id);
    }
  });

  it('accepts the documented password:verify alias', () => {
    const result = matchMstyleMockEndpoint(
      MSTYLE_V2_CATALOG,
      'POST',
      '/api/internal/integrations/mstyle/v2/auth/residents/password:verify',
    );
    expect(result?.endpoint.id).toBe('A-02');
  });

  it('short-circuits normal handlers only when admin mock mode is enabled', async () => {
    const request = {
      method: 'GET',
      originalUrl:
        '/api/internal/integrations/mstyle/v2/residents/usr_test/context',
      body: {},
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as any;
    const next = { handle: jest.fn(() => of('normal')) };
    const config = { mockResponsesDefaultEnabled: () => false } as any;

    const enabled = new MstyleMockResponseInterceptor(config, {
      getMstyleMockResponsesEnabled: async () => ({
        enabled: true,
        overridden: true,
      }),
    } as any);
    const mocked = await firstValueFrom(await enabled.intercept(ctx, next));
    expect(mocked).toBeInstanceOf(MstyleResult);
    expect((mocked as MstyleResult).body).toMatchObject({
      schemaVersion: '2.0',
      subject: 'usr_test',
    });
    expect(next.handle).not.toHaveBeenCalled();

    const disabled = new MstyleMockResponseInterceptor(config, {
      getMstyleMockResponsesEnabled: async () => ({
        enabled: false,
        overridden: true,
      }),
    } as any);
    expect(await firstValueFrom(await disabled.intercept(ctx, next))).toBe(
      'normal',
    );
    expect(next.handle).toHaveBeenCalledTimes(1);
  });
});
