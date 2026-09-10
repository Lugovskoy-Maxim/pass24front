import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { MailService } from '../../mail/mail.service';
import { SmsService } from '../../sms/sms.service';
import { generateOtpCode } from '../../common/otp-code';
import { MSTYLE_SMS_SERVICE } from './mstyle-v2.sms';
import { MstyleV2Config } from './mstyle-v2.config';
import { MstyleChallenge, MstyleChallengeDocument } from './mstyle-v2.schemas';
import {
  CHALLENGE_TTL_MS,
  CODE_LENGTH,
  MAX_VERIFY_ATTEMPTS,
  RESEND_MIN_MS,
} from './mstyle-v2.constants';
import { encryptJson, hmacHex, maskContact } from './mstyle-v2.crypto';
import { Ids } from './mstyle-v2.ids';
import { problem } from './mstyle-v2.problem';
import { MstyleRateLimitService } from './mstyle-v2.rate-limit';

type Binding =
  | { kind: 'contact'; subject: string }
  | { kind: 'guest_contact'; guestPartyId: string };

@Injectable()
export class MstyleContactProofService {
  constructor(
    private readonly cfg: MstyleV2Config,
    @InjectModel(MstyleChallenge.name)
    private readonly challenges: Model<MstyleChallengeDocument>,
    @Inject(MSTYLE_SMS_SERVICE) private readonly sms: SmsService,
    private readonly mail: MailService,
    private readonly rates: MstyleRateLimitService,
  ) {}

  async start(
    binding: Binding,
    type: 'phone' | 'email',
    value: string,
    baseRevision: number,
  ) {
    const real = this.cfg.dispatchEnabled();
    if (!real && this.cfg.environment() !== 'local')
      problem(503, 'UPSTREAM_UNAVAILABLE');
    const identifierHash = hmacHex(
      this.cfg.rateLimitSecret(),
      `${type}:${value}`,
    );
    this.rates.consume('startByIdentifier', identifierHash);
    this.rates.consume('startByIdentifier', JSON.stringify(binding));
    const useSms = real && type === 'phone';
    if (useSms && !this.sms.isConfigured())
      problem(503, 'UPSTREAM_UNAVAILABLE');
    const code = real ? generateOtpCode(CODE_LENGTH) : this.cfg.mockOtp();
    const now = Date.now();
    const challenge = await this.challenges.create({
      ...binding,
      challengeId: Ids.challenge(),
      clientId: 'contact-proof',
      isDummy: false,
      status: 'dispatch_pending',
      channel: type === 'phone' ? 'sms' : 'email',
      identifierType: type,
      identifierHash,
      codeHash: await bcrypt.hash(code, 8),
      codeLength: CODE_LENGTH,
      verificationProvider: useSms ? 'smsaero_mobile_id' : 'local',
      contactProofVersion: 1,
      contactType: type,
      displayMasked: maskContact(type, value),
      baseContactValueRevision: baseRevision,
      expectedContactValueRevision: Math.max(1, baseRevision),
      pendingValueEnc: encryptJson(this.cfg.piiSecret(), value),
      verifyAttempts: 0,
      expiresAt: new Date(now + CHALLENGE_TTL_MS),
      resendAfter: new Date(now + RESEND_MIN_MS),
    });
    try {
      if (useSms) {
        const delivery = await this.sms.startMobileAuth(value);
        challenge.mobileIdRequestId = delivery.requestId;
        challenge.mobileIdAuthType = delivery.authType;
      } else if (real) await this.mail.sendEmailVerificationCode(value, code);
      challenge.status = 'awaiting_code';
      await challenge.save();
    } catch {
      await this.challenges.updateOne(
        { challengeId: challenge.challengeId },
        { $set: { status: 'expired' } },
      );
      problem(503, 'UPSTREAM_UNAVAILABLE', { retryable: true });
    }
    return challenge;
  }

  // Runs before the business transaction: failed attempts and provider calls must survive rollback.
  async verify(binding: Binding, challengeId: string, code: string) {
    if (!/^[0-9]{4}$/.test(code)) problem(422, 'VALIDATION_FAILED');
    const challenge = await this.challenges.findOneAndUpdate(
      {
        ...binding,
        challengeId,
        status: 'awaiting_code',
        expiresAt: { $gt: new Date() },
        contactProofVersion: 1,
        verifyAttempts: { $lt: MAX_VERIFY_ATTEMPTS },
      },
      { $inc: { verifyAttempts: 1 } },
      { new: true },
    );
    if (!challenge) return this.rejectUnavailable(binding, challengeId);
    let matches = false;
    if (challenge.verificationProvider === 'smsaero_mobile_id') {
      if (!challenge.mobileIdRequestId || !this.sms.isConfigured())
        problem(503, 'UPSTREAM_UNAVAILABLE');
      try {
        matches = await this.sms.verifyMobileAuth(
          challenge.mobileIdRequestId,
          code,
        );
      } catch {
        problem(503, 'UPSTREAM_UNAVAILABLE', { retryable: true });
      }
    } else matches = await bcrypt.compare(code, challenge.codeHash);
    if (!matches) problem(401, 'INVALID_CREDENTIALS');
    await this.challenges.updateOne(
      { challengeId, status: 'awaiting_code' },
      { $set: { verificationApprovedAt: new Date() } },
    );
  }

  // Called inside the same transaction as the contact, versions, event and replay record.
  async consume(binding: Binding, challengeId: string) {
    const challenge = await this.challenges.findOneAndUpdate(
      {
        ...binding,
        challengeId,
        status: 'awaiting_code',
        expiresAt: { $gt: new Date() },
        verificationApprovedAt: { $type: 'date' },
        contactProofVersion: 1,
      },
      { $set: { status: 'consumed', consumedAt: new Date() } },
      { new: true },
    );
    if (!challenge) return this.rejectUnavailable(binding, challengeId);
    return challenge;
  }

  private async rejectUnavailable(
    binding: Binding,
    challengeId: string,
  ): Promise<never> {
    const row = await this.challenges.findOne({ ...binding, challengeId });
    if (!row) problem(404, 'NOT_FOUND');
    if (row.status === 'consumed') problem(409, 'CHALLENGE_CONSUMED');
    if (
      row.expiresAt.getTime() <= Date.now() ||
      row.status === 'expired' ||
      row.contactProofVersion !== 1
    )
      problem(410, 'CHALLENGE_EXPIRED');
    if (row.verifyAttempts >= MAX_VERIFY_ATTEMPTS)
      problem(429, 'RATE_LIMITED', { retryable: false, retryAfter: 60 });
    problem(409, 'CONFLICT');
  }
}
