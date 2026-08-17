import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AUTH_SUCCESS_REPLAY_MS,
  IDEMPOTENCY_TTL_MS,
} from './mstyle-v2.constants';
import { MstyleV2Config } from './mstyle-v2.config';
import { idempotencyFingerprint, safeEqualHex } from './mstyle-v2.crypto';
import { MstyleResult, problem } from './mstyle-v2.problem';
import {
  MstyleIdempotency,
  MstyleIdempotencyDocument,
} from './mstyle-v2.schemas';

@Injectable()
export class MstyleIdempotencyService {
  constructor(
    @InjectModel(MstyleIdempotency.name)
    private readonly rows: Model<MstyleIdempotencyDocument>,
    private readonly cfg: MstyleV2Config,
  ) {}

  fingerprint(input: {
    clientId: string;
    method: string;
    route: string;
    body: unknown;
  }): string {
    return idempotencyFingerprint(this.cfg.idempotencySecret(), input);
  }

  async replayOrThrow(input: {
    clientId: string;
    idempotencyKey: string;
    method: string;
    route: string;
    body: unknown;
    replayExpiredCode?: 'IDEMPOTENCY_REPLAY_EXPIRED' | 'CHALLENGE_CONSUMED';
  }): Promise<MstyleResult | null> {
    const requestHmac = this.fingerprint(input);
    const recordKey = `${input.clientId}:${input.method}:${input.route}:${input.idempotencyKey}`;
    const existing = await this.rows.findOne({ recordKey });
    if (!existing) return null;
    if (!safeEqualHex(existing.requestHmac, requestHmac)) {
      problem(409, 'IDEMPOTENCY_KEY_REUSED');
    }
    if (
      existing.replayExpiresAt &&
      existing.replayExpiresAt.getTime() <= Date.now()
    ) {
      problem(409, input.replayExpiredCode || 'IDEMPOTENCY_REPLAY_EXPIRED');
    }
    return new MstyleResult(
      existing.responseBody,
      existing.statusCode,
      existing.responseHeaders || { 'Cache-Control': 'no-store' },
    );
  }

  async save(input: {
    clientId: string;
    idempotencyKey: string;
    method: string;
    route: string;
    body: unknown;
    result: MstyleResult;
    replayWindow?: boolean;
  }): Promise<void> {
    const requestHmac = this.fingerprint(input);
    const recordKey = `${input.clientId}:${input.method}:${input.route}:${input.idempotencyKey}`;
    const now = Date.now();
    await this.rows.updateOne(
      { recordKey },
      {
        $setOnInsert: {
          recordKey,
          clientId: input.clientId,
          idempotencyKey: input.idempotencyKey,
          method: input.method,
          route: input.route,
          requestHmac,
          statusCode: input.result.status,
          responseBody: input.result.body as Record<string, unknown>,
          responseHeaders: input.result.headers,
          replayExpiresAt: input.replayWindow
            ? new Date(now + AUTH_SUCCESS_REPLAY_MS)
            : undefined,
          expiresAt: new Date(now + IDEMPOTENCY_TTL_MS),
        },
      },
      { upsert: true },
    );
  }
}
