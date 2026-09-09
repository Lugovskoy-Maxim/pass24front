import { ConfigService } from '@nestjs/config';
import { MSTYLE_REQUIRED_M0_SCOPES } from './mstyle-v2.constants';
import { MstyleV2Config } from './mstyle-v2.config';

describe('MstyleV2Config OAuth clients', () => {
  it('uses the office bot and normalizes an explicit username', () => {
    expect(createConfig({}).telegramBot()).toBe('m_style_office_bot');
    expect(
      createConfig({ MSTYLE_TELEGRAM_BOT: ' @custom_bot ' }).telegramBot(),
    ).toBe('custom_bot');
  });
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
      scopes: [
        'mstyle.resident.authenticate',
        'mstyle.residents.read',
        'mstyle.integration.admin.identity.read',
      ],
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
      scopes: ['mstyle.integration.reconcile'],
    });
    expect(() => config.assertReady()).not.toThrow();
  });

  it('expands the legacy production allowlist to every PHP M0 scope', () => {
    const config = createConfig({
      MSTYLE_CLIENT_SCOPES: [
        'mstyle.resident.authenticate',
        'mstyle.resident.context.read',
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
      ].join(' '),
    });

    expect(config.defaultScopes()).toEqual(
      expect.arrayContaining([...MSTYLE_REQUIRED_M0_SCOPES]),
    );
    expect(config.defaultScopes()).not.toContain('mstyle.changes.read');
    expect(config.defaultScopes()).not.toContain(
      'mstyle.integration.reconcile',
    );
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
