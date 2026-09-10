import { constants, generateKeyPairSync, randomBytes, sign } from 'crypto';
import {
  ADMIN_ASSERTION_TYPE,
  verifyAdminAssertion,
} from './mstyle-v2.assertions';
import { parseJwtObject, jwtReplayKey } from './mstyle-v2.jwt';
import type { MstyleOauthClient } from './mstyle-v2.config';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const client: MstyleOauthClient = {
  clientId: 'mstyle-backend-local',
  auth: 'private_key_jwt',
  publicKey: '',
  adminAllowed: true,
  algorithm: 'RS256',
  scopes: ['mstyle.integration.admin.profile.read'],
  publicKeysByKid: {
    test: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  },
};
const expected = {
  actor: 'wp-admin:7',
  audience: 'https://pass.mstyle.ru/api/internal/integrations/mstyle/v2',
  scope: client.scopes[0],
  purpose: 'admin_support_review',
  method: 'POST',
  target:
    '/api/internal/integrations/mstyle/v2/resident-profiles/search?x=%2F&x=2',
  requestId: 'req_1',
};
const now = 2000000000;
function claims(patch: Record<string, unknown> = {}) {
  return {
    iss: client.clientId,
    sub: expected.actor,
    aud: expected.audience,
    iat: now,
    exp: now + 60,
    jti: randomBytes(24).toString('base64url'),
    auth_context: 'wp_session',
    scope: expected.scope,
    purpose: expected.purpose,
    method: expected.method,
    target: expected.target,
    requestId: expected.requestId,
    ...patch,
  };
}
function jwt(
  payload: Record<string, unknown> | string = claims(),
  headers: Record<string, unknown> = {},
  algorithm = 'RS256',
) {
  const header = {
    alg: algorithm,
    typ: ADMIN_ASSERTION_TYPE,
    kid: 'test',
    ...headers,
  };
  const input =
    Buffer.from(JSON.stringify(header)).toString('base64url') +
    '.' +
    Buffer.from(
      typeof payload === 'string' ? payload : JSON.stringify(payload),
    ).toString('base64url');
  return (
    input +
    '.' +
    sign('sha256', Buffer.from(input), {
      key: keys.privateKey,
      padding:
        algorithm === 'PS256'
          ? constants.RSA_PKCS1_PSS_PADDING
          : constants.RSA_PKCS1_PADDING,
      ...(algorithm === 'PS256' ? { saltLength: 32 } : {}),
    }).toString('base64url')
  );
}
function reason(raw: string, at = now) {
  try {
    verifyAdminAssertion(raw, client, expected, at);
    throw new Error('accepted');
  } catch (error) {
    return (error as any).errors?.[0]?.code;
  }
}
describe('administrative JWT contract', () => {
  it.each(['RS256', 'PS256'] as const)(
    'accepts the registered %s algorithm',
    (algorithm) => {
      expect(
        verifyAdminAssertion(
          jwt(claims(), {}, algorithm),
          { ...client, algorithm },
          expected,
          now,
        ),
      ).toMatchObject({ sub: expected.actor });
    },
  );
  it('allows exactly five seconds of clock skew', () => {
    const raw = jwt(claims({ iat: now - 60, exp: now }));
    expect(reason(raw, now + 4)).toBeUndefined();
    expect(reason(raw, now + 5)).toBe('expired');
    expect(
      reason(jwt(claims({ iat: now + 5, exp: now + 60 }))),
    ).toBeUndefined();
  });
  it.each([
    ['iss', 'other'],
    ['sub', 'wp-admin:8'],
    ['aud', 'https://pass.mstyle.ru'],
    ['auth_context', 'wordpress'],
    ['scope', 'mstyle.profiles.read'],
    ['purpose', 'resident_onboarding'],
    ['method', 'post'],
    ['target', expected.target.replace('%2F', '/')],
    ['requestId', 'req_other'],
    ['jti', 'short'],
    ['iat', now + 6],
    ['iat', now + 0.5],
    ['exp', now + 61],
    ['exp', now],
    ['aud', [expected.audience]],
    ['iat', String(now)],
    ['extra', 'field'],
  ])('rejects invalid %s', (field, value) =>
    expect(reason(jwt(claims({ [field]: value })))).toBe('invalid'),
  );
  it.each([
    { typ: 'JWT' },
    { alg: 'none' },
    { alg: 'HS256' },
    { kid: 'unregistered' },
    { jku: 'https://example.test/key' },
    { crit: 'extra' },
  ])('rejects header %j', (header) =>
    expect(reason(jwt(claims(), header))).toBe('invalid'),
  );
  it('requires every claim, including empty optional purpose', () => {
    for (const field of Object.keys(claims())) {
      const body = claims();
      delete (body as any)[field];
      expect(reason(jwt(body))).toBe('invalid');
    }
    expect(
      verifyAdminAssertion(
        jwt(claims({ purpose: '' })),
        client,
        { ...expected, purpose: '' },
        now,
      ),
    ).toMatchObject({ purpose: '' });
  });
  it('rejects duplicate decoded keys and malformed UTF-8', () => {
    const body = JSON.stringify(claims());
    expect(reason(jwt(body.replace('"iss":', '"iss":"other","iss":')))).toBe(
      'invalid',
    );
    expect(
      reason(jwt(body.replace('"iss":', '"\\u0069ss":"other","iss":'))),
    ).toBe('invalid');
    for (const raw of ['{"a":1,"a":2}', '{"a":1,}', '[]', '{"a":{}}']) {
      expect(() =>
        parseJwtObject(Buffer.from(raw).toString('base64url')),
      ).toThrow();
    }
    expect(() =>
      parseJwtObject(
        Buffer.from([123, 34, 97, 34, 58, 34, 255, 34, 125]).toString(
          'base64url',
        ),
      ),
    ).toThrow();
  });
  it('rejects oversize, malformed, padded or modified signatures', () => {
    expect(reason('x'.repeat(8193))).toBe('invalid');
    expect(reason('')).toBe('required');
    expect(reason('smoke-assertion')).toBe('invalid');
    const raw = jwt();
    expect(reason(raw + '=')).toBe('invalid');
    const parts = raw.split('.');
    parts[2] = Buffer.alloc(256).toString('base64url');
    expect(reason(parts.join('.'))).toBe('invalid');
  });
  it('checks binding and signature before reporting expiration', () => {
    expect(
      reason(jwt(claims({ iat: now - 120, exp: now - 60, sub: 'wp-admin:8' }))),
    ).toBe('invalid');
    expect(reason(jwt(claims({ iat: now - 120, exp: now - 60 })))).toBe(
      'expired',
    );
  });
  it('rejects an undersized RSA key and disabled administrative client', () => {
    const weak = generateKeyPairSync('rsa', { modulusLength: 1024 });
    expect(() =>
      verifyAdminAssertion(
        jwt(),
        {
          ...client,
          publicKeysByKid: {
            test: weak.publicKey
              .export({ type: 'spki', format: 'pem' })
              .toString(),
          },
        },
        expected,
        now,
      ),
    ).toThrow();
    expect(() =>
      verifyAdminAssertion(
        jwt(),
        { ...client, adminAllowed: false },
        expected,
        now,
      ),
    ).toThrow();
  });
  it('separates replay keys by issuer and JWT profile', () => {
    expect(jwtReplayKey('one', 'JWT', 'nonce')).not.toBe(
      jwtReplayKey('two', 'JWT', 'nonce'),
    );
    expect(jwtReplayKey('one', 'JWT', 'nonce')).not.toBe(
      jwtReplayKey('one', ADMIN_ASSERTION_TYPE, 'nonce'),
    );
  });
});
