import 'reflect-metadata';
jest.mock('./mstyle-v2.identities', () => ({
  identityStatusFromUser: jest.fn(() => 'active'),
}));
jest.mock('./mstyle-v2.schemas', () => ({
  MstyleChallenge: class MstyleChallenge {},
}));

import { MstyleAuthService } from './mstyle-v2.auth.service';
import { ProblemException } from './mstyle-v2.problem';

describe('MstyleAuthService SMS Aero Mobile ID', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('executes the lazy status update on start and resend', async () => {
    const fixture = createFixture();
    const execute = jest.fn(async () => undefined);
    // Mongoose queries do nothing until awaited or executed.
    fixture.challenges.updateOne.mockImplementation(
      () =>
        ({
          then: (
            resolve: (value: unknown) => unknown,
            reject: (error: unknown) => unknown,
          ) => execute().then(resolve, reject),
        }) as any,
    );
    await fixture.service.startCodeChallenge(
      challengeDto(),
      'mstyle-backend-prod',
      '192.0.2.10',
    );
    expect(execute).toHaveBeenCalledTimes(1);
    fixture.challenge().resendAfter = new Date(Date.now() - 1);
    await fixture.service.resend(
      fixture.challenge().challengeId,
      'mstyle-backend-prod',
      '192.0.2.10',
    );
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('registers a Telegram code with the phone and challenge expiry', async () => {
    const fixture = createFixture();
    fixture.telegramGateway.isConfigured.mockReturnValue(true);
    const result = await fixture.service.startCodeChallenge(
      { ...challengeDto(), channel: 'telegram' },
      'mstyle-backend-prod',
      '192.0.2.10',
    );
    expect(result.status).toBe(202);
    expect(fixture.telegramGateway.registerPendingOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '+79990001234',
        code: expect.stringMatching(/^\d{4}$/),
        expiresAt: fixture.challenge().expiresAt.toISOString(),
      }),
    );
  });

  it('returns upstream unavailable when the Telegram gateway is missing', async () => {
    const fixture = createFixture();
    await expect(
      fixture.service.startCodeChallenge(
        { ...challengeDto(), channel: 'telegram' },
        'mstyle-backend-prod',
        '192.0.2.10',
      ),
    ).rejects.toMatchObject({ problemCode: 'UPSTREAM_UNAVAILABLE' });
  });

  it('submits an email OTP for an active identity', async () => {
    const fixture = createFixture();
    const result = await fixture.service.startCodeChallenge(
      {
        ...challengeDto(),
        identifier: { type: 'email', value: 'test@example.com' },
        channel: 'email',
      },
      'mstyle-backend-prod',
      '192.0.2.10',
    );
    expect(result.status).toBe(202);
    expect(fixture.mail.sendEmailVerificationCode).toHaveBeenCalledWith(
      'test@example.com',
      expect.stringMatching(/^\d{4}$/),
    );
    expect(fixture.sms.startMobileAuth).not.toHaveBeenCalled();
  });

  it('reports SMTP failure as upstream unavailable', async () => {
    const fixture = createFixture();
    fixture.mail.sendEmailVerificationCode.mockRejectedValueOnce(
      new Error('SMTP unavailable'),
    );
    await expect(
      fixture.service.startCodeChallenge(
        {
          ...challengeDto(),
          identifier: { type: 'email', value: 'test@example.com' },
          channel: 'email',
        },
        'mstyle-backend-prod',
        '192.0.2.10',
      ),
    ).rejects.toMatchObject({ problemCode: 'UPSTREAM_UNAVAILABLE' });
  });

  it('starts Mobile ID for A-03 and stores the provider request', async () => {
    const fixture = createFixture();

    const result = await fixture.service.startCodeChallenge(
      challengeDto(),
      'mstyle-backend-prod',
      '192.0.2.10',
    );

    expect(fixture.sms.startMobileAuth).toHaveBeenCalledWith('+79990001234');
    expect(fixture.challenge()).toMatchObject({
      codeLength: 4,
      verificationProvider: 'smsaero_mobile_id',
      mobileIdRequestId: 701,
      mobileIdAuthType: 'SIM-PUSH',
    });
    expect(result.status).toBe(202);
    expect(result.body).toMatchObject({
      codeLength: 4,
      delivery: {
        provider: 'smsaero',
        type: 'mobile_id',
      },
    });
  });

  it('completes authentication from an approved SIM-PUSH in A-04', async () => {
    const fixture = createFixture();
    await fixture.service.startCodeChallenge(
      challengeDto(),
      'mstyle-backend-prod',
      '192.0.2.10',
    );
    fixture.sms.isMobileAuthVerified.mockResolvedValue(true);

    const result = await fixture.service.getChallenge(
      fixture.challenge().challengeId,
      'mstyle-backend-prod',
    );

    expect(fixture.sms.isMobileAuthVerified).toHaveBeenCalledWith(701);
    expect(result.body).toMatchObject({
      status: 'consumed',
      codeLength: 4,
      authentication: {
        subject: 'usr_sms_aero',
        identityStatus: 'active',
        authenticationMethod: 'sms',
      },
    });
  });

  it('starts a new Mobile ID request when A-05 resends', async () => {
    const fixture = createFixture();
    await fixture.service.startCodeChallenge(
      challengeDto(),
      'mstyle-backend-prod',
      '192.0.2.10',
    );
    fixture.challenge().resendAfter = new Date(Date.now() - 1);
    fixture.sms.startMobileAuth.mockResolvedValueOnce({
      requestId: 702,
      authType: 'SMS',
      status: 0,
    });

    const result = await fixture.service.resend(
      fixture.challenge().challengeId,
      'mstyle-backend-prod',
      '192.0.2.10',
    );

    expect(fixture.sms.startMobileAuth).toHaveBeenLastCalledWith(
      '+79990001234',
    );
    expect(fixture.challenge()).toMatchObject({
      mobileIdRequestId: 702,
      mobileIdAuthType: 'SMS',
      codeLength: 4,
    });
    expect(result.body).toMatchObject({ codeLength: 4 });
  });

  it('verifies the four-digit fallback code through SMS Aero in A-06', async () => {
    const fixture = createFixture();
    await fixture.service.startCodeChallenge(
      challengeDto(),
      'mstyle-backend-prod',
      '192.0.2.10',
    );
    fixture.sms.verifyMobileAuth.mockResolvedValue(true);

    const result = await fixture.service.verifyCode(
      fixture.challenge().challengeId,
      {
        schemaVersion: '2.0',
        code: '1234',
        context: {
          ipAddress: '192.0.2.10',
          userAgent: 'Mstyle test',
          locale: 'ru-RU',
        },
      },
      'mstyle-backend-prod',
      '192.0.2.10',
    );

    expect(fixture.sms.verifyMobileAuth).toHaveBeenCalledWith(701, '1234');
    expect(result.body).toMatchObject({
      subject: 'usr_sms_aero',
      authenticationMethod: 'sms',
    });
    expect(fixture.challenge().status).toBe('consumed');
  });

  it('returns 503 without creating a challenge when dispatch is enabled but SMS Aero is unavailable', async () => {
    const fixture = createFixture();
    fixture.sms.isConfigured.mockReturnValue(false);

    await expect(
      fixture.service.startCodeChallenge(
        challengeDto(),
        'mstyle-backend-prod',
        '192.0.2.10',
      ),
    ).rejects.toMatchObject<Partial<ProblemException>>({
      problemCode: 'UPSTREAM_UNAVAILABLE',
    });
    expect(fixture.challenges.create).not.toHaveBeenCalled();
  });
});

