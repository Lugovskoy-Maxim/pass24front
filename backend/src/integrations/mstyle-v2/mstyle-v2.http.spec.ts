import type { ExecutionContext } from '@nestjs/common';
import {
  MstyleRouteContextGuard,
  MstyleServiceTokenGuard,
  type MstyleRequest,
} from './mstyle-v2.http';
import { ProblemException } from './mstyle-v2.problem';

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
  const guard = new MstyleRouteContextGuard({
    reconcileClientId: () => 'mstyle-reconcile-prod',
  } as any);

  it('allows only the reconcile client and actor on R-03', () => {
    expect(
      guard.canActivate(
        contextFor('GET', '/api/internal/integrations/mstyle/v2/changes', {
          clientId: 'mstyle-reconcile-prod',
          actorRef: 'system:reconcile',
        }),
      ),
    ).toBe(true);
    expect(() =>
      guard.canActivate(
        contextFor('GET', '/api/internal/integrations/mstyle/v2/changes', {
          clientId: 'mstyle-backend-prod',
          actorRef: 'system:reconcile',
        }),
      ),
    ).toThrow(ProblemException);
  });

  it('rejects the reconcile client on non-R-03 routes', () => {
    expect(() =>
      guard.canActivate(
        contextFor(
          'POST',
          '/api/internal/integrations/mstyle/v2/resident-profiles/search',
          {
            clientId: 'mstyle-reconcile-prod',
            actorRef: 'wp-admin:7',
            adminAssertion: 'signed',
            purposeCode: 'admin_support_review',
          },
        ),
      ),
    ).toThrow(ProblemException);
  });

  it('requires a matching resident actor and step-up authentication', () => {
    const route =
      '/api/internal/integrations/mstyle/v2/resident-memberships/mem_1';
    expect(
      guard.canActivate(
        contextFor('PATCH', route, {
          clientId: 'mstyle-backend-prod',
          residentSubject: 'usr_1',
          actorRef: 'resident:usr_1',
          stepUpId: 'aut_1',
        }),
      ),
    ).toBe(true);
    expect(() =>
      guard.canActivate(
        contextFor('PATCH', route, {
          clientId: 'mstyle-backend-prod',
          residentSubject: 'usr_1',
          actorRef: 'resident:usr_2',
          stepUpId: 'aut_1',
        }),
      ),
    ).toThrow(ProblemException);
  });

  it('requires admin proof and route-specific purpose', () => {
    const route =
      '/api/internal/integrations/mstyle/v2/resident-profiles/search';
    expect(
      guard.canActivate(
        contextFor('POST', route, {
          clientId: 'mstyle-backend-prod',
          actorRef: 'wp-admin:7',
          adminAssertion: 'signed',
          purposeCode: 'admin_support_review',
        }),
      ),
    ).toBe(true);
    expect(() =>
      guard.canActivate(
        contextFor('POST', route, {
          clientId: 'mstyle-backend-prod',
          actorRef: 'wp-admin:7',
          adminAssertion: 'signed',
          purposeCode: 'resident_onboarding',
        }),
      ),
    ).toThrow(ProblemException);
  });

  it('accepts R-14 without a purpose header', () => {
    expect(
      guard.canActivate(
        contextFor(
          'GET',
          '/api/internal/integrations/mstyle/v2/identities/usr_1',
          {
            clientId: 'mstyle-backend-prod',
            actorRef: 'wp-admin:7',
            adminAssertion: 'signed',
          },
        ),
      ),
    ).toBe(true);
  });
});

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
  } as MstyleRequest;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}
