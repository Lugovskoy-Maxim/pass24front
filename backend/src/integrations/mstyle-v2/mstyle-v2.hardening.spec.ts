import { membershipIsEffective } from './mstyle-v2.membership-policy';
import { guestFlowRoute } from './mstyle-v2.guest-access';
import { MstyleContactSelectionService } from './mstyle-v2.contact-selection';
import { MstyleContactProofService } from './mstyle-v2.contact-proof';
import { MstyleReadinessService } from './mstyle-v2.readiness';
import { MstyleNativeConsoleProof } from './mstyle-v2.native-console';
import { MstyleConsentService } from './mstyle-v2.consent.service';
import { ConfigService } from '@nestjs/config';
import { sign } from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';

describe('effective memberships and contract contact selection', () => {
  const now = Date.parse('2026-09-10T10:00:00Z');
  it.each([
    [{ status: 'active' }, true],
    [{ status: 'invited' }, false],
    [{ status: 'revoked' }, false],
    [{ status: 'active', validFrom: '2026-09-10T12:00:01+02:00' }, false],
    [{ status: 'active', validFrom: '2026-09-10T12:00:00+02:00' }, true],
    [{ status: 'active', validUntil: '2026-09-10T12:00:00+02:00' }, false],
    [{ status: 'active', validUntil: 'bad-date' }, false],
  ])('checks dates and status for %j', (membership, expected) =>
    expect(membershipIsEffective(membership, now)).toBe(expected),
  );
  it('skips an expired employee, a blocked identity and an unverified contact before choosing a valid assignment', async () => {
    const assignments = ['expired', 'blocked', 'unverified', 'valid'].map(
      (subject, i) => ({
        subject,
        contactType: 'email',
        contactId: subject,
        revision: i + 1,
      }),
    );
    const lean = (value: any) => ({ lean: async () => value });
    const memberships = {
      findOne: ({ subject }: any) =>
        lean({
          status: 'active',
          validUntil: subject === 'expired' ? '2000-01-01T00:00:00Z' : null,
        }),
    };
    const identities = {
      findIdentityBySubject: async (subject: string) => ({
        subject,
        revision: 9,
        identityStatus: subject === 'blocked' ? 'blocked' : 'active',
      }),
    };
    const contacts = {
      findOne: ({ subject }: any) =>
        lean({
          contactId: subject,
          verifiedAt: subject === 'unverified' ? null : '2026-09-10T00:00:00Z',
          revision: 3,
        }),
    };
    const service = new MstyleContactSelectionService(
      { find: () => ({ sort: () => lean(assignments) }) } as any,
      contacts as any,
      identities as any,
      memberships as any,
    );
    const selected = await service.select('profile');
    expect(selected.email?.contact.contactId).toBe('valid');
    expect(selected.sourceRevisions).toEqual({
      profileContactAssignments: { phone: null, email: 4 },
      contactIdentity: 9,
      identityContacts: { phone: null, email: 3 },
    });
  });
});

describe('guest token scope boundary', () => {
  const path = '/api/internal/integrations/mstyle/v2/guest-parties/gst_test';
  it.each(['status', 'private-data/status', 'consents'])(
    'permits GET %s',
    (suffix) =>
      expect(guestFlowRoute('GET', path + '/' + suffix)).toBe('gst_test'),
  );
  it.each([
    'contacts/reveal',
    'private-data/reveal',
    'claim',
    'booking-confirmations',
    'search',
  ])('rejects service operation %s', (suffix) =>
    expect(guestFlowRoute('POST', path + '/' + suffix)).toBeUndefined(),
  );
  it('does not authorize another API namespace', () =>
    expect(guestFlowRoute('GET', '/identities/usr_test')).toBeUndefined());
});

