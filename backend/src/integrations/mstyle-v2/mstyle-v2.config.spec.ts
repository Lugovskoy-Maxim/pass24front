import { ConfigService } from '@nestjs/config';
import { MstyleV2Config } from './mstyle-v2.config';

describe('MstyleV2Config OAuth clients', () => {
  it('uses a four-digit mock OTP', () => {
    const config = createConfig({
      MSTYLE_CLIENT_ID: 'mstyle-backend-prod',
      MSTYLE_CLIENT_AUTH: 'mtls',
    });

    expect(config.mockOtp()).toBe('1234');
    expect(() => config.assertReady()).not.toThrow();
  });

  it('rejects a mock OTP that is not exactly four digits', () => {
    const config = createConfig({ MSTYLE_MOCK_OTP: '123456' });

    expect(() => config.assertReady()).toThrow(
      'MSTYLE_MOCK_OTP must contain exactly 4 digits',
    );
  });

  it('resolves separate primary and changes-only clients', () => {
    const config = createConfig({
      MSTYLE_CLIENT_ID: 'mstyle-backend-prod',
      MSTYLE_CLIENT_AUTH: 'private_key_jwt',
      MSTYLE_CLIENT_PUBLIC_KEY:
        '-----BEGIN PUBLIC KEY-----\\nprimary\\n-----END PUBLIC KEY-----',
      MSTYLE_CLIENT_KID: 'mstyle-backend-prod-20260827-01',
      MSTYLE_CLIENT_SCOPES:
        'mstyle.resident.authenticate mstyle.residents.read',
      MSTYLE_RECONCILE_CLIENT_ID: 'mstyle-reconcile-prod',
      MSTYLE_RECONCILE_CLIENT_PUBLIC_KEY:
        '-----BEGIN PUBLIC KEY-----\\nreconcile\\n-----END PUBLIC KEY-----',
      MSTYLE_RECONCILE_CLIENT_KID: 'mstyle-reconcile-prod-20260827-01',
    });

    expect(config.oauthClient('mstyle-backend-prod')).toEqual({
      clientId: 'mstyle-backend-prod',
      auth: 'private_key_jwt',
      publicKey:
        '-----BEGIN PUBLIC KEY-----\nprimary\n-----END PUBLIC KEY-----',
      publicKeysByKid: {
        'mstyle-backend-prod-20260827-01':
          '-----BEGIN PUBLIC KEY-----\nprimary\n-----END PUBLIC KEY-----',
      },
      scopes: ['mstyle.resident.authenticate', 'mstyle.residents.read'],
    });
    expect(config.oauthClient('mstyle-reconcile-prod')).toEqual({
      clientId: 'mstyle-reconcile-prod',
      auth: 'private_key_jwt',
      publicKey:
        '-----BEGIN PUBLIC KEY-----\nreconcile\n-----END PUBLIC KEY-----',
      publicKeysByKid: {
        'mstyle-reconcile-prod-20260827-01':
          '-----BEGIN PUBLIC KEY-----\nreconcile\n-----END PUBLIC KEY-----',
      },
      scopes: ['mstyle.changes.read'],
    });
    expect(() => config.assertReady()).not.toThrow();
  });

  it('rejects a private PEM accidentally configured on Pass', () => {
    const config = createConfig({
      MSTYLE_CLIENT_ID: 'mstyle-backend-prod',
      MSTYLE_CLIENT_AUTH: 'private_key_jwt',
      MSTYLE_CLIENT_PUBLIC_KEY:
        '-----BEGIN PRIVATE KEY-----\\nsecret\\n-----END PRIVATE KEY-----',
    });

    expect(() => config.assertReady()).toThrow('must use a public key');
  });
});

function createConfig(values: Record<string, string>) {
  return new MstyleV2Config(
    new ConfigService({
      NODE_ENV: 'production',
      MSTYLE_PRIVATE_API_ENABLED: 'true',
      ...values,
    }),
  );
}
