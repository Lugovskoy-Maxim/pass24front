import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';

describe('SMS Aero Mobile ID authentication', () => {
  const service = () =>
    new SmsService(
      new ConfigService({
        SMS_ENABLED: 'true',
        SMSAERO_EMAIL: 'test@example.com',
        SMSAERO_API_KEY: 'test-key',
        SMSAERO_SIGN: 'test-sign',
      }),
    );
  const response = (status: unknown, success = true) =>
    ({
      ok: true,
      json: async () => ({ success, data: { id: 123, status } }),
    }) as Response;
  afterEach(() => jest.restoreAllMocks());

  it.each([0, 2, 3, 8, 16, undefined, null])(
    'does not authenticate provider status %s',
    async (status) => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(status));
      expect(await service().isMobileAuthVerified(123)).toBe(false);
    },
  );

  it('authenticates only final success', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(1));
    expect(await service().isMobileAuthVerified(123)).toBe(true);
  });

  it('checks the supplied OTP when status is 3 instead of bypassing verification', async () => {
    const mock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(3))
      .mockResolvedValueOnce(response(3, false));
    expect(await service().verifyMobileAuth(123, '0000')).toBe(false);
    expect(mock.mock.calls[1][0]).toContain('mobile-id/verify');
    expect(
      new URLSearchParams(mock.mock.calls[1][1]!.body as string).get('code'),
    ).toBe('0000');
  });

  it('does not accept a successful HTTP response while OTP is still required', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(3));
    expect(await service().verifyMobileAuth(123, '1234')).toBe(false);
  });

  it('reports a lost provider session as retryable infrastructure failure', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(2))
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          message: 'session not found',
          data: { id: 123, status: 2 },
        }),
      } as Response);

    await expect(service().verifyMobileAuth(123, '1234')).rejects.toThrow(
      'Сессия мобильной авторизации SMS Aero недоступна',
    );
  });

  it('accepts OTP verification only after the final status becomes 1', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(3))
      .mockResolvedValueOnce(response(3))
      .mockResolvedValueOnce(response(1));
    expect(await service().verifyMobileAuth(123, '1234')).toBe(true);
  });
});