describe('contact proof delivery and attempt accounting', () => {
  function fixture(real = true, environment = 'production') {
    const cfg = {
      dispatchEnabled: () => real,
      environment: () => environment,
      piiSecret: () => 'local-test-secret',
      rateLimitSecret: () => 'rate-test-secret',
      mockOtp: () => '1234',
    };
    const rows: any = {
      create: jest.fn(async (value) => ({ ...value, save: jest.fn() })),
      findOneAndUpdate: jest.fn(),
      findOne: jest.fn(),
      updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
    };
    const sms = {
      isConfigured: () => true,
      startMobileAuth: jest.fn(async () => ({
        requestId: 42,
        authType: 'SMS',
      })),
      verifyMobileAuth: jest.fn(async () => true),
    };
    const mail = { sendEmailVerificationCode: jest.fn(async () => {}) };
    const rates = { consume: jest.fn() };
    return {
      rows,
      sms,
      mail,
      service: new MstyleContactProofService(
        cfg as any,
        rows,
        sms as any,
        mail as any,
        rates as any,
      ),
    };
  }
  const binding = { kind: 'contact' as const, subject: 'usr_test' };
  it('uses the provider session when issuing and verifying SMS', async () => {
    const f = fixture();
    const challenge = await f.service.start(
      binding,
      'phone',
      '+79990001234',
      2,
    );
    expect(f.sms.startMobileAuth).toHaveBeenCalledWith('+79990001234');
    expect(challenge.mobileIdRequestId).toBe(42);
    expect(challenge.baseContactValueRevision).toBe(2);
    f.rows.findOneAndUpdate.mockResolvedValue(challenge);
    await f.service.verify(binding, challenge.challengeId, '5829');
    expect(f.sms.verifyMobileAuth).toHaveBeenCalledWith(42, '5829');
    expect(f.rows.findOneAndUpdate.mock.calls[0][0].verifyAttempts).toEqual({
      $lt: 5,
    });
    expect(f.rows.findOneAndUpdate.mock.calls[0][1]).toEqual({
      $inc: { verifyAttempts: 1 },
    });
  });
  it('sends a four-digit mail code whose hash is stored, and does not expose it in the challenge', async () => {
    const f = fixture();
    const challenge = await f.service.start(
      binding,
      'email',
      'fixture@example.invalid',
      0,
    );
    const code = f.mail.sendEmailVerificationCode.mock.calls[0][1];
    expect(code).toMatch(/^\d{4}$/);
    expect(await bcrypt.compare(code, challenge.codeHash)).toBe(true);
    expect(challenge.code).toBeUndefined();
    expect(challenge.status).toBe('awaiting_code');
  });
  it('expires the attempt when delivery fails', async () => {
    const f = fixture();
    f.mail.sendEmailVerificationCode.mockRejectedValue(
      new Error('unavailable'),
    );
    await expect(
      f.service.start(binding, 'email', 'fixture@example.invalid', 0),
    ).rejects.toMatchObject({ problemCode: 'UPSTREAM_UNAVAILABLE' });
    expect(f.rows.updateOne).toHaveBeenCalledWith(expect.anything(), {
      $set: { status: 'expired' },
    });
  });
  it('does not issue a fixed OTP outside the isolated local environment', async () => {
    const f = fixture(false);
    await expect(
      f.service.start(binding, 'email', 'fixture@example.invalid', 0),
    ).rejects.toThrow();
    expect(f.rows.create).not.toHaveBeenCalled();
  });
  it('persists wrong attempts without approving consumption', async () => {
    const f = fixture(false, 'local');
    f.rows.findOneAndUpdate.mockResolvedValue({
      codeHash: await bcrypt.hash('1234', 4),
    });
    await expect(
      f.service.verify(binding, 'ach_test', '0000'),
    ).rejects.toMatchObject({ problemCode: 'INVALID_CREDENTIALS' });
    expect(f.rows.updateOne).not.toHaveBeenCalled();
  });
  it('rejects a sixth attempt before calling the provider', async () => {
    const f = fixture();
    f.rows.findOneAndUpdate.mockResolvedValue(null);
    f.rows.findOne.mockResolvedValue({
      contactProofVersion: 1,
      status: 'awaiting_code',
      expiresAt: new Date(Date.now() + 60000),
      verifyAttempts: 5,
    });
    await expect(
      f.service.verify(binding, 'ach_test', '1234'),
    ).rejects.toMatchObject({ problemCode: 'RATE_LIMITED' });
    expect(f.sms.verifyMobileAuth).not.toHaveBeenCalled();
  });
});

describe('integration readiness isolation', () => {
  it('keeps startup non-blocking when configuration is invalid and rejects integration calls', async () => {
    const service = new MstyleReadinessService(
      {} as any,
      {
        assertReady: () => {
          throw new Error('invalid');
        },
      } as any,
    );
    expect(service.onModuleInit()).toBeUndefined();
    await expect(service.assertReady()).rejects.toMatchObject({
      problemCode: 'UPSTREAM_UNAVAILABLE',
    });
  });
  it('requires transactions and retries after a repaired deployment', async () => {
    let replica = false;
    const model = {
      createCollection: jest.fn(async () => {}),
      createIndexes: jest.fn(async () => {}),
    };
    const db = {
      admin: () => ({
        command: async () => (replica ? { setName: 'test' } : {}),
      }),
    };
    const service = new MstyleReadinessService(
      { db, model: () => model } as any,
      { assertReady: () => {} } as any,
    );
    await expect(service.assertReady()).rejects.toThrow();
    replica = true;
    (service as any).retryAt = 0;
    await expect(service.assertReady()).resolves.toBeUndefined();
    expect(model.createIndexes).toHaveBeenCalled();
  });
});

describe('native admin console compatibility', () => {
  const secret = 'native-console-test-secret';
  const subject = '123456789012345678901234';
  function fixture(user: any) {
    return new MstyleNativeConsoleProof(
      new ConfigService({ JWT_SECRET: secret }),
      { findById: async () => user } as any,
    );
  }
  it('accepts the native admin JWT without writing to User', async () => {
    await expect(
      fixture({ _id: subject, role: 'admin' }).verify(
        sign({ sub: subject }, secret, { expiresIn: 60 }),
      ),
    ).resolves.toBe(subject);
  });
  it.each([
    { role: 'tenant' },
    { role: 'admin', isBlocked: true },
    { role: 'admin', invitePending: true },
  ])('rejects ineligible native user %j', async (user) => {
    await expect(
      fixture(user).verify(sign({ sub: subject }, secret, { expiresIn: 60 })),
    ).rejects.toThrow();
  });
  it('rejects expired and forged native tokens', async () => {
    for (const token of [
      sign({ sub: subject }, secret, { expiresIn: -1 }),
      sign({ sub: subject }, 'wrong', { expiresIn: 60 }),
    ])
      await expect(fixture({ role: 'admin' }).verify(token)).rejects.toThrow();
  });
});

describe('consent definition validation', () => {
  it.each([
    undefined,
    '{}',
    '[]',
    '[{"documentCode":"personal_data_processing"}]',
  ])('rejects missing or invalid configuration %s', (value) => {
    const service = new MstyleConsentService(
      new ConfigService({ MSTYLE_CONSENT_DOCUMENTS_JSON: value }),
      {} as any,
      {} as any,
      {} as any,
    );
    expect(() => service.definitions()).toThrow();
  });
});
