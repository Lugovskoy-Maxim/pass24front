import {
  createAdminAssertion,
  verifyAdminAssertion,
} from './mstyle-v2.assertions';
import { ProblemException } from './mstyle-v2.problem';

describe('admin step-up assertion', () => {
  const secret = 'assert-secret';

  it('round-trips a signed assertion bound to the actor', () => {
    const raw = createAdminAssertion(secret, {
      actor: 'wp-admin:7',
      purpose: 'admin_support_review',
      jti: 'jti_1',
    });
    expect(verifyAdminAssertion(secret, raw, { actor: 'wp-admin:7' })).toEqual({
      jti: 'jti_1',
      exp: expect.any(Number),
    });
  });

  it('rejects a missing signature, wrong actor, or reuse of a dummy string', () => {
    expect(() =>
      verifyAdminAssertion(secret, 'smoke-assertion', {
        actor: 'wp-admin:7',
      }),
    ).toThrow(ProblemException);
    const raw = createAdminAssertion(secret, {
      actor: 'wp-admin:7',
      jti: 'jti_2',
    });
    expect(() =>
      verifyAdminAssertion(secret, raw, { actor: 'wp-admin:other' }),
    ).toThrow(ProblemException);
  });
});
