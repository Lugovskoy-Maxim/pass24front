import { MstyleChallengeSchema } from './mstyle-v2.schemas';

describe('Mstyle v2 schemas', () => {
  it('allows the manual test email verification provider', () => {
    const verificationProvider = MstyleChallengeSchema.path(
      'verificationProvider',
    ) as unknown as { enumValues: string[] };

    expect(verificationProvider.enumValues).toContain('manual_test_email');
  });
});
