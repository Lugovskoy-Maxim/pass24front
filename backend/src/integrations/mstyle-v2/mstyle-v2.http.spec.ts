import type { ExecutionContext } from '@nestjs/common';
import { MstyleServiceTokenGuard, type MstyleRequest } from './mstyle-v2.http';
import { ProblemException } from './mstyle-v2.problem';

describe('MstyleServiceTokenGuard scopes', () => {
  const tokenRow = {
    clientId: 'mstyle-reconcile-prod',
    scopes: ['mstyle.changes.read'],
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

function contextFor(method: string, originalUrl: string): ExecutionContext {
  const request = {
    method,
    originalUrl,
    headers: { authorization: 'Bearer svc_test' },
  } as MstyleRequest;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}
