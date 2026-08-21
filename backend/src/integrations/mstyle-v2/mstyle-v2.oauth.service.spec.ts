import { MstyleOauthService } from './mstyle-v2.oauth.service';
import { MstyleV2Config } from './mstyle-v2.config';
import { OAuthException } from './mstyle-v2.problem';

function configStub(overrides: Partial<MstyleV2Config> = {}): MstyleV2Config {
  return {
    isEnabled: () => true,
    clientId: () => 'mstyle-backend-staging',
    clientAuth: () => 'mtls',
    defaultScopes: () => [
      'mstyle.resident.authenticate',
      'mstyle.residents.read',
    ],
    tokenTtlSec: () => 300,
    tokenAudience: () => 'pass-mstyle-private-api',
    mockResponsesDefaultEnabled: () => false,
    assertReady: () => undefined,
    ...overrides,
  } as MstyleV2Config;
}

describe('MstyleOauthService', () => {
  it('issues opaque service token for mTLS client', async () => {
    const created: unknown[] = [];
    const service = new MstyleOauthService(
      configStub(),
      { create: async (doc: unknown) => created.push(doc) } as any,
      { create: async () => undefined } as any,
      {
        getMstyleMockResponsesEnabled: async () => ({
          enabled: false,
          overridden: false,
        }),
      } as any,
    );

    const result = await service.issueToken({
      grant_type: 'client_credentials',
      client_id: 'mstyle-backend-staging',
      scope: 'mstyle.resident.authenticate',
    });

    expect(result.token_type).toBe('Bearer');
    expect(result.expires_in).toBe(300);
    expect(result.scope).toBe('mstyle.resident.authenticate');
    expect(result.access_token.startsWith('svc_')).toBe(true);
    expect(created).toHaveLength(1);
    expect((created[0] as { scopes: string[] }).scopes).toEqual([
      'mstyle.resident.authenticate',
    ]);
    expect(result).not.toHaveProperty('schemaVersion');
  });

  it('rejects unknown client', async () => {
    const service = new MstyleOauthService(
      configStub(),
      { create: async () => undefined } as any,
      { create: async () => undefined } as any,
      {
        getMstyleMockResponsesEnabled: async () => ({
          enabled: false,
          overridden: false,
        }),
      } as any,
    );
    await expect(
      service.issueToken({
        grant_type: 'client_credentials',
        client_id: 'other',
      }),
    ).rejects.toBeInstanceOf(OAuthException);
  });

  it('issues a token when the private API flag is off but admin mock mode is on', async () => {
    const service = new MstyleOauthService(
      configStub({ isEnabled: () => false }),
      { create: async () => undefined } as any,
      { create: async () => undefined } as any,
      {
        getMstyleMockResponsesEnabled: async () => ({
          enabled: true,
          overridden: true,
        }),
      } as any,
    );

    const result = await service.issueToken({
      grant_type: 'client_credentials',
      client_id: 'mstyle-backend-staging',
    });

    expect(result.access_token).toMatch(/^svc_/);
  });
});
