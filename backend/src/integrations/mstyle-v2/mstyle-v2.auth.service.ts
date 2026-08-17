import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { normalizeRuMobilePhone } from '../../common/phone';
import {
  ALLOWED_AUTH_PAIRS,
  AUTH_SUCCESS_REPLAY_MS,
  CHALLENGE_TTL_MS,
  CODE_LENGTH,
  MAX_VERIFY_ATTEMPTS,
  POLL_AFTER_MS,
  RESEND_MIN_MS,
} from './mstyle-v2.constants';
import { MstyleV2Config } from './mstyle-v2.config';
import { dummyHashWork, hmacHex, normalizeEmail } from './mstyle-v2.crypto';
import { Ids } from './mstyle-v2.ids';
import {
  identityStatusFromUser,
  MstyleIdentityService,
} from './mstyle-v2.identities';
import { nowIso, schema } from './mstyle-v2.present';
import { MstyleResult, problem } from './mstyle-v2.problem';
import { MstyleRateLimitService } from './mstyle-v2.rate-limit';
import { MstyleChallenge, MstyleChallengeDocument } from './mstyle-v2.schemas';
import type {
  CodeChallengeDto,
  PasswordVerifyDto,
  VerifyCodeDto,
} from './mstyle-v2.dto';

@Injectable()
export class MstyleAuthService {
  constructor(
    private readonly cfg: MstyleV2Config,
    private readonly identities: MstyleIdentityService,
    private readonly rates: MstyleRateLimitService,
    @InjectModel(MstyleChallenge.name)
    private readonly challenges: Model<MstyleChallengeDocument>,
  ) {}

  async verifyPassword(
    dto: PasswordVerifyDto,
    clientId: string,
    ip: string,
  ): Promise<MstyleResult> {
    this.rates.consume('startByIp', ip);
    this.rates.consume('startByClientIp', `${clientId}:${ip}`);
    const idKey = this.rates.identifierKey(
      `login:${dto.login.trim().toLowerCase()}`,
    );
    this.rates.consume('startByIdentifier', idKey);

    const user = await this.identities.findUserByLogin(dto.login);
    if (!user) {
      await this.identities.dummyPasswordWork(dto.password);
      problem(401, 'INVALID_CREDENTIALS');
    }
    const status = identityStatusFromUser(user);
    const ok = await this.identities.verifyUserPassword(user, dto.password);
    if (!ok || !this.identities.usableForAuth(status)) {
      problem(401, 'INVALID_CREDENTIALS');
    }
    const identity = await this.identities.ensureFromUser(user);
    if (identity.identityStatus !== 'active') {
      problem(401, 'INVALID_CREDENTIALS');
    }
    return new MstyleResult(
      schema({
        authenticationId: Ids.authentication(),
        subject: identity.subject,
        identityStatus: identity.identityStatus,
        authVersion: identity.authVersion,
        authenticatedAt: nowIso(),
        authenticationMethod: 'password',
      }),
      200,
      { 'Cache-Control': 'no-store' },
    );
  }

