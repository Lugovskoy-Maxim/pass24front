import { ConfigService } from '@nestjs/config';
import { SmsService } from '../../sms/sms.service';

export const MSTYLE_SMS_SERVICE = Symbol('MSTYLE_SMS_SERVICE');

// V2 credentials must never fall back to the PASS registration account.
export function createMstyleSmsService(config: ConfigService): SmsService {
  const sign = (config.get<string>('MSTYLE_SMSAERO_SIGN') || '').trim();
  return new SmsService(
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
