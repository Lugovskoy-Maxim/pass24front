import {
  ALLOWED_AUTH_PAIRS,
  MSTYLE_AUTH_SCOPE,
  ROUTE_SCOPES,
} from './mstyle-v2.constants';
import {
  canonicalJson,
  decryptJson,
  encryptJson,
  idempotencyFingerprint,
  maskEmail,
  maskPhone,
  safeEqualHex,
} from './mstyle-v2.crypto';
import { Ids, ulid } from './mstyle-v2.ids';
import { ProblemException } from './mstyle-v2.problem';

describe('mstyle-v2 helpers', () => {
  it('builds crockford-like ids', () => {
    expect(ulid()).toHaveLength(26);
    expect(Ids.subject()).toMatch(/^usr_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(Ids.challenge()).toMatch(/^ach_/);
  });

  it('canonical json is stable', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
  });

  it('encrypts private values', () => {
    const enc = encryptJson('secret', { inn: '7707123456' });
    expect(decryptJson('secret', enc)).toEqual({ inn: '7707123456' });
    expect(() => decryptJson('other', enc)).toThrow();
  });

  it('masks contacts', () => {
    expect(maskPhone('+79990001234')).toBe('+7******1234');
    expect(maskEmail('name@company.ru')).toBe('n***@company.ru');
  });

  it('compares hmac fingerprints without storing secrets', () => {
    const secret = 'idem';
    const a = idempotencyFingerprint(secret, {
      clientId: 'mstyle-backend-staging',
      method: 'POST',
      route: '/auth/residents/password:verify',
      body: { login: 'a', password: 'p' },
    });
    const b = idempotencyFingerprint(secret, {
      clientId: 'mstyle-backend-staging',
      method: 'POST',
      route: '/auth/residents/password:verify',
      body: { password: 'p', login: 'a' },
    });
    const c = idempotencyFingerprint(secret, {
      clientId: 'mstyle-backend-staging',
      method: 'POST',
      route: '/auth/residents/password:verify',
      body: { login: 'a', password: 'other' },
    });
    expect(safeEqualHex(a, b)).toBe(true);
    expect(safeEqualHex(a, c)).toBe(false);
  });

  it('allows only documented auth pairs', () => {
    expect(ALLOWED_AUTH_PAIRS).toEqual([
      ['phone', 'sms'],
      ['phone', 'telegram'],
      ['email', 'email'],
    ]);
  });

  it('maps auth routes to authenticate scope', () => {
    const path =
      '/api/internal/integrations/mstyle/v2/auth/residents/code-challenges';
    const rule = ROUTE_SCOPES.find(
      (item) => item.method === 'POST' && item.match.test(path),
    );
    expect(rule?.scope).toBe(MSTYLE_AUTH_SCOPE);
  });

  it('formats problem+json', () => {
    const err = new ProblemException(401, 'INVALID_CREDENTIALS');
    const body = err.toBody('req_test');
    expect(body.code).toBe('INVALID_CREDENTIALS');
    expect(body.status).toBe(401);
    expect(body.requestId).toBe('req_test');
    expect(body.type).toContain('invalid-credentials');
  });
});
