import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import {
  DEFAULT_DATA_SCOPES,
  DEFAULT_TOKEN_TTL_SEC,
  MSTYLE_TOKEN_AUD,
} from './mstyle-v2.constants';

export type MstyleClientAuth = 'mtls' | 'private_key_jwt';

export type MstyleOauthClient = {
  clientId: string;
  auth: MstyleClientAuth;
  publicKey: string;
  publicKeysByKid?: Record<string, string>;
  scopes: string[];
};

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

  clientAuth(): MstyleClientAuth {
    return this.authFrom('MSTYLE_CLIENT_AUTH', 'mtls');
  }

  clientPublicKey(): string {
    return this.publicKeyFrom(
      'MSTYLE_CLIENT_PUBLIC_KEY',
      'MSTYLE_CLIENT_PUBLIC_KEY_FILE',
    );
  }

  clientKeyKid(): string | undefined {
    return (
      (this.config.get<string>('MSTYLE_CLIENT_KID') || '').trim() || undefined
    );
  }

  reconcileClientId(): string | undefined {
    return (
      (this.config.get<string>('MSTYLE_RECONCILE_CLIENT_ID') || '').trim() ||
      undefined
    );
  }

  reconcileClientAuth(): MstyleClientAuth {
    return this.authFrom('MSTYLE_RECONCILE_CLIENT_AUTH', 'private_key_jwt');
  }

  reconcileClientPublicKey(): string {
    return this.publicKeyFrom(
      'MSTYLE_RECONCILE_CLIENT_PUBLIC_KEY',
      'MSTYLE_RECONCILE_CLIENT_PUBLIC_KEY_FILE',
    );
  }

  reconcileClientKeyKid(): string | undefined {
    return (
      (this.config.get<string>('MSTYLE_RECONCILE_CLIENT_KID') || '').trim() ||
      undefined
    );
  }

  oauthClient(clientId: string): MstyleOauthClient | undefined {
    if (clientId === this.clientId()) {
      const publicKey = this.clientPublicKey();
      return {
        clientId,
        auth: this.clientAuth(),
        publicKey,
        publicKeysByKid: this.publicKeysByKid(this.clientKeyKid(), publicKey),
        scopes: this.defaultScopes(),
      };
    }
    if (clientId === this.reconcileClientId()) {
      const publicKey = this.reconcileClientPublicKey();
      return {
        clientId,
        auth: this.reconcileClientAuth(),
        publicKey,
        publicKeysByKid: this.publicKeysByKid(
          this.reconcileClientKeyKid(),
          publicKey,
        ),
        scopes: ['mstyle.changes.read'],
      };
    }
    return undefined;
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
    const reconcileClientId = this.reconcileClientId();
    if (reconcileClientId && reconcileClientId === this.clientId()) {
      throw new Error(
        'MSTYLE_RECONCILE_CLIENT_ID must differ from MSTYLE_CLIENT_ID',
      );
    }
    this.assertClientKey(
      'MSTYLE_CLIENT',
      this.clientAuth(),
      this.clientPublicKey(),
    );
    if (reconcileClientId) {
      this.assertClientKey(
        'MSTYLE_RECONCILE_CLIENT',
        this.reconcileClientAuth(),
        this.reconcileClientPublicKey(),
      );
    }
  }

  private authFrom(
    envName: string,
    fallback: MstyleClientAuth,
  ): MstyleClientAuth {
    const raw = (this.config.get<string>(envName) || fallback).toLowerCase();
    if (raw === 'private_key_jwt' || raw === 'mtls') return raw;
    throw new Error(`${envName} must be mtls or private_key_jwt`);
  }

  private publicKeyFrom(valueEnv: string, fileEnv: string): string {
    const inline = (this.config.get<string>(valueEnv) || '').trim();
    if (inline) return normalizePem(inline);

    const path = (this.config.get<string>(fileEnv) || '').trim();
    if (!path) return '';
    try {
      return normalizePem(readFileSync(path, 'utf8'));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Cannot read ${fileEnv}: ${reason}`);
    }
  }

  private assertClientKey(
    envPrefix: string,
    auth: MstyleClientAuth,
    publicKey: string,
  ) {
    if (auth === 'private_key_jwt' && !publicKey) {
      throw new Error(
        `${envPrefix}_AUTH=private_key_jwt requires ${envPrefix}_PUBLIC_KEY or ${envPrefix}_PUBLIC_KEY_FILE`,
      );
    }
    if (/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(publicKey)) {
      throw new Error(
        `${envPrefix} must use a public key; keep the private key on the calling server`,
      );
    }
  }

  private publicKeysByKid(kid: string | undefined, publicKey: string) {
    if (!kid || !publicKey) return undefined;
    return { [kid]: publicKey };
  }
}

function normalizePem(value: string): string {
  return value.trim().replace(/\\n/g, '\n');
}