  async startCodeChallenge(
    dto: CodeChallengeDto,
    clientId: string,
    ip: string,
  ): Promise<MstyleResult> {
    if (
      !ALLOWED_AUTH_PAIRS.some(
        ([type, channel]) =>
          type === dto.identifier.type && channel === dto.channel,
      )
    ) {
      problem(422, 'VALIDATION_FAILED', {
        errors: [
          {
            field: 'channel',
            code: 'unsupported_pair',
            message: 'identifier.type + channel is not allowed',
          },
        ],
      });
    }

    const normalized = this.normalizeIdentifier(
      dto.identifier.type,
      dto.identifier.value,
    );
    if (!normalized) {
      problem(422, 'VALIDATION_FAILED', {
        errors: [
          {
            field: 'identifier.value',
            code: 'invalid',
            message: 'Invalid identifier',
          },
        ],
      });
    }

    this.rates.consume('startByIp', ip);
    this.rates.consume('startByClientIp', `${clientId}:${ip}`);
    this.rates.consume(
      'startByIdentifier',
      this.rates.identifierKey(`${dto.identifier.type}:${normalized}`),
    );

    const user = await this.identities.findUserByIdentifier(
      dto.identifier.type,
      normalized,
    );
    let subject: string | null = null;
    let isDummy = true;
    if (user) {
      const status = identityStatusFromUser(user);
      if (this.identities.usableForAuth(status)) {
        const identity = await this.identities.ensureFromUser(user);
        subject = identity.subject;
        isDummy = false;
      }
    } else {
      const identity = await this.identities.findIdentityByIdentifier(
        dto.identifier.type,
        normalized,
      );
      if (identity && this.identities.usableForAuth(identity.identityStatus)) {
        subject = identity.subject;
        isDummy = false;
      }
    }

    dummyHashWork(this.cfg.rateLimitSecret(), normalized);

    const challengeId = Ids.challenge();
    const now = Date.now();
    const code = this.cfg.mockOtp();
    const challenge = await this.challenges.create({
      challengeId,
      kind: 'auth',
      clientId,
      status: 'dispatch_pending',
      channel: dto.channel,
      identifierType: dto.identifier.type,
      identifierHash: hmacHex(
        this.cfg.rateLimitSecret(),
        `${dto.identifier.type}:${normalized}`,
      ),
      subject,
      isDummy,
      codeHash: await bcrypt.hash(code, 8),
      codeLength: CODE_LENGTH,
      verifyAttempts: 0,
      expiresAt: new Date(now + CHALLENGE_TTL_MS),
      resendAfter: new Date(now + RESEND_MIN_MS),
      telegramAction:
        dto.channel === 'telegram'
          ? this.telegramAction(challengeId)
          : undefined,
    });

    setTimeout(() => {
      void this.challenges.updateOne(
        { challengeId, status: 'dispatch_pending' },
        { $set: { status: 'awaiting_code' } },
      );
    }, 200);

    return new MstyleResult(this.challengeDto(challenge), 202, {
      'Cache-Control': 'no-store',
    });
  }

  async getChallenge(
    challengeId: string,
    clientId: string,
  ): Promise<MstyleResult> {
    const challenge = await this.loadChallenge(challengeId, clientId);
    this.expireIfNeeded(challenge);
    await challenge.save();
    return new MstyleResult(this.challengeDto(challenge), 200, {
      'Cache-Control': 'no-store',
    });
  }

  async resend(
    challengeId: string,
    clientId: string,
    ip: string,
  ): Promise<MstyleResult> {
    const challenge = await this.loadChallenge(challengeId, clientId);
    this.expireIfNeeded(challenge);
    if (challenge.status === 'expired') problem(410, 'CHALLENGE_EXPIRED');
    if (challenge.status === 'consumed') problem(409, 'CHALLENGE_CONSUMED');
    if (challenge.resendAfter.getTime() > Date.now()) {
      const retryAfter = Math.ceil(
        (challenge.resendAfter.getTime() - Date.now()) / 1000,
      );
      problem(429, 'RATE_LIMITED', { retryable: true, retryAfter });
    }
    this.rates.consume('resendByChallenge', challengeId);
    this.rates.consume('startByIp', ip);

    const now = Date.now();
    const code = this.cfg.mockOtp();
    challenge.codeHash = await bcrypt.hash(code, 8);
    challenge.status = 'dispatch_pending';
    challenge.verifyAttempts = 0;
    challenge.expiresAt = new Date(now + CHALLENGE_TTL_MS);
    challenge.resendAfter = new Date(now + RESEND_MIN_MS);
    if (challenge.channel === 'telegram') {
      challenge.telegramAction = this.telegramAction(challenge.challengeId);
    }
    await challenge.save();
    setTimeout(() => {
      void this.challenges.updateOne(
        { challengeId, status: 'dispatch_pending' },
        { $set: { status: 'awaiting_code' } },
      );
    }, 200);
    return new MstyleResult(this.challengeDto(challenge), 202, {
      'Cache-Control': 'no-store',
    });
  }

