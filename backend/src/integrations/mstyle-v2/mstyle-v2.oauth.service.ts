import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { jwtReplayKey, verifyRegisteredJwt } from './mstyle-v2.jwt';
import { Model } from 'mongoose';
import { MstyleV2Config, type MstyleOauthClient } from './mstyle-v2.config';
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
import {
  DEFAULT_DATA_SCOPES,
  DEFAULT_TOKEN_TTL_SEC,
  MSTYLE_ADMIN_PROBE_CLIENT_ID,
} from './mstyle-v2.constants';

type TokenForm = {
  grant_type?: string;
  client_id?: string;
  scope?: string;
  client_assertion_type?: string;
  client_assertion?: string;
};

@Injectable()
export class MstyleOauthService {
  constructor(
    private readonly cfg: MstyleV2Config,
    @InjectModel(MstyleServiceToken.name)
    private readonly tokens: Model<MstyleServiceTokenDocument>,
    @InjectModel(MstyleOauthJti.name)
    private readonly jtis: Model<MstyleOauthJtiDocument>,
    private readonly siteSettings: SiteSettingsService,
  ) {}

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
    const client = clientId ? this.cfg.oauthClient(clientId) : undefined;
    if (!client) {
      throw new OAuthException('invalid_client', 'Unknown client_id', 401);
    }

    if (client.auth === 'private_key_jwt') {
      await this.verifyAssertion(form, client);
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
    if (requested.length !== 1) {
      throw new OAuthException(
        'invalid_scope',
        'Exactly one scope must be requested',
      );
    }
    const allowed = new Set(client.scopes);
    const scope = requested[0];
    if (!allowed.has(scope)) {
      throw new OAuthException(
        'invalid_scope',
        'Requested scope is not allowed',
      );
    }

    return this.createServiceToken(clientId, [scope], this.cfg.tokenTtlSec());
  }

  /**
   * Short-lived, full-scope token for the authenticated admin API console.
   * This deliberately bypasses OAuth client authentication so production
   * private keys never have to be copied to Pass or exposed to the browser.
   */
  issueAdminProbeToken() {
    const ttl = Math.min(this.cfg.tokenTtlSec(), DEFAULT_TOKEN_TTL_SEC);
    return this.createServiceToken(
      MSTYLE_ADMIN_PROBE_CLIENT_ID,
      [...DEFAULT_DATA_SCOPES],
      ttl,
    );
  }

  private async createServiceToken(
    clientId: string,
    scopes: string[],
    ttl: number,
  ) {
    const accessToken = Ids.token();
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

  private async verifyAssertion(form: TokenForm, client: MstyleOauthClient) {
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
    let claims: Record<string, unknown>;
    try {
      claims = verifyRegisteredJwt(assertion, client, 'JWT', [
        'iss',
        'sub',
        'aud',
        'iat',
        'exp',
        'jti',
      ]);
      if (
        claims.iss !== client.clientId ||
        claims.sub !== client.clientId ||
        typeof claims.aud !== 'string' ||
        !this.cfg.tokenEndpointAudiences().includes(claims.aud) ||
        !Number.isSafeInteger(claims.iat) ||
        !Number.isSafeInteger(claims.exp) ||
        typeof claims.jti !== 'string' ||
        !claims.jti ||
        claims.jti.length > 128
      )
        throw new Error('claims');
      const now = Math.floor(Date.now() / 1000);
      const iat = claims.iat as number,
        exp = claims.exp as number;
      if (exp - iat <= 0 || exp - iat > 60 || iat > now + 5 || now >= exp + 5)
        throw new Error('time');
    } catch {
      throw new OAuthException(
        'invalid_client',
        'Invalid client assertion',
        401,
      );
    }
    const key = jwtReplayKey(client.clientId, 'JWT', claims.jti as string);
    try {
      if (
        await this.jtis.findOne({
          jti: claims.jti,
          clientId: client.clientId,
          expiresAt: { $gt: new Date() },
        })
      ) {
        throw new OAuthException(
          'invalid_client',
          'Assertion already used',
          401,
        );
      }
      await this.jtis.create(
        [
          {
            jti: key,
            clientId: client.clientId,
            nonce: claims.jti,
            tokenType: 'JWT',
            expiresAt: new Date(((claims.exp as number) + 5) * 1000),
          },
        ],
        { w: 'majority' },
      );
    } catch (error) {
      if (error instanceof OAuthException) throw error;
      if ((error as { code?: number }).code === 11000)
        throw new OAuthException(
          'invalid_client',
          'Assertion already used',
          401,
        );
      throw new OAuthException(
        'temporarily_unavailable',
        'Assertion replay store unavailable',
        503,
      );
    }
  }
}
