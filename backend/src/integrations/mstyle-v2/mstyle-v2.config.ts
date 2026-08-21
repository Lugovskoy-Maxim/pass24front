import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_DATA_SCOPES,
  DEFAULT_TOKEN_TTL_SEC,
  MSTYLE_TOKEN_AUD,
} from './mstyle-v2.constants';

@Injectable()
export class MstyleV2Config {
  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    const raw = (this.config.get<string>('MSTYLE_PRIVATE_API_ENABLED') || '')
      .trim()
      .toLowerCase();
    if (raw === 'true' || raw === '1' || raw === 'yes') return true;
    if (raw === 'false' || raw === '0' || raw === 'no') return false;
    return this.config.get<string>('NODE_ENV') !== 'production';
  }

  isProduction(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  clientId(): string {
    return (
      this.config.get<string>('MSTYLE_CLIENT_ID') || 'mstyle-backend-staging'
    );
  }

  clientAuth(): 'mtls' | 'private_key_jwt' {
    const raw = (
      this.config.get<string>('MSTYLE_CLIENT_AUTH') || 'mtls'
    ).toLowerCase();
    return raw === 'private_key_jwt' ? 'private_key_jwt' : 'mtls';
  }

  clientPublicKey(): string {
    return (this.config.get<string>('MSTYLE_CLIENT_PUBLIC_KEY') || '').trim();
  }

  tokenTtlSec(): number {
    const n = Number(this.config.get<string>('MSTYLE_TOKEN_TTL_SEC'));
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_TOKEN_TTL_SEC;
  }

  tokenAudience(): string {
    return this.config.get<string>('MSTYLE_TOKEN_AUD') || MSTYLE_TOKEN_AUD;
  }

  defaultScopes(): string[] {
    const raw = this.config.get<string>('MSTYLE_CLIENT_SCOPES');
    if (raw?.trim()) {
      return raw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [...DEFAULT_DATA_SCOPES];
  }

  piiSecret(): string {
    return (
      this.config.get<string>('MSTYLE_PII_KEY') ||
      this.config.get<string>('JWT_SECRET') ||
      'mstyle-v2-dev-pii-key'
    );
  }

  idempotencySecret(): string {
    return (
      this.config.get<string>('MSTYLE_IDEMPOTENCY_SECRET') ||
      `${this.piiSecret()}:idem`
    );
  }

  rateLimitSecret(): string {
    return (
      this.config.get<string>('MSTYLE_RATE_LIMIT_SECRET') ||
      `${this.piiSecret()}:rate`
    );
  }

  mockOtp(): string {
    return this.config.get<string>('MSTYLE_MOCK_OTP') || '123456';
  }

  mockResponsesDefaultEnabled(): boolean {
    const raw = (this.config.get<string>('MSTYLE_MOCK_RESPONSES') || '')
      .trim()
      .toLowerCase();
    if (raw === 'true' || raw === '1' || raw === 'yes') return true;
    if (raw === 'false' || raw === '0' || raw === 'no') return false;
    return !this.isProduction();
  }

  telegramBot(): string {
    return this.config.get<string>('MSTYLE_TELEGRAM_BOT') || 'mstyleauthbot';
  }

  environment(): string {
    return this.config.get<string>('MSTYLE_ENVIRONMENT') || 'staging';
  }

  publicBaseUrl(): string {
    return (
      this.config.get<string>('MSTYLE_PUBLIC_BASE_URL') ||
      this.config.get<string>('PUBLIC_API_URL') ||
      this.config.get<string>('PUBLIC_APP_URL') ||
      'http://localhost:4000'
    ).replace(/\/+$/, '');
  }

  tokenEndpointAudiences(): string[] {
    const extra = (this.config.get<string>('MSTYLE_TOKEN_ENDPOINT_AUD') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const base = this.publicBaseUrl();
    return [
      ...new Set([
        `${base}/oauth2/token`,
        `${base}/api/oauth2/token`,
        ...extra,
      ]),
    ];
  }

  dispatchEnabled(): boolean {
    const raw = (
      this.config.get<string>('MSTYLE_DISPATCH_ENABLED') || ''
    ).toLowerCase();
    return raw === 'true' || raw === '1';
  }

  assertReady(): void {
    if (!this.isEnabled()) return;
    if (this.isProduction() && !this.config.get<string>('MSTYLE_CLIENT_ID')) {
      throw new Error(
        'MSTYLE_PRIVATE_API_ENABLED=true in production requires MSTYLE_CLIENT_ID',
      );
    }
    if (
      this.isEnabled() &&
      this.clientAuth() === 'private_key_jwt' &&
      !this.clientPublicKey()
    ) {
      throw new Error(
        'MSTYLE_CLIENT_AUTH=private_key_jwt requires MSTYLE_CLIENT_PUBLIC_KEY',
      );
    }
  }
}