  async verifyCode(
    challengeId: string,
    dto: VerifyCodeDto,
    clientId: string,
    ip: string,
  ): Promise<MstyleResult> {
    this.rates.consume('verifyByIp', ip);
    const challenge = await this.loadChallenge(challengeId, clientId);
    this.expireIfNeeded(challenge);
    if (challenge.status === 'expired') problem(410, 'CHALLENGE_EXPIRED');
    if (challenge.status === 'consumed') {
      if (
        challenge.consumedAt &&
        Date.now() - challenge.consumedAt.getTime() <= AUTH_SUCCESS_REPLAY_MS &&
        challenge.consumedAuthJson
      ) {
        const stored = JSON.parse(challenge.consumedAuthJson);
        const identity = stored.subject
          ? await this.identities.findIdentityBySubject(stored.subject)
          : null;
        if (
          identity &&
          identity.identityStatus === 'active' &&
          identity.authVersion === stored.authVersion
        ) {
          return new MstyleResult(stored, 200, { 'Cache-Control': 'no-store' });
        }
        problem(401, 'INVALID_CREDENTIALS');
      }
      problem(409, 'CHALLENGE_CONSUMED');
    }

    if (challenge.verifyAttempts >= MAX_VERIFY_ATTEMPTS) {
      problem(429, 'RATE_LIMITED', { retryable: false, retryAfter: 60 });
    }

    const matches = await bcrypt.compare(dto.code, challenge.codeHash);
    challenge.verifyAttempts += 1;
    if (!matches || challenge.isDummy || !challenge.subject) {
      await challenge.save();
      problem(401, 'INVALID_CREDENTIALS');
    }

    const identity = await this.identities.findIdentityBySubject(
      challenge.subject,
    );
    if (
      !identity ||
      identity.identityStatus !== 'active' ||
      !this.identities.usableForAuth(identity.identityStatus)
    ) {
      await challenge.save();
      problem(401, 'INVALID_CREDENTIALS');
    }

    const body = schema({
      authenticationId: Ids.authentication(),
      subject: identity.subject,
      identityStatus: identity.identityStatus,
      authVersion: identity.authVersion,
      authenticatedAt: nowIso(),
      authenticationMethod: challenge.channel || 'sms',
    });
    challenge.status = 'consumed';
    challenge.consumedAt = new Date();
    challenge.consumedAuthJson = JSON.stringify(body);
    await challenge.save();
    return new MstyleResult(body, 200, { 'Cache-Control': 'no-store' });
  }

  async rejectConsumedNewKey(challengeId: string, clientId: string) {
    const challenge = await this.challenges.findOne({ challengeId });
    if (
      challenge &&
      challenge.clientId === clientId &&
      challenge.status === 'consumed'
    ) {
      problem(409, 'CHALLENGE_CONSUMED');
    }
  }

  private async loadChallenge(challengeId: string, clientId: string) {
    const challenge = await this.challenges.findOne({ challengeId });
    if (!challenge || challenge.clientId !== clientId) {
      problem(404, 'NOT_FOUND');
    }
    return challenge;
  }

  private expireIfNeeded(challenge: MstyleChallengeDocument) {
    if (
      challenge.status !== 'consumed' &&
      challenge.expiresAt.getTime() <= Date.now()
    ) {
      challenge.status = 'expired';
    }
  }

  private challengeDto(challenge: MstyleChallengeDocument) {
    const body: Record<string, unknown> = {
      schemaVersion: '2.0',
      challengeId: challenge.challengeId,
      status: challenge.status,
      channel: challenge.channel,
      codeLength: challenge.codeLength,
      expiresAt: challenge.expiresAt.toISOString(),
      resendAfter: challenge.resendAfter.toISOString(),
      pollAfterMs: POLL_AFTER_MS,
    };
    if (challenge.channel === 'telegram') {
      body.telegramAction =
        challenge.telegramAction || this.telegramAction(challenge.challengeId);
    }
    return body;
  }

  private telegramAction(challengeId: string) {
    const opaque = hmacHex(
      this.cfg.rateLimitSecret(),
      `tg:${challengeId}`,
    ).slice(0, 24);
    const bot = this.cfg.telegramBot();
    return {
      botUsername: bot,
      deepLink: `https://t.me/${bot}?start=${opaque}`,
    };
  }

  private normalizeIdentifier(type: 'phone' | 'email', value: string) {
    return type === 'phone'
      ? normalizeRuMobilePhone(value)
      : normalizeEmail(value);
  }
}