function challengeDto() {
  return {
    schemaVersion: '2.0',
    identifier: { type: 'phone' as const, value: '+79990001234' },
    channel: 'sms' as const,
    context: {
      ipAddress: '192.0.2.10',
      userAgent: 'Mstyle test',
      locale: 'ru-RU',
    },
  };
}

function createFixture() {
  let stored: any;
  const identity = {
    subject: 'usr_sms_aero',
    identityStatus: 'active',
    authVersion: 3,
    revision: 1,
    phone: '+79990001234',
    save: jest.fn(async () => undefined),
  };
  const config = {
    rateLimitSecret: () => 'test-rate-secret',
    mockOtp: () => '1234',
    telegramBot: () => 'm_style_office_bot',
    dispatchEnabled: () => true,
  };
  const identities = {
    findUserByIdentifier: jest.fn(async () => null),
    findIdentityByIdentifier: jest.fn(async () => identity),
    findIdentityBySubject: jest.fn(async () => identity),
    usableForAuth: jest.fn((status: string) => status === 'active'),
  };
  const rates = {
    consume: jest.fn(),
    identifierKey: jest.fn((value: string) => value),
  };
  const challenges = {
    create: jest.fn(async (value: Record<string, unknown>) => {
      stored = {
        ...value,
        save: jest.fn(async () => undefined),
      };
      return stored;
    }),
    findOne: jest.fn(async ({ challengeId }: { challengeId: string }) =>
      stored?.challengeId === challengeId ? stored : null,
    ),
    updateOne: jest.fn(async () => undefined),
  };
  const sms = {
    isConfigured: jest.fn(() => true),
    startMobileAuth: jest.fn(async () => ({
      requestId: 701,
      authType: 'SIM-PUSH',
      status: 0,
    })),
    isMobileAuthVerified: jest.fn(async () => false),
    verifyMobileAuth: jest.fn(async () => false),
  };
  const mail = {
    sendEmailVerificationCode: jest.fn(async () => ({ sent: true })),
  };
  const telegramGateway = {
    isConfigured: jest.fn(() => false),
    registerPendingOtp: jest.fn(async () => true),
    sendOtp: jest.fn(async () => true),
  };
  const service = new MstyleAuthService(
    config as any,
    identities as any,
    rates as any,
    challenges as any,
    sms as any,
    mail as any,
    telegramGateway as any,
  );

  return {
    service,
    sms,
    mail,
    telegramGateway,
    challenges,
    challenge: () => stored,
  };
}
