import { Inject, Injectable, Logger } from '@nestjs/common';
import { MSTYLE_SMS_SERVICE } from './mstyle-v2.sms';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { generateOtpCode } from '../../common/otp-code';
import { normalizeRuMobilePhone } from '../../common/phone';
import { MailService } from '../../mail/mail.service';
import { SmsService } from '../../sms/sms.service';
import { TelegramGatewayService } from '../../telegram/telegram-gateway.service';
import {
  ALLOWED_AUTH_PAIRS,
  AUTH_SUCCESS_REPLAY_MS,
  CHALLENGE_TTL_MS,
  STEP_UP_TTL_MS,
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
import {
  MstyleAuthentication,
  MstyleAuthenticationDocument,
  MstyleChallenge,
  MstyleChallengeDocument,
} from './mstyle-v2.schemas';
import type {
  CodeChallengeDto,
  PasswordVerifyDto,
  VerifyCodeDto,
} from './mstyle-v2.dto';

@Injectable()
export class MstyleAuthService {
  private readonly logger = new Logger(MstyleAuthService.name);

  constructor(
    private readonly cfg: MstyleV2Config,
    private readonly identities: MstyleIdentityService,
    private readonly rates: MstyleRateLimitService,
    @InjectModel(MstyleChallenge.name)
    private readonly challenges: Model<MstyleChallengeDocument>,
    @InjectModel(MstyleAuthentication.name)
    private readonly authentications: Model<MstyleAuthenticationDocument>,
    @Inject(MSTYLE_SMS_SERVICE) private readonly sms: SmsService,
    private readonly mail: MailService,
    private readonly telegramGateway: TelegramGatewayService,
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
    const currentUser = await this.identities.findUserByLogin(dto.login);
    if (
      identity.identityStatus !== 'active' ||
      !currentUser ||
      String(currentUser._id) !== String(user._id) ||
      currentUser.password !== user.password ||
      currentUser.authVersion !== user.authVersion ||
      !this.identities.usableForAuth(identityStatusFromUser(currentUser))
    ) {
      problem(401, 'INVALID_CREDENTIALS');
    }
    const body = await this.issueAuthentication(
      identity.subject,
      identity.authVersion,
      'password',
    );
    return new MstyleResult(body, 200, { 'Cache-Control': 'no-store' });
  }

  async startCodeChallenge(
    dto: CodeChallengeDto,
    clientId: string,
    ip: string,
  ): Promise<MstyleResult> {
    this.assertOtpMode();
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

    let identity = await this.identities.findIdentityByIdentifier(
      dto.identifier.type,
      normalized,
    );
    if (!identity) {
      const user = await this.identities.findUserByIdentifier(
        dto.identifier.type,
        normalized,
      );
      if (user && this.identities.usableForAuth(identityStatusFromUser(user)))
        identity = await this.identities.ensureFromUser(user);
    }
    let subject: string | null = null;
    let isDummy = true;
    if (
      identity &&
      this.identities.usableForAuth(identity.identityStatus) &&
      identity[dto.identifier.type] === normalized
    ) {
      subject = identity.subject;
      isDummy = false;
    }

    dummyHashWork(this.cfg.rateLimitSecret(), normalized);

    const challengeId = Ids.challenge();
    const now = Date.now();
    const useSmsAero = this.useSmsAero(dto.identifier.type, dto.channel);
    if (useSmsAero) this.requireSmsAero();
    const code = this.issueChallengeCode({
      isDummy,
      useSmsAero,
    });
    const mobileId =
      useSmsAero && !isDummy
        ? await this.sms.startMobileAuth(normalized)
        : undefined;
    const telegramAction =
      dto.channel === 'telegram' ? this.telegramAction(challengeId) : undefined;
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
      authVersion: isDummy ? undefined : identity!.authVersion,
      isDummy,
      codeHash: await bcrypt.hash(code, 8),
      codeLength: CODE_LENGTH,
      verificationProvider: useSmsAero ? 'smsaero_mobile_id' : 'local',
      mobileIdRequestId: mobileId?.requestId,
      mobileIdAuthType: mobileId?.authType,
      verifyAttempts: 0,
      expiresAt: new Date(now + CHALLENGE_TTL_MS),
      resendAfter: new Date(now + RESEND_MIN_MS),
      telegramAction,
    });

    await this.dispatchChallengeCode({
      channel: dto.channel,
      code,
      isDummy,
      useSmsAero,
      email: dto.identifier.type === 'email' ? normalized : undefined,
      phone: dto.identifier.type === 'phone' ? normalized : undefined,
      expiresAt: challenge.expiresAt.toISOString(),
      challengeId,
    });

    await this.challenges.updateOne(
      { challengeId, status: 'dispatch_pending' },
      { $set: { status: 'awaiting_code' } },
    );

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
    if (
      this.isSmsAeroChallenge(challenge) &&
      challenge.status !== 'expired' &&
      challenge.status !== 'consumed' &&
      !challenge.isDummy &&
      challenge.mobileIdRequestId
    ) {
      this.requireSmsAero();
      const verified = await this.sms.isMobileAuthVerified(
        challenge.mobileIdRequestId,
      );
      if (verified) {
        await this.consumeChallenge(challenge);
        challenge.status = 'consumed';
      }
    }
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
    if (!challenge.isDummy) {
      const identity = challenge.subject
        ? await this.identities.findIdentityBySubject(challenge.subject)
        : null;
      this.assertChallengeIdentity(challenge, identity);
    }
    if (challenge.resendAfter.getTime() > Date.now()) {
      const retryAfter = Math.ceil(
        (challenge.resendAfter.getTime() - Date.now()) / 1000,
      );
      problem(429, 'RATE_LIMITED', { retryable: true, retryAfter });
    }
    this.rates.consume('resendByChallenge', challengeId);
    this.rates.consume('startByIp', ip);

    const now = Date.now();
    const useSmsAero = this.isSmsAeroChallenge(challenge);
    this.assertOtpMode();
    let code = this.cfg.mockOtp();
    if (useSmsAero) {
      this.requireSmsAero();
      if (!challenge.isDummy) {
        const identity = challenge.subject
          ? await this.identities.findIdentityBySubject(challenge.subject)
          : null;
        if (!identity?.phone) {
          problem(503, 'UPSTREAM_UNAVAILABLE', { retryable: true });
        }
        const mobileId = await this.sms.startMobileAuth(identity.phone);
        challenge.mobileIdRequestId = mobileId.requestId;
        challenge.mobileIdAuthType = mobileId.authType;
      }
    } else {
      code = this.issueChallengeCode({
        isDummy: Boolean(challenge.isDummy),
        useSmsAero: false,
      });
      challenge.codeHash = await bcrypt.hash(code, 8);
    }
    challenge.codeLength = CODE_LENGTH;
    challenge.status = 'dispatch_pending';
    challenge.verifyAttempts = 0;
    challenge.expiresAt = new Date(now + CHALLENGE_TTL_MS);
    challenge.resendAfter = new Date(now + RESEND_MIN_MS);
    if (challenge.channel === 'telegram') {
      challenge.telegramAction = this.telegramAction(challenge.challengeId);
    }
    await challenge.save();

    let email: string | undefined;
    let phone: string | undefined;
    if (
      challenge.subject &&
      ['email', 'telegram'].includes(challenge.channel || '')
    ) {
      const identity = await this.identities.findIdentityBySubject(
        challenge.subject,
      );
      email = identity?.email || undefined;
      phone = identity?.phone || undefined;
    }
    await this.dispatchChallengeCode({
      channel: challenge.channel || 'email',
      code,
      isDummy: Boolean(challenge.isDummy),
      useSmsAero,
      email,
      phone,
      expiresAt: challenge.expiresAt.toISOString(),
      challengeId: challenge.challengeId,
    });

    await this.challenges.updateOne(
      { challengeId, status: 'dispatch_pending' },
      { $set: { status: 'awaiting_code' } },
    );
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

    const reserved = await this.challenges.findOneAndUpdate(
      {
        challengeId,
        clientId,
        status: 'awaiting_code',
        codeHash: challenge.codeHash,
        expiresAt: { $gt: new Date() },
        verifyAttempts: { $lt: MAX_VERIFY_ATTEMPTS },
      },
      { $inc: { verifyAttempts: 1 } },
      { new: true },
    );
    if (!reserved) {
      const latest = await this.loadChallenge(challengeId, clientId);
      if (latest.verifyAttempts >= MAX_VERIFY_ATTEMPTS)
        problem(429, 'RATE_LIMITED', { retryable: false, retryAfter: 60 });
      if (latest.status === 'consumed') problem(409, 'CHALLENGE_CONSUMED');
      if (latest.expiresAt.getTime() <= Date.now())
        problem(410, 'CHALLENGE_EXPIRED');
      problem(409, 'CONFLICT');
    }

    let matches: boolean;
    if (this.isSmsAeroChallenge(challenge)) {
      this.requireSmsAero();
      if (challenge.isDummy || !challenge.mobileIdRequestId) {
        await bcrypt.compare(dto.code, challenge.codeHash);
        matches = false;
      } else {
        try {
          matches = await this.sms.verifyMobileAuth(
            challenge.mobileIdRequestId,
            dto.code,
          );
        } catch {
          problem(503, 'UPSTREAM_UNAVAILABLE', { retryable: true });
        }
      }
    } else {
      matches = await bcrypt.compare(dto.code, challenge.codeHash);
    }
    if (!matches || challenge.isDummy || !challenge.subject) {
      problem(401, 'INVALID_CREDENTIALS');
    }

    const body = await this.consumeChallenge(challenge);
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

  async validateAuthenticationReplay(body: any) {
    const identity = body?.subject
      ? await this.identities.findIdentityBySubject(body.subject)
      : null;
    if (
      !identity ||
      identity.identityStatus !== 'active' ||
      identity.authVersion !== body.authVersion
    )
      problem(401, 'INVALID_CREDENTIALS');
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

  private useSmsAero(identifierType: string, channel: string): boolean {
    return (
      this.cfg.dispatchEnabled() &&
      identifierType === 'phone' &&
      channel === 'sms'
    );
  }

  private isSmsAeroChallenge(challenge: MstyleChallengeDocument): boolean {
    return challenge.verificationProvider === 'smsaero_mobile_id';
  }

  private requireSmsAero(): void {
    if (!this.sms.isConfigured()) {
      this.logger.warn(
        'V2 SMS unavailable: check MSTYLE_SMS_ENABLED, MSTYLE_SMSAERO_EMAIL, MSTYLE_SMSAERO_API_KEY and MSTYLE_SMSAERO_SIGN',
      );
      problem(503, 'UPSTREAM_UNAVAILABLE', { retryable: true });
    }
  }

  private async consumeChallenge(verified: MstyleChallengeDocument) {
    this.challenges.db.base.set('transactionAsyncLocalStorage', true);
    return this.challenges.db.transaction(
      async () => {
        const current = await this.loadChallenge(
          verified.challengeId,
          verified.clientId,
        );
        if (current.status === 'consumed') {
          if (
            !current.consumedAuthJson ||
            !current.consumedAt ||
            Date.now() - current.consumedAt.getTime() > AUTH_SUCCESS_REPLAY_MS
          )
            problem(409, 'CHALLENGE_CONSUMED');
          const stored = JSON.parse(current.consumedAuthJson);
          const identity = await this.identities.findIdentityBySubject(
            stored.subject,
          );
          if (
            !identity ||
            identity.identityStatus !== 'active' ||
            identity.authVersion !== stored.authVersion
          )
            problem(401, 'INVALID_CREDENTIALS');
          return stored;
        }
        if (
          current.status !== 'awaiting_code' ||
          current.expiresAt.getTime() <= Date.now() ||
          current.codeHash !== verified.codeHash ||
          current.mobileIdRequestId !== verified.mobileIdRequestId
        )
          problem(409, 'CONFLICT');
        // Saving the challenge in the same transaction serializes simultaneous successful verifications.
        current.status = 'consumed';
        current.consumedAt = new Date();
        await current.save();
        const identity = current.subject
          ? await this.identities.findIdentityBySubject(current.subject)
          : null;
        if (
          !identity ||
          !this.identities.usableForAuth(identity.identityStatus)
        )
          problem(401, 'INVALID_CREDENTIALS');
        this.assertChallengeIdentity(current, identity);
        await this.identities.confirmLogin(
          identity.subject,
          current.identifierType!,
          current.identifierHash!,
        );
        const body = await this.issueAuthentication(
          identity.subject,
          identity.authVersion,
          current.channel || 'sms',
        );
        current.consumedAuthJson = JSON.stringify(body);
        await current.save();
        return body;
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
  }

  private assertChallengeIdentity(
    challenge: MstyleChallengeDocument,
    identity: Awaited<
      ReturnType<MstyleIdentityService['findIdentityBySubject']>
    >,
  ) {
    const type = challenge.identifierType;
    const value =
      type === 'email'
        ? identity?.email
        : type === 'phone'
          ? identity?.phone
          : null;
    if (
      !identity ||
      !this.identities.usableForAuth(identity.identityStatus) ||
      !value ||
      hmacHex(this.cfg.rateLimitSecret(), `${type}:${value}`) !==
        challenge.identifierHash ||
      (challenge.authVersion != null &&
        challenge.authVersion !== identity.authVersion) ||
      (identity.userId && challenge.authVersion == null)
    )
      problem(401, 'INVALID_CREDENTIALS');
  }

  private async issueAuthentication(
    subject: string,
    authVersion: number,
    method: string,
  ) {
    const authenticatedAt = nowIso();
    const body = schema({
      authenticationId: Ids.authentication(),
      subject,
      identityStatus: 'active',
      authVersion,
      authenticatedAt,
      authenticationMethod: method,
    });
    await this.authentications.create({
      authenticationId: body.authenticationId,
      subject,
      method,
      authVersion,
      authenticatedAt,
      expiresAt: new Date(Date.now() + STEP_UP_TTL_MS),
    });
    return body;
  }

  private telegramAction(challengeId: string) {
    const opaque = this.telegramStartToken(challengeId);
    const bot = this.cfg.telegramBot();
    return {
      botUsername: bot,
      deepLink: `https://t.me/${bot}?start=${opaque}`,
    };
  }

  private telegramStartToken(challengeId: string) {
    return hmacHex(this.cfg.rateLimitSecret(), `tg:${challengeId}`).slice(
      0,
      24,
    );
  }

  /** 4-digit OTP for email/telegram; mock OTP when dispatch off / dummy / SMS Aero. */
  private assertOtpMode() {
    if (!this.cfg.dispatchEnabled() && this.cfg.environment() !== 'local')
      problem(503, 'UPSTREAM_UNAVAILABLE');
  }

  private issueChallengeCode(params: {
    isDummy: boolean;
    useSmsAero: boolean;
  }) {
    if (params.isDummy || params.useSmsAero || !this.cfg.dispatchEnabled()) {
      return this.cfg.mockOtp();
    }
    return generateOtpCode(CODE_LENGTH);
  }

  private async dispatchChallengeCode(params: {
    channel: string;
    code: string;
    isDummy: boolean;
    useSmsAero: boolean;
    email?: string | null;
    phone?: string | null;
    expiresAt: string;
    challengeId: string;
  }) {
    if (!this.cfg.dispatchEnabled()) {
      this.logger.warn(
        `OTP dispatch disabled: MSTYLE_DISPATCH_ENABLED=false; challenge=${params.challengeId}; channel=${params.channel}`,
      );
      return;
    }
    if (params.isDummy) {
      this.logger.log(
        `OTP dispatch skipped: no eligible identity; challenge=${params.challengeId}; channel=${params.channel}`,
      );
      return;
    }
    if (params.useSmsAero) return;
    if (params.channel === 'email' && params.email) {
      try {
        await this.mail.sendEmailVerificationCode(params.email, params.code);
        this.logger.log(
          `Email OTP submitted to SMTP; challenge=${params.challengeId}`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`mstyle email OTP dispatch failed: ${message}`);
        problem(503, 'UPSTREAM_UNAVAILABLE', { retryable: true });
      }
      return;
    }
    if (params.channel === 'telegram') {
      if (!this.telegramGateway.isConfigured()) {
        this.logger.warn(
          'telegram channel requested but TELEGRAM_GATEWAY_URL is not set',
        );
        problem(503, 'UPSTREAM_UNAVAILABLE', { retryable: true });
      }
      if (!params.phone) {
        problem(503, 'UPSTREAM_UNAVAILABLE', { retryable: true });
      }
      const ok = await this.telegramGateway.registerPendingOtp({
        startToken: this.telegramStartToken(params.challengeId),
        code: params.code,
        phone: params.phone,
        expiresAt: params.expiresAt,
        text: `Код входа M-Style / Pass: ${params.code}`,
      });
      if (!ok) {
        problem(503, 'UPSTREAM_UNAVAILABLE', { retryable: true });
      }
    }
  }

  private normalizeIdentifier(type: 'phone' | 'email', value: string) {
    return type === 'phone'
      ? normalizeRuMobilePhone(value)
      : normalizeEmail(value);
  }
}
