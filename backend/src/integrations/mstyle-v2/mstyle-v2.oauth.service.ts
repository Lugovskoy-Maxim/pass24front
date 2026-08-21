import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createPublicKey, createVerify } from 'crypto';
import { Model } from 'mongoose';
import { MstyleV2Config } from './mstyle-v2.config';
import { DEFAULT_DATA_SCOPES } from './mstyle-v2.constants';
import { sha256Hex } from './mstyle-v2.crypto';
import { Ids } from './mstyle-v2.ids';
import { OAuthException } from './mstyle-v2.problem';
import {
  MstyleOauthJti,
  MstyleOauthJtiDocument,
  MstyleServiceToken,
  MstyleServiceTokenDocument,
} from './mstyle-v2.schemas';
import { SiteSettingsService } from '../../site-settings/site-settings.service';

type TokenForm = {
  grant_type?: string;
  client_id?: string;
  scope?: string;
  client_assertion_type?: string;
  client_assertion?: string;
};

@Injectable()
export class MstyleOauthService implements OnModuleInit {
  constructor(
    private readonly cfg: MstyleV2Config,
    @InjectModel(MstyleServiceToken.name)
    private readonly tokens: Model<MstyleServiceTokenDocument>,
    @InjectModel(MstyleOauthJti.name)
    private readonly jtis: Model<MstyleOauthJtiDocument>,
    private readonly siteSettings: SiteSettingsService,
  ) {}

  onModuleInit() {
    this.cfg.assertReady();
  }

  async issueToken(form: TokenForm) {
    const mockMode = await this.siteSettings.getMstyleMockResponsesEnabled(
      this.cfg.mockResponsesDefaultEnabled(),
    );
    if (!this.cfg.isEnabled() && !mockMode.enabled) {
      throw new OAuthException('invalid_request', 'endpoint disabled', 404);
    }
    if (form.grant_type !== 'client_credentials') {
      throw new OAuthException(
        'unsupported_grant_type',
        'grant_type must be client_credentials',
      );
    }
    const clientId = (form.client_id || '').trim();
    if (!clientId || clientId !== this.cfg.clientId()) {
      throw new OAuthException('invalid_client', 'Unknown client_id', 401);
    }

    const auth = this.cfg.clientAuth();
    if (auth === 'private_key_jwt') {
      await this.verifyAssertion(form, clientId);
    } else if (form.client_assertion || form.client_assertion_type) {
      throw new OAuthException(
        'invalid_client',
        'client_assertion is not used for mTLS clients',
        401,
      );
    }

    const requested = (form.scope || '')
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const allowed = new Set(this.cfg.defaultScopes());
    const scopes = requested.length
      ? requested.filter((scope) => allowed.has(scope))
      : [...DEFAULT_DATA_SCOPES];
    if (requested.length && scopes.length !== requested.length) {
      throw new OAuthException(
        'invalid_scope',
        'One or more requested scopes are not allowed',
      );
    }
    if (!scopes.length) {
      throw new OAuthException('invalid_scope', 'No scopes granted');
    }

    const accessToken = Ids.token();
    const ttl = this.cfg.tokenTtlSec();
    await this.tokens.create({
      tokenHash: sha256Hex(accessToken),
      clientId,
      scopes,
      aud: this.cfg.tokenAudience(),
      expiresAt: new Date(Date.now() + ttl * 1000),
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ttl,
      scope: scopes.join(' '),
    };
  }

  private async verifyAssertion(form: TokenForm, clientId: string) {
    const expectedType =
      'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
    if (form.client_assertion_type !== expectedType) {
      throw new OAuthException(
        'invalid_client',
        'client_assertion_type must be jwt-bearer',
        401,
      );
    }
    const assertion = form.client_assertion || '';
    if (!assertion) {
      throw new OAuthException(
        'invalid_client',
        'client_assertion required',
        401,
      );
    }
    const claims = verifyClientJwt(assertion, this.cfg.clientPublicKey());
    if (claims.iss !== clientId || claims.sub !== clientId) {
      throw new OAuthException('invalid_client', 'iss/sub mismatch', 401);
    }
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const allowedAud = this.cfg.tokenEndpointAudiences();
    if (!aud.some((value) => allowedAud.includes(String(value)))) {
      throw new OAuthException('invalid_client', 'aud mismatch', 401);
    }
    const exp = Number(claims.exp);
    const iat = Number(claims.iat);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(exp) || exp <= now) {
      throw new OAuthException('invalid_client', 'assertion expired', 401);
    }
    if (Number.isFinite(iat) && exp - iat > 60) {
      throw new OAuthException(
        'invalid_client',
        'assertion lifetime must be <= 60 seconds',
        401,
      );
    }
    const jti = String(claims.jti || '');
    if (!jti) {
      throw new OAuthException('invalid_client', 'jti required', 401);
    }
    try {
      await this.jtis.create({
        jti,
        clientId,
        expiresAt: new Date(exp * 1000),
      });
    } catch {
      throw new OAuthException('invalid_client', 'jti already used', 401);
    }
  }
}

function verifyClientJwt(token: string, pem: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new OAuthException('invalid_client', 'Malformed assertion', 401);
  }
  let header: { alg?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(base64urlJson(parts[0]));
    payload = JSON.parse(base64urlJson(parts[1]));
  } catch {
    throw new OAuthException('invalid_client', 'Malformed assertion', 401);
  }
  const alg = header.alg || '';
  if (!['RS256', 'ES256'].includes(alg)) {
    throw new OAuthException(
      'invalid_client',
      'Unsupported assertion alg',
      401,
    );
  }
  if (!pem) {
    throw new OAuthException(
      'invalid_client',
      'Client key is not configured',
      401,
    );
  }
  try {
    const key = createPublicKey(pem);
    const verifier = createVerify('SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    verifier.end();
    const signature = Buffer.from(parts[2], 'base64url');
    const ok = verifier.verify(key, signature);
    if (!ok) {
      throw new OAuthException(
        'invalid_client',
        'Invalid assertion signature',
        401,
      );
    }
  } catch (err) {
    if (err instanceof OAuthException) throw err;
    throw new OAuthException(
      'invalid_client',
      'Invalid assertion signature',
      401,
    );
  }
  return payload;
}

function base64urlJson(part: string): string {
  return Buffer.from(part, 'base64url').toString('utf8');
}
