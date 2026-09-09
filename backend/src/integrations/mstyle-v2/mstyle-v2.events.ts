import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Ids } from './mstyle-v2.ids';
import { nowIso, schema } from './mstyle-v2.present';
import {
  MstyleChangeEvent,
  MstyleChangeEventDocument,
  MstyleSequenceCounter,
  MstyleSequenceCounterDocument,
} from './mstyle-v2.schemas';
import { MstyleV2Config } from './mstyle-v2.config';
import { hmacHex, safeEqualHex } from './mstyle-v2.crypto';
import { problem } from './mstyle-v2.problem';

@Injectable()
export class MstyleEventsService {
  constructor(
    @InjectModel(MstyleChangeEvent.name)
    private readonly events: Model<MstyleChangeEventDocument>,
    @InjectModel(MstyleSequenceCounter.name)
    private readonly counters: Model<MstyleSequenceCounterDocument>,
    private readonly cfg: MstyleV2Config,
  ) {}

  async emit(input: {
    type: string;
    aggregate: { type: string; id: string; revision?: number };
    subject?: string;
    profileId?: string;
    guestPartyId?: string;
    payload?: Record<string, unknown>;
  }): Promise<string> {
    const last = await this.events.findOne().sort({ sequence: -1 }).lean();
    await this.counters.updateOne(
      { name: 'changes' },
      { $max: { value: last?.sequence || 0 } },
      { upsert: true },
    );
    const counter = await this.counters.findOneAndUpdate(
      { name: 'changes' },
      { $inc: { value: 1 } },
      { new: true },
    );
    if (!counter) problem(503, 'UPSTREAM_UNAVAILABLE');
    const sequence = counter.value;
    const eventId = Ids.event();
    await this.events.create({
      eventId,
      sequence,
      type: input.type,
      occurredAt: nowIso(),
      aggregate: {
        ...input.aggregate,
        revision: input.aggregate.revision || 1,
      },
      subject: input.subject,
      profileId: input.profileId,
      guestPartyId: input.guestPartyId,
      payload: input.payload || {},
    });
    return eventId;
  }

  async list(after?: string, limit = 50) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      problem(422, 'VALIDATION_FAILED', {
        errors: [
          {
            field: 'limit',
            code: 'out_of_range',
            message: 'limit must be an integer from 1 to 100',
          },
        ],
      });
    }
    const streamName = `mstyle-${this.cfg.environment()}`;
    const latest = await this.events.findOne().sort({ sequence: -1 }).lean();
    const latestSequence = latest?.sequence || 0;
    const decoded = after ? this.decodeCursor(after, streamName) : null;
    const minSeq = decoded?.after || 0;
    const asOfSequence =
      decoded && !decoded.complete ? decoded.asOf : latestSequence;

    if (decoded) {
      const earliest = await this.events.findOne().sort({ sequence: 1 }).lean();
      if (earliest && earliest.sequence > minSeq + 1) {
        problem(410, 'CURSOR_EXPIRED');
      }
    }
    const rows = await this.events
      .find({
        sequence: {
          $gt: minSeq,
          $lte: asOfSequence,
        },
      })
      .sort({ sequence: 1 })
      .limit(limit + 1)
      .lean();
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const items = page.map((row) =>
      schema({
        streamName,
        environment: this.cfg.environment(),
        sequence: row.sequence,
        eventId: row.eventId,
        type: row.type,
        occurredAt: row.occurredAt,
        aggregate: row.aggregate,
        subject: row.subject,
        profileId: row.profileId,
        guestPartyId: row.guestPartyId,
        payload: row.payload,
      }),
    );
    const nextAfter = page[page.length - 1]?.sequence || minSeq;
    const nextCursor = this.encodeCursor({
      streamName,
      environment: this.cfg.environment(),
      after: hasMore ? nextAfter : asOfSequence,
      asOf: asOfSequence,
      complete: !hasMore,
      nonce: Ids.request(),
    });
    return schema({
      streamName,
      items,
      nextCursor,
      hasMore,
      asOfSequence,
      generatedAt: nowIso(),
    });
  }

  private encodeCursor(cursor: ChangeCursor): string {
    const payload = Buffer.from(JSON.stringify({ v: 1, ...cursor })).toString(
      'base64url',
    );
    const signature = hmacHex(
      this.cfg.idempotencySecret(),
      `mstyle-change-cursor:${payload}`,
    );
    return `${payload}.${signature}`;
  }

  private decodeCursor(raw: string, streamName: string): ChangeCursor {
    const [payload, signature, extra] = raw.split('.');
    if (!payload || !signature || extra) problem(422, 'INVALID_CURSOR');
    const expected = hmacHex(
      this.cfg.idempotencySecret(),
      `mstyle-change-cursor:${payload}`,
    );
    if (!safeEqualHex(signature, expected)) problem(422, 'INVALID_CURSOR');
    try {
      const value = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as ChangeCursor & { v?: number };
      if (
        value.v !== 1 ||
        value.streamName !== streamName ||
        value.environment !== this.cfg.environment() ||
        !Number.isInteger(value.after) ||
        value.after < 0 ||
        !Number.isInteger(value.asOf) ||
        value.asOf < value.after ||
        typeof value.complete !== 'boolean' ||
        typeof value.nonce !== 'string' ||
        !value.nonce
      ) {
        problem(422, 'INVALID_CURSOR');
      }
      return value;
    } catch {
      problem(422, 'INVALID_CURSOR');
    }
  }
}

type ChangeCursor = {
  streamName: string;
  environment: string;
  after: number;
  asOf: number;
  complete: boolean;
  nonce: string;
};
