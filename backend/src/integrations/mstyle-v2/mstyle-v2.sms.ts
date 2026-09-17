import { ConfigService } from '@nestjs/config';
import { SmsAeroResponse, SmsService } from '../../sms/sms.service';

export const MSTYLE_SMS_SERVICE = Symbol('MSTYLE_SMS_SERVICE');

// Current Mobile ID OTP sessions end after 120 seconds. Keep the advertised
// lifetime within that window; email and native PASS retain their own limits.
export const MSTYLE_SMS_CHALLENGE_TTL_MS = 120_000;

export class MstyleSmsSessionExpiredError extends Error {
  constructor() {
    super('SMS Aero Mobile ID session is no longer active');
    this.name = 'MstyleSmsSessionExpiredError';
  }
}

class MstyleSmsService extends SmsService {
  protected handleMobileAuthStatusError(error: unknown): boolean {
    if (error instanceof MstyleSmsSessionExpiredError) throw error;
    return super.handleMobileAuthStatusError(error);
  }

  protected async requestForm(
    path: string,
    body: Record<string, string | number>,
  ): Promise<SmsAeroResponse> {
    const response = await super.requestForm(path, body);
    if (path === 'mobile-id/status' || path === 'mobile-id/verify') {
      const data = response.data as Record<string, unknown> | undefined;
      const inactive = response.success === true && Number(data?.status) === 2;
      const missing =
        response.success === false &&
        typeof response.message === 'string' &&
        response.message.trim().toLowerCase() === 'session not found';
      if (inactive || missing) throw new MstyleSmsSessionExpiredError();
    }
    return response;
  }
}

// V2 credentials must never fall back to the PASS registration account.
export function createMstyleSmsService(config: ConfigService): SmsService {
  const sign = (config.get<string>('MSTYLE_SMSAERO_SIGN') || '').trim();
  return new MstyleSmsService(
    new ConfigService({
      SMS_ENABLED: sign
        ? config.get<string>('MSTYLE_SMS_ENABLED') || 'false'
        : 'false',
      SMSAERO_EMAIL: config.get<string>('MSTYLE_SMSAERO_EMAIL') || '',
      SMSAERO_API_KEY: config.get<string>('MSTYLE_SMSAERO_API_KEY') || '',
      SMSAERO_SIGN: sign,
      SMSAERO_CALLBACK_URL:
        config.get<string>('MSTYLE_SMSAERO_CALLBACK_URL') || '',
      PUBLIC_APP_URL:
        config.get<string>('PUBLIC_APP_URL') || 'https://pass.mstyle.ru',
    }),
  );
}
