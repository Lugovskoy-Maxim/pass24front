import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * HTTP-клиент к docker/telegram-gateway.
 * Gateway (через WireGuard) дергает api.telegram.org; backend остаётся в LAN.
 */
@Injectable()
export class TelegramGatewayService {
  private readonly logger = new Logger(TelegramGatewayService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.baseUrl());
  }

  /**
   * Регистрирует OTP до того, как пользователь откроет deep link /start.
   * startToken должен совпадать с payload в https://t.me/bot?start=TOKEN
   */
  async registerPendingOtp(params: {
    startToken: string;
    code: string;
    text?: string;
  }): Promise<boolean> {
    return this.post('/v1/pending', params);
  }

  async sendOtp(params: {
    chatId: string | number;
    code: string;
    text?: string;
  }): Promise<boolean> {
    return this.post('/v1/send', params);
  }

  private baseUrl(): string {
    return (this.config.get<string>('TELEGRAM_GATEWAY_URL') || '')
      .trim()
      .replace(/\/+$/, '');
  }

  private token(): string {
    return (this.config.get<string>('TELEGRAM_GATEWAY_TOKEN') || '').trim();
  }

  private async post(
    path: string,
    body: Record<string, unknown>,
  ): Promise<boolean> {
    const base = this.baseUrl();
    if (!base) {
      this.logger.debug('TELEGRAM_GATEWAY_URL not set — skip telegram send');
      return false;
    }
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    const token = this.token();
    if (token) headers.authorization = `Bearer ${token}`;

    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(
          `telegram-gateway ${path} → HTTP ${res.status} ${text.slice(0, 200)}`,
        );
        return false;
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`telegram-gateway ${path} failed: ${message}`);
      return false;
    }
  }
}
