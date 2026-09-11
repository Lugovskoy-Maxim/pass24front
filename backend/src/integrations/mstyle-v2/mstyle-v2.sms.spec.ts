import { ConfigService } from '@nestjs/config';
import { SmsService } from '../../sms/sms.service';
import {
  createMstyleSmsService,
  MstyleSmsSessionExpiredError,
} from './mstyle-v2.sms';

describe('V2 SMS Aero account isolation', () => {
  const pass = {
    SMS_ENABLED: 'true',
    SMSAERO_EMAIL: 'pass@example.com',
    SMSAERO_API_KEY: 'pass-test-key',
    SMSAERO_SIGN: 'pass-sign',
    PUBLIC_APP_URL: 'https://pass.mstyle.ru',
  };
  const v2 = {
    MSTYLE_SMS_ENABLED: 'true',
    MSTYLE_SMSAERO_EMAIL: 'v2@example.com',
    MSTYLE_SMSAERO_API_KEY: 'v2-test-key',
    MSTYLE_SMSAERO_SIGN: 'v2-sign',
  };
  afterEach(() => jest.restoreAllMocks());

  it('stops V2 verification when the provider already reports a closed session', async () => {
    const mock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: 701, status: 2 } }),
    } as Response);
    await expect(
      createMstyleSmsService(new ConfigService(v2)).verifyMobileAuth(
        701,
        '1234',
      ),
    ).rejects.toBeInstanceOf(MstyleSmsSessionExpiredError);
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0][0]).toContain('mobile-id/status');
    expect(
      await new SmsService(new ConfigService(pass)).isMobileAuthVerified(701),
    ).toBe(false);
  });

  it('recognizes a session that expires between status and verify', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 701, status: 3 } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ success: false, message: 'session not found' }),
      } as Response);
    await expect(
      createMstyleSmsService(new ConfigService(v2)).verifyMobileAuth(
        701,
        '1234',
      ),
    ).rejects.toBeInstanceOf(MstyleSmsSessionExpiredError);
  });

  it('keeps an incorrect OTP distinct from session expiry', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 701, status: 3 } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ success: false, message: 'invalid otp code' }),
      } as Response);
    expect(
      await createMstyleSmsService(new ConfigService(v2)).verifyMobileAuth(
        701,
        '0000',
      ),
    ).toBe(false);
  });

  it('never falls back to PASS credentials when V2 is unconfigured', async () => {
    const cfg = new ConfigService(pass);
    expect(new SmsService(cfg).isConfigured()).toBe(true);
    expect(createMstyleSmsService(cfg).isConfigured()).toBe(false);
    expect(
      createMstyleSmsService(
        new ConfigService({ ...pass, ...v2, MSTYLE_SMSAERO_API_KEY: '' }),
      ).isConfigured(),
    ).toBe(false);
    expect(
      createMstyleSmsService(
        new ConfigService({ ...pass, ...v2, MSTYLE_SMSAERO_SIGN: '' }),
      ).isConfigured(),
    ).toBe(false);
  });

  it('uses V2 credentials for send, status and verification; PASS keeps its own account', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        ({
          ok: true,
          json: async () => ({
            success: true,
            data: { id: 701, status: 0, authType: 'SMS' },
          }),
        }) as Response,
    );
    const cfg = new ConfigService({ ...pass, ...v2 });
    const sms = createMstyleSmsService(cfg);
    await sms.startMobileAuth('+79990001234');
    await sms.verifyMobileAuth(701, '1234');
    const v2CallCount = fetchMock.mock.calls.length;
    expect(v2CallCount).toBeGreaterThanOrEqual(4);
    for (const [, options] of fetchMock.mock.calls.slice(0, v2CallCount)) {
      expect((options!.headers as Record<string, string>).Authorization).toBe(
        `Basic ${Buffer.from('v2@example.com:v2-test-key').toString('base64')}`,
      );
    }
    const body = new URLSearchParams(
      fetchMock.mock.calls[0][1]!.body as string,
    );
    expect(body.get('sign')).toBe('v2-sign');
    expect(body.get('callbackUrl')).toBe(
      'https://pass.mstyle.ru/api/sms/mobile-id/callback',
    );
    await new SmsService(cfg).startMobileAuth('+79990001234');
    const options = fetchMock.mock.calls[v2CallCount][1]!;
    expect((options.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('pass@example.com:pass-test-key').toString('base64')}`,
    );
  });
});
