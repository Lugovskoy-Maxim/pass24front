/**
 * Отправка OTP через SMS Aero HTTP API v2 (gate.smsaero.ru).
 *
 * Env: SMS_ENABLED=true, SMSAERO_EMAIL, SMSAERO_API_KEY, SMSAERO_SIGN.
 * Basic auth: email:apiKey. Номер — digits only (ruPhoneToSmsNumber).
 * Rate-limit «1 SMS / 5 мин» — в AuthService (lastCodeSentAt), не здесь.
 *
 * SMPP в .env.example — справочно; для OTP используется HTTP, не SMPP.
 */
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ruPhoneToSmsNumber } from '../common/phone';

interface SmsAeroResponse {
  success?: boolean;
  message?: string | Record<string, unknown>;
  data?: unknown;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly apiBase = 'https://gate.smsaero.ru/v2/';

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return this.configService.get<string>('SMS_ENABLED') === 'true'
      && !!this.configService.get<string>('SMSAERO_EMAIL')
      && !!this.configService.get<string>('SMSAERO_API_KEY');
  }

  /** Авторизационное SMS с кодом регистрации. template должен содержать `{code}`. */
  async sendRegistrationCode(phone: string, code: string, template?: string) {
    if (!this.isConfigured()) {
      throw new BadRequestException(
        'SMS-сервис не настроен. Укажите SMSAERO_EMAIL, SMSAERO_API_KEY и SMS_ENABLED=true.',
      );
    }

    const sign = this.configService.get<string>('SMSAERO_SIGN') || 'SMS Aero';
    const text = (template?.includes('{code}') ? template : 'Код подтверждения регистрации: {code}. Действует 15 минут.')
      .replace(/\{code\}/g, code);

    const response = await this.request('POST', 'sms/send', {
      number: ruPhoneToSmsNumber(phone),
      sign,
      text,
    });

    if (!response.success) {
      const detail = typeof response.message === 'string'
        ? response.message
        : JSON.stringify(response.message);
      this.logger.error(`SMS Aero send failed for ${phone}: ${detail}`);
      const userMessage = this.mapSmsAeroError(detail);
      throw new InternalServerErrorException(userMessage);
    }

    this.logger.log(`Registration code SMS sent to ${phone}`);
    return { sent: true };
  }

  private mapSmsAeroError(detail: string): string {
    const lower = detail.toLowerCase();
    if (lower.includes('not enough money')) {
      return 'На балансе SMS Aero недостаточно средств для отправки SMS';
    }
    if (lower.includes('incorrect') && lower.includes('sign')) {
      return 'Неверная подпись отправителя SMS. Проверьте SMSAERO_SIGN в настройках';
    }
    if (lower.includes('validation error')) {
      return 'SMS-сервис отклонил запрос. Проверьте номер телефона и настройки SMS Aero';
    }
    return 'Не удалось отправить SMS с кодом подтверждения';
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    params: Record<string, string> = {},
  ): Promise<SmsAeroResponse> {
    const email = this.configService.get<string>('SMSAERO_EMAIL')!;
    const apiKey = this.configService.get<string>('SMSAERO_API_KEY')!;
    const auth = Buffer.from(`${email}:${apiKey}`).toString('base64');

    let url = `${this.apiBase}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Basic ${auth}`,
    };

    let body: string | undefined;
    if (method === 'GET' && Object.keys(params).length) {
      url += `?${new URLSearchParams(params).toString()}`;
    } else if (method === 'POST') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(params).toString();
    }

    try {
      const res = await fetch(url, { method, headers, body });
      const data = (await res.json()) as SmsAeroResponse;
      if (!res.ok) {
        this.logger.error(`SMS Aero HTTP ${res.status}: ${JSON.stringify(data)}`);
      }
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.error(`SMS Aero request failed: ${message}`);
      throw new InternalServerErrorException('Ошибка связи с SMS-сервисом');
    }
  }
}