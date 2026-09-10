import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AUTH_SUCCESS_REPLAY_MS,
  IDEMPOTENCY_TTL_MS,
} from './mstyle-v2.constants';
import { MstyleV2Config } from './mstyle-v2.config';
import { idempotencyFingerprint, safeEqualHex } from './mstyle-v2.crypto';
import { MstyleResult, ProblemException, problem } from './mstyle-v2.problem';
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
    actorRef?: string;
    method: string;
    route: string;
    body: unknown;
  }): string {
    return idempotencyFingerprint(this.cfg.idempotencySecret(), input);
  }

  async replayOrThrow(input: {
    clientId: string;
    actorRef?: string;
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
    if (
      (existing.actorRef && existing.actorRef !== input.actorRef) ||
      !safeEqualHex(existing.requestHmac, requestHmac)
    ) {
      problem(409, 'IDEMPOTENCY_KEY_REUSED');
    }
    if (
      existing.replayExpiresAt &&
      existing.replayExpiresAt.getTime() <= Date.now()
    ) {
      problem(409, input.replayExpiredCode || 'IDEMPOTENCY_REPLAY_EXPIRED');
    }
    if (existing.statusCode === 0)
      problem(503, 'UPSTREAM_UNAVAILABLE', {
        retryable: true,
        retryAfter: 1,
        title: 'Dispatch outcome is pending',
      });
    if (existing.dispatchFailure) {
      const failure = existing.dispatchFailure;
      throw new ProblemException(failure.status, failure.code as any, {
        retryable: false,
        errors: failure.errors || [],
      });
    }
    return new MstyleResult(
      existing.responseBody,
      existing.statusCode,
      existing.responseHeaders || { 'Cache-Control': 'no-store' },
    );
  }

  /** Reserve before calling a provider. An interrupted send is never repeated automatically. */
  async executeDispatch(
    input: Parameters<MstyleIdempotencyService['replayOrThrow']>[0],
    run: () => Promise<MstyleResult>,
  ) {
    const replay = await this.replayOrThrow(input);
    if (replay) return replay;
    const recordKey = `${input.clientId}:${input.method}:${input.route}:${input.idempotencyKey}`;
    try {
      await this.rows.create({
        recordKey,
        clientId: input.clientId,
        actorRef: input.actorRef,
        idempotencyKey: input.idempotencyKey,
        method: input.method,
        route: input.route,
        requestHmac: this.fingerprint(input),
        statusCode: 0,
        responseBody: {},
        expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const concurrent = await this.replayOrThrow(input);
        if (concurrent) return concurrent;
      }
      problem(503, 'UPSTREAM_UNAVAILABLE', { retryable: true, retryAfter: 1 });
    }
    try {
      const result = await run();
      await this.rows.updateOne(
        { recordKey, statusCode: 0 },
        {
          $set: {
            statusCode: result.status,
            responseBody: JSON.parse(JSON.stringify(result.body)),
            responseHeaders: result.headers,
          },
        },
      );
      return result;
    } catch (error) {
      const failure =
        error instanceof ProblemException
          ? error
          : new ProblemException(503, 'UPSTREAM_UNAVAILABLE');
      await this.rows.updateOne(
        { recordKey },
        {
          $set: {
            statusCode: failure.getStatus(),
            dispatchFailure: {
              status: failure.getStatus(),
              code: failure.problemCode,
              errors: failure.errors,
            },
          },
        },
      );
      throw failure;
    }
  }

  async save(input: {
    clientId: string;
    actorRef?: string;
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
          actorRef: input.actorRef,
          idempotencyKey: input.idempotencyKey,
          method: input.method,
          route: input.route,
          requestHmac,
          statusCode: input.result.status,
          responseBody: JSON.parse(JSON.stringify(input.result.body)) as Record<
            string,
            unknown
          >,
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
  async execute(
    input: {
      clientId: string;
      actorRef?: string;
      idempotencyKey: string;
      method: string;
      route: string;
      body: unknown;
      replayExpiredCode?: 'IDEMPOTENCY_REPLAY_EXPIRED' | 'CHALLENGE_CONSUMED';
      replayWindow?: boolean;
    },
    run: () => Promise<MstyleResult>,
    prepare?: () => Promise<void>,
  ): Promise<MstyleResult> {
    const replay = await this.replayOrThrow(input);
    if (replay) return replay;
    if (prepare) await prepare();
    const recordKey = [
      input.clientId,
      input.method,
      input.route,
      input.idempotencyKey,
    ].join(':');
    this.rows.db.base.set('transactionAsyncLocalStorage', true);
    try {
      return await this.rows.db.transaction(
        async () => {
          const cached = await this.replayOrThrow(input);
          if (cached) return cached;
          await this.rows.create({
            recordKey,
            clientId: input.clientId,
            actorRef: input.actorRef,
            idempotencyKey: input.idempotencyKey,
            method: input.method,
            route: input.route,
            requestHmac: this.fingerprint(input),
            statusCode: 0,
            responseBody: {},
            expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
          });
          const result = await run();
          await this.rows.updateOne(
            { recordKey },
            {
              $set: {
                statusCode: result.status,
                responseBody: JSON.parse(JSON.stringify(result.body)),
                responseHeaders: result.headers,
                replayExpiresAt: input.replayWindow
                  ? new Date(Date.now() + AUTH_SUCCESS_REPLAY_MS)
                  : null,
              },
            },
          );
          return result;
        },
        { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
      );
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const cached = await this.replayOrThrow(input);
        if (cached) return cached;
        problem(409, 'CONFLICT');
      }
      if (error instanceof ProblemException) throw error;
      if ((error as Error).name?.startsWith('Mongo'))
        problem(503, 'UPSTREAM_UNAVAILABLE', { retryable: true });
      throw error;
    }
  }
}
