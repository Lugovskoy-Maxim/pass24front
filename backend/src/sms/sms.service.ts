/**
 * SMS Aero: мобильная авторизация (Mobile ID) для регистрации по телефону.
 *
 * API: gate.smsaero.ru/v2/mobile-id/{send,status,verify}
 * (официальный клиент smsaero_python: send_mobile_id / verify_mobile_id).
 *
 * Env: SMS_ENABLED=true, SMSAERO_EMAIL, SMSAERO_API_KEY, SMSAERO_SIGN (имя Mobile Auth, напр. mts_mstyle).
 * Опционально: SMSAERO_CALLBACK_URL или PUBLIC_APP_URL (+ /api/sms/mobile-id/callback).
 *
 * Обычный sms/send здесь не используется: у аккаунта Mobile Auth имя ≠ SMS-подпись sign/list.
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

export interface MobileIdSendResult {
  requestId: number;
  authType?: string;
  status?: number;
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

  /**
   * Запуск Mobile ID: SIM-PUSH + fallback SMS OTP с одобренным шаблоном имени.
   * Код генерирует SMS Aero — локально его не храним.
   */
  async startMobileAuth(phone: string): Promise<MobileIdSendResult> {
    if (!this.isConfigured()) {
      throw new BadRequestException(
        'SMS-сервис не настроен. Укажите SMSAERO_EMAIL, SMSAERO_API_KEY и SMS_ENABLED=true.',
      );
    }

    const sign = this.resolveSign();
    const number = ruPhoneToSmsNumber(phone);
    const callbackUrl = this.resolveCallbackUrl();

    this.logger.log(
      `Mobile ID send: sign="${sign}", number=${number}, callback=${callbackUrl}`,
    );

    // number — digits as integer, как в официальном smsaero_python
    const response = await this.requestJson('mobile-id/send', {
      number: Number(number),
      sign,
      callbackUrl,
    });

    if (!response.success) {
      const payload = JSON.stringify(response);
      this.logger.error(`Mobile ID send failed for ${phone} (sign="${sign}"): ${payload}`);
      throw new InternalServerErrorException(this.mapMobileIdError(response, sign));
    }

    const data = (response.data && typeof response.data === 'object'
      ? response.data
      : {}) as Record<string, unknown>;

    const requestId = Number(data.id);
    if (!Number.isFinite(requestId) || requestId <= 0) {
      this.logger.error(`Mobile ID send: no id in response: ${JSON.stringify(response)}`);
      throw new InternalServerErrorException(
        'SMS Aero не вернул id запроса мобильной авторизации',
      );
    }

    const authType = data.authType != null ? String(data.authType) : undefined;
    const status = data.status != null ? Number(data.status) : undefined;
    this.logger.log(
      `Mobile ID started for ${phone}: id=${requestId}, authType=${authType ?? '?'}, status=${status ?? '?'}`,
    );

    return { requestId, authType, status };
  }

  /**
   * Проверка: SIM-PUSH уже verified (status=2) или OTP через mobile-id/verify.
   */
  async verifyMobileAuth(requestId: number, code: string): Promise<boolean> {
    if (!this.isConfigured()) {
      throw new BadRequestException('SMS-сервис не настроен');
    }

    // SIM-PUSH: пользователь подтвердил на телефоне — код не нужен
    const already = await this.isMobileAuthVerified(requestId).catch(() => false);
    if (already) {
      this.logger.log(`Mobile ID already verified (SIM-PUSH): id=${requestId}`);
      return true;
    }

    const sign = this.resolveSign();
    const trimmed = (code || '').trim();
    if (!trimmed) {
      return false;
    }

    const response = await this.requestJson('mobile-id/verify', {
      id: requestId,
      code: trimmed,
      sign,
    });

    if (response.success) {
      const data = (response.data && typeof response.data === 'object'
        ? response.data
        : {}) as Record<string, unknown>;
      const status = data.status != null ? Number(data.status) : undefined;
      this.logger.log(
        `Mobile ID verify ok: id=${requestId}, status=${status ?? '?'}, authType=${data.authType ?? '?'}`,
      );
      return true;
    }

    const payload = JSON.stringify(response);
    this.logger.warn(`Mobile ID verify failed id=${requestId}: ${payload}`);
    return false;
  }

  /** GET/POST mobile-id/status — status=2 считается подтверждённым (как в доке/клиенте). */
  async isMobileAuthVerified(requestId: number): Promise<boolean> {
    const response = await this.requestJson('mobile-id/status', { id: requestId });
    if (!response.success || !response.data || typeof response.data !== 'object') {
      return false;
    }
    const status = Number((response.data as Record<string, unknown>).status);
    // 2 = verified (см. примеры smsaero_python verify_mobile_id)
    return status === 2;
  }

  /** Callback от SMS Aero (статусы доставки) — достаточно 200 OK. */
  handleMobileIdCallback(body: unknown): { ok: true } {
    this.logger.log(`Mobile ID callback: ${JSON.stringify(body)}`);
    return { ok: true };
  }

  private resolveCallbackUrl(): string {
    const explicit = (this.configService.get<string>('SMSAERO_CALLBACK_URL') || '').trim();
    if (explicit) return explicit;

    const appUrl = (this.configService.get<string>('PUBLIC_APP_URL') || 'https://pass.mstyle.ru')
      .trim()
      .replace(/\/$/, '');
    return `${appUrl}/api/sms/mobile-id/callback`;
  }

  /** Подпись/имя Mobile Auth из env: trim, снять кавычки, BOM. */
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

  private mapMobileIdError(response: SmsAeroResponse, sign: string): string {
    const data = response.data && typeof response.data === 'object'
      ? response.data as Record<string, unknown>
      : {};
    const messageStr = typeof response.message === 'string'
      ? response.message
      : JSON.stringify(response.message ?? '');
    const lower = `${messageStr} ${JSON.stringify(data)}`.toLowerCase();

    if (lower.includes('not enough money') || lower.includes('no credits')) {
      return 'На балансе SMS Aero недостаточно средств для мобильной авторизации';
    }
    if (
      lower.includes('sign')
      || lower.includes('incorrect')
      || lower.includes('name')
      || lower.includes('sender')
    ) {
      return (
        `SMS Aero Mobile ID: имя «${sign}» недоступно или не одобрено для мобильной авторизации. `
        + 'Проверьте SMSAERO_SIGN (имя из раздела «Мобильная авторизация», напр. mts_mstyle) '
        + 'и что API-ключ от того же кабинета.'
      );
    }
    if (lower.includes('validation') || lower.includes('moderation') || lower.includes('template')) {
      return (
        'SMS Aero отклонил запрос Mobile ID (validation). '
        + 'Проверьте одобренные шаблоны SIM-PUSH/SMS для имени в кабинете.'
      );
    }
    if (messageStr && messageStr !== 'null') {
      return `Не удалось запустить мобильную авторизацию: ${messageStr}`;
    }
    return 'Не удалось запустить мобильную авторизацию (SMS Aero)';
  }

  /** JSON POST — как в официальном smsaero_python (session.post json=...). */
  private async requestJson(
    path: string,
    body: Record<string, string | number>,
  ): Promise<SmsAeroResponse> {
    const email = (this.configService.get<string>('SMSAERO_EMAIL') || '').trim();
    const apiKey = (this.configService.get<string>('SMSAERO_API_KEY') || '').trim();
    if (!email || !apiKey) {
      throw new BadRequestException('SMSAERO_EMAIL / SMSAERO_API_KEY не заданы');
    }
    const auth = Buffer.from(`${email}:${apiKey}`).toString('base64');
    const url = `${this.apiBase}${path}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify(body),
      });
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
