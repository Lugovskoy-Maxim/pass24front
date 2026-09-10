import type { ExecutionContext } from '@nestjs/common';
import { generateKeyPairSync, randomBytes, sign } from 'crypto';
import { ADMIN_ASSERTION_TYPE } from './mstyle-v2.assertions';
import {
  MstyleRouteContextGuard,
  MstyleServiceTokenGuard,
  type MstyleRequest,
} from './mstyle-v2.http';
import { ProblemException } from './mstyle-v2.problem';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const base = 'https://pass.mstyle.ru/api/internal/integrations/mstyle/v2';
const client = {
  clientId: 'mstyle-backend-prod',
  adminAllowed: true,
  algorithm: 'RS256',
  scopes: [
    'mstyle.integration.admin.profile.read',
    'mstyle.integration.admin.identity.read',
  ],
  publicKeysByKid: {
    test: keys.publicKey.export({ type: 'spki', format: 'pem' }),
  },
};

describe('MstyleServiceTokenGuard scopes', () => {
  const tokenRow = {
    clientId: 'mstyle-reconcile-prod',
    scopes: ['mstyle.integration.reconcile'],
    aud: 'pass-mstyle-private-api',
    expiresAt: new Date(Date.now() + 60_000),
  };
  const guard = new MstyleServiceTokenGuard(
    { tokenAudience: () => 'pass-mstyle-private-api' } as any,
    { findOne: async () => tokenRow } as any,
  );

  it('allows the reconcile token on GET changes', async () => {
    await expect(
      guard.canActivate(
        contextFor('GET', '/api/internal/integrations/mstyle/v2/changes'),
      ),
    ).resolves.toBe(true);
  });

  it('denies the reconcile token on every unmapped route', async () => {
    await expect(
      guard.canActivate(
        contextFor('GET', '/api/internal/integrations/mstyle/v2/new-route'),
      ),
    ).rejects.toBeInstanceOf(ProblemException);
  });
});

describe('MstyleRouteContextGuard M1/M2 context', () => {
  const authentications = {
    findOne: jest.fn(
      async (query: { authenticationId: string; subject: string }) =>
        query.authenticationId === 'aut_1' && query.subject === 'usr_1'
          ? { expiresAt: new Date(Date.now() + 60_000), authVersion: 1 }
          : null,
    ),
  };
  const adminAssertions = {
    create: jest.fn(async (value: unknown) => value),
  };
  const guard = new MstyleRouteContextGuard(
    {
      reconcileClientId: () => 'mstyle-reconcile-prod',
      privateApiBase: () => base,
      oauthClient: () => client,
    } as any,
    authentications as any,
    adminAssertions as any,
    { create: async () => undefined } as any,
    {
      findIdentityBySubject: async () => ({
        identityStatus: 'active',
        authVersion: 1,
      }),
    } as any,
    { findOne: async () => ({ role: 'owner' }) } as any,
  );

  beforeEach(() => {
    authentications.findOne.mockClear();
    adminAssertions.create.mockClear();
  });

  it('allows only the reconcile client and actor on R-03', async () => {
    await expect(
      guard.canActivate(
        contextFor('GET', '/api/internal/integrations/mstyle/v2/changes', {
          clientId: 'mstyle-reconcile-prod',
          actorRef: 'system:reconcile',
        }),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        contextFor('GET', '/api/internal/integrations/mstyle/v2/changes', {
          clientId: 'mstyle-backend-prod',
          actorRef: 'system:reconcile',
        }),
      ),
    ).rejects.toBeInstanceOf(ProblemException);
  });

  it('rejects the reconcile client on non-R-03 routes', async () => {
    await expect(
      guard.canActivate(
        contextFor(
          'POST',
          '/api/internal/integrations/mstyle/v2/resident-profiles/search',
          {
            clientId: 'mstyle-reconcile-prod',
            actorRef: 'wp-admin:7',
            adminAssertion: signedAdmin('wp-admin:7', 'admin_support_review'),
            purposeCode: 'admin_support_review',
          },
        ),
      ),
    ).rejects.toBeInstanceOf(ProblemException);
  });

  it('requires a matching resident actor and stored step-up authentication', async () => {
    const route =
      '/api/internal/integrations/mstyle/v2/resident-memberships/mem_1';
    await expect(
      guard.canActivate(
        contextFor('PATCH', route, {
          clientId: 'mstyle-backend-prod',
          residentSubject: 'usr_1',
          actorRef: 'resident:usr_1',
          stepUpId: 'aut_1',
        }),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        contextFor('PATCH', route, {
          clientId: 'mstyle-backend-prod',
          residentSubject: 'usr_1',
          actorRef: 'resident:usr_2',
          stepUpId: 'aut_1',
        }),
      ),
    ).rejects.toBeInstanceOf(ProblemException);
    await expect(
      guard.canActivate(
        contextFor('PATCH', route, {
          clientId: 'mstyle-backend-prod',
          residentSubject: 'usr_1',
          actorRef: 'resident:usr_1',
          stepUpId: 'aut_missing',
        }),
      ),
    ).rejects.toMatchObject({ problemCode: 'STEP_UP_REQUIRED' });
  });

  it('requires a signed admin assertion and route-specific purpose', async () => {
    const route =
      '/api/internal/integrations/mstyle/v2/resident-profiles/search';
    await expect(
      guard.canActivate(
        contextFor('POST', route, {
          clientId: 'mstyle-backend-prod',
          actorRef: 'wp-admin:7',
          adminAssertion: signedAdmin('wp-admin:7', 'admin_support_review'),
          purposeCode: 'admin_support_review',
        }),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        contextFor('POST', route, {
          clientId: 'mstyle-backend-prod',
          actorRef: 'wp-admin:7',
          adminAssertion: signedAdmin('wp-admin:7', 'admin_support_review'),
          purposeCode: 'resident_onboarding',
        }),
      ),
    ).rejects.toBeInstanceOf(ProblemException);
    await expect(
      guard.canActivate(
        contextFor('POST', route, {
          clientId: 'mstyle-backend-prod',
          actorRef: 'wp-admin:7',
          adminAssertion: 'smoke-assertion',
          purposeCode: 'admin_support_review',
        }),
      ),
    ).rejects.toMatchObject({ problemCode: 'ADMIN_ASSERTION_INVALID' });
  });

  it('accepts R-14 without a purpose header', async () => {
    await expect(
      guard.canActivate(
        contextFor(
          'GET',
          '/api/internal/integrations/mstyle/v2/identities/usr_1',
          {
            clientId: 'mstyle-backend-prod',
            actorRef: 'wp-admin:7',
            adminAssertion: signedAdmin('wp-admin:7'),
          },
        ),
      ),
    ).resolves.toBe(true);
  });
});

function signedAdmin(actor: string, purpose?: string): string {
  const now = Math.floor(Date.now() / 1000);
  const data = [
    { alg: 'RS256', typ: ADMIN_ASSERTION_TYPE, kid: 'test' },
    {
      iss: client.clientId,
      sub: actor,
      aud: base,
      iat: now,
      exp: now + 55,
      jti: randomBytes(24).toString('base64url'),
      auth_context: 'wp_session',
      scope: purpose ? client.scopes[0] : client.scopes[1],
      purpose: purpose || '',
      method: purpose ? 'POST' : 'GET',
      target:
        '/api/internal/integrations/mstyle/v2/' +
        (purpose ? 'resident-profiles/search' : 'identities/usr_1'),
      requestId: 'req_test',
    },
  ]
    .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
    .join('.');
  return (
    data +
    '.' +
    sign('sha256', Buffer.from(data), keys.privateKey).toString('base64url')
  );
}

function contextFor(
  method: string,
  originalUrl: string,
  options: {
    clientId?: string;
    actorRef?: string;
    residentSubject?: string;
    stepUpId?: string;
    adminAssertion?: string;
    purposeCode?: string;
  } = {},
): ExecutionContext {
  const request = {
    method,
    originalUrl,
    headers: {
      authorization: 'Bearer svc_test',
      'x-actor-ref': options.actorRef,
      'x-resident-subject': options.residentSubject,
      'x-step-up-authentication-id': options.stepUpId,
      'x-admin-step-up-assertion': options.adminAssertion,
      'x-purpose-code': options.purposeCode,
    },
    mstyleClientId: options.clientId,
    mstyleRequestId: 'req_test',
    mstyleTokenScopes: [
      originalUrl.includes('/identities/')
        ? client.scopes[1]
        : client.scopes[0],
    ],
    mstyleAcceptedScopes: client.scopes,
    params: {},
  } as MstyleRequest;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}
