import { createSign, generateKeyPairSync, randomUUID } from 'crypto';
import { MstyleOauthService } from './mstyle-v2.oauth.service';
import { MstyleV2Config } from './mstyle-v2.config';
import { OAuthException } from './mstyle-v2.problem';
import {
  DEFAULT_DATA_SCOPES,
  MSTYLE_ADMIN_PROBE_CLIENT_ID,
} from './mstyle-v2.constants';

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
    tokenEndpointAudiences: () => ['https://pass.example/api/oauth2/token'],
    mockResponsesDefaultEnabled: () => false,
    assertReady: () => undefined,
    oauthClient: (clientId: string) =>
      clientId === 'mstyle-backend-staging'
        ? {
            clientId,
            auth: 'mtls',
            publicKey: '',
            scopes: ['mstyle.resident.authenticate', 'mstyle.residents.read'],
          }
        : undefined,
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

  it('issues a five-minute full-scope token for the admin API console', async () => {
    const created: Array<Record<string, unknown>> = [];
    const service = new MstyleOauthService(
      configStub({ tokenTtlSec: () => 3600 }),
      {
        create: async (doc: Record<string, unknown>) => created.push(doc),
      } as any,
      { create: async () => undefined } as any,
      {} as any,
    );

    const result = await service.issueAdminProbeToken();

    expect(result.access_token).toMatch(/^svc_/);
    expect(result.expires_in).toBe(300);
    expect(result.scope).toBe(DEFAULT_DATA_SCOPES.join(' '));
    expect(created[0]).toMatchObject({
      clientId: MSTYLE_ADMIN_PROBE_CLIENT_ID,
      scopes: [...DEFAULT_DATA_SCOPES],
    });
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

  it('verifies private_key_jwt with the public key assigned to the client', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const clientId = 'mstyle-backend-prod';
    const assertion = signAssertion(privateKey, {
      iss: clientId,
      sub: clientId,
      aud: 'https://pass.example/api/oauth2/token',
    });
    const created: Array<Record<string, unknown>> = [];
    const service = new MstyleOauthService(
      configStub({
        oauthClient: (id: string) =>
          id === clientId
            ? {
                clientId,
                auth: 'private_key_jwt',
                publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
                scopes: [
                  'mstyle.resident.authenticate',
                  'mstyle.residents.read',
                ],
              }
            : undefined,
      }),
      {
        create: async (doc: Record<string, unknown>) => created.push(doc),
      } as any,
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
      client_id: clientId,
      scope: 'mstyle.resident.authenticate mstyle.residents.read',
      client_assertion_type:
        'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
    });

    expect(result.scope).toBe(
      'mstyle.resident.authenticate mstyle.residents.read',
    );
    expect(created[0].clientId).toBe(clientId);
  });

  it('limits the reconcile client to changes.read', async () => {
    const clientId = 'mstyle-reconcile-prod';
    const service = new MstyleOauthService(
      configStub({
        oauthClient: (id: string) =>
          id === clientId
            ? {
                clientId,
                auth: 'mtls',
                publicKey: '',
                scopes: ['mstyle.changes.read'],
              }
            : undefined,
      }),
      { create: async () => undefined } as any,
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
      client_id: clientId,
    });
    expect(result.scope).toBe('mstyle.changes.read');

    await expect(
      service.issueToken({
        grant_type: 'client_credentials',
        client_id: clientId,
        scope: 'mstyle.residents.read',
      }),
    ).rejects.toMatchObject({ oauthError: 'invalid_scope' });
  });
});

function signAssertion(
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'],
  claims: Record<string, unknown>,
) {
  const now = Math.floor(Date.now() / 1000);
  const encodedHeader = base64url({ alg: 'RS256', typ: 'JWT' });
  const encodedClaims = base64url({
    ...claims,
    iat: now,
    exp: now + 60,
    jti: randomUUID(),
  });
  const input = `${encodedHeader}.${encodedClaims}`;
  const signer = createSign('RSA-SHA256');
  signer.update(input);
  signer.end();
  return `${input}.${signer.sign(privateKey).toString('base64url')}`;
}

function base64url(value: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
