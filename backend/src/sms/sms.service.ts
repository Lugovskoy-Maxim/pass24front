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

    const sign = this.resolveSign();
    // Текст обязан совпадать с одобренным шаблоном SMS Aero для этой подписи (sign).
    const defaultTemplate = 'Ваш код для регистрации на pass.mstyle.ru - {code}';
    const text = (template?.includes('{code}') ? template : defaultTemplate)
      .replace(/\{code\}/g, code);

    const number = ruPhoneToSmsNumber(phone);
    this.logger.log(`SMS Aero send: sign="${sign}" (len=${sign.length}), number=${number}`);

    const response = await this.request('POST', 'sms/send', {
      number,
      sign,
      text,
    });

    if (!response.success) {
      const payload = JSON.stringify(response);
      this.logger.error(`SMS Aero send failed for ${phone} (sign="${sign}"): ${payload}`);

      // При incorrect sign — подтянуть список подписей того же аккаунта (диагностика)
      if (this.isSignIncorrect(response)) {
        const available = await this.fetchAvailableSigns().catch(() => [] as string[]);
        if (available.length) {
          this.logger.error(
            `SMS Aero available signs for this API account: ${available.map((s) => JSON.stringify(s)).join(', ')}`,
          );
        } else {
          this.logger.error(
            'SMS Aero sign/list empty or failed — проверьте SMSAERO_EMAIL / SMSAERO_API_KEY (тот же кабинет, где mts_mstyle)',
          );
        }
        throw new InternalServerErrorException(this.mapSmsAeroError(response, sign, available));
      }

      throw new InternalServerErrorException(this.mapSmsAeroError(response, sign));
    }

    this.logger.log(`Registration code SMS sent to ${phone} (sign="${sign}")`);
    return { sent: true };
  }

  /** Подпись из env: trim, снять кавычки, BOM. */
  private resolveSign(): string {
    let sign = this.configService.get<string>('SMSAERO_SIGN') || 'SMS Aero';
    sign = sign.replace(/^\uFEFF/, '').trim();
    if (
      (sign.startsWith('"') && sign.endsWith('"'))
      || (sign.startsWith("'") && sign.endsWith("'"))
    ) {
      sign = sign.slice(1, -1).trim();
    }
    return sign;
  }

  private isSignIncorrect(response: SmsAeroResponse): boolean {
    const data = response.data && typeof response.data === 'object'
      ? response.data as Record<string, unknown>
      : {};
    const signErrors = data.sign;
    return Array.isArray(signErrors)
      && signErrors.some((e) => String(e).toLowerCase() === 'incorrect');
  }

  /** GET /v2/sign/list — имена, доступные этому API-ключу. */
  private async fetchAvailableSigns(): Promise<string[]> {
    const response = await this.request('GET', 'sign/list');
    if (!response.success || response.data == null) return [];

    const data = response.data as unknown;
    // Форматы API: { data: ["SMS Aero", "mts_mstyle"] } или { data: [{ name: "..." }] }
    if (Array.isArray(data)) {
      return data.map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'name' in item) {
          return String((item as { name: unknown }).name);
        }
        if (item && typeof item === 'object' && 'sign' in item) {
          return String((item as { sign: unknown }).sign);
        }
        return '';
      }).filter(Boolean);
    }
    if (typeof data === 'object' && data !== null && 'items' in data) {
      const items = (data as { items: unknown }).items;
      if (Array.isArray(items)) {
        return items.map((i) => (typeof i === 'string' ? i : '')).filter(Boolean);
      }
    }
    return [];
  }

  private mapSmsAeroError(
    response: SmsAeroResponse,
    sign: string,
    availableSigns?: string[],
  ): string {
    const data = response.data && typeof response.data === 'object'
      ? response.data as Record<string, unknown>
      : {};
    const messageStr = typeof response.message === 'string'
      ? response.message
      : JSON.stringify(response.message ?? '');
    const lower = `${messageStr} ${JSON.stringify(data)}`.toLowerCase();

    if (this.isSignIncorrect(response)) {
      const available = availableSigns?.length
        ? ` Доступные подписи этого API-аккаунта: ${availableSigns.join(', ')}.`
        : ' Список подписей пуст или не получен — сверьте SMSAERO_EMAIL и SMSAERO_API_KEY с кабинетом, где одобрен mts_mstyle.';
      return (
        `SMS Aero: подпись «${sign}» недоступна для текущего API-ключа (sign=incorrect).${available} `
        + 'Имя в кабинете и env должны совпадать; ключ — от того же логина.'
      );
    }

    if (lower.includes('not enough money')) {
      return 'На балансе SMS Aero недостаточно средств для отправки SMS';
    }
    if (lower.includes('validation error') || lower.includes('moderation') || lower.includes('template')) {
      return (
        'SMS Aero отклонил запрос (validation). '
        + 'Проверьте SMSAERO_SIGN и текст SMS — он должен совпадать с одобренным шаблоном в кабинете.'
      );
    }
    return 'Не удалось отправить SMS с кодом подтверждения';
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    params: Record<string, string> = {},
  ): Promise<SmsAeroResponse> {
    const email = (this.configService.get<string>('SMSAERO_EMAIL') || '').trim();
    const apiKey = (this.configService.get<string>('SMSAERO_API_KEY') || '').trim();
    if (!email || !apiKey) {
      throw new BadRequestException('SMSAERO_EMAIL / SMSAERO_API_KEY не заданы');
    }
    const auth = Buffer.from(`${email}:${apiKey}`).toString('base64');

    let url = `${this.apiBase}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    };

    let body: string | undefined;
    if (method === 'GET' && Object.keys(params).length) {
      url += `?${new URLSearchParams(params).toString()}`;
    } else if (method === 'POST') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      body = new URLSearchParams(params).toString();
    }

    try {
      const res = await fetch(url, { method, headers, body });
      const data = (await res.json()) as SmsAeroResponse;
      if (!res.ok) {
        this.logger.error(`SMS Aero HTTP ${res.status} ${path}: ${JSON.stringify(data)}`);
      }
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.error(`SMS Aero request failed (${path}): ${message}`);
      throw new InternalServerErrorException('Ошибка связи с SMS-сервисом');
    }
  }
}