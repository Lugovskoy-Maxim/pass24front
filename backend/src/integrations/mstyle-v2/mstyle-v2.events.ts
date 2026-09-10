import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { presentChangeEvent } from './mstyle-v2.change-events';
import { Ids } from './mstyle-v2.ids';
import { nowIso, schema } from './mstyle-v2.present';
import {
  MstyleChangeEvent,
  MstyleChangeEventDocument,
  MstyleSequenceCounter,
  MstyleSequenceCounterDocument,
  MstyleIdentity,
} from './mstyle-v2.schemas';
import { MstyleV2Config } from './mstyle-v2.config';
import { hmacHex, safeEqualHex } from './mstyle-v2.crypto';
import { problem } from './mstyle-v2.problem';

// These records contain Contact revisions. They are retained in storage and
// replaced in the public stream by fresh Identity notifications with true revisions.
const LEGACY_IDENTITY_CONTACT = {
  $or: [
    { type: 'identity_contact.updated' },
    {
      type: { $in: ['contact.challenge_started', 'contact.verified'] },
      guestPartyId: { $in: [null, ''] },
    },
  ],
};

@Injectable()
export class MstyleEventsService {
  constructor(
    @InjectModel(MstyleChangeEvent.name)
    private readonly events: Model<MstyleChangeEventDocument>,
    @InjectModel(MstyleSequenceCounter.name)
    private readonly counters: Model<MstyleSequenceCounterDocument>,
    private readonly cfg: MstyleV2Config,
    @InjectModel(MstyleIdentity.name)
    private readonly identities: Model<MstyleIdentity>,
  ) {}

  async emit(input: {
    type: string;
    repairsEventId?: string;
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
      repairsEventId: input.repairsEventId,
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
    // A bounded batch lets an existing installation recover on normal polling.
    // Corrections are appended, so consumers already past a legacy row also see them.
    const decoded = after ? this.decodeCursor(after, streamName) : null;
    await this.repairLegacyIdentityContacts();
    const latest = await this.events.findOne().sort({ sequence: -1 }).lean();
    const latestSequence = latest?.sequence || 0;
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
        $nor: [LEGACY_IDENTITY_CONTACT],
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
      schema(
        presentChangeEvent(row, {
          streamName,
          environment: this.cfg.environment(),
        }),
      ),
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

  private async repairLegacyIdentityContacts() {
    const pending = await this.events.aggregate([
      { $match: LEGACY_IDENTITY_CONTACT },
      { $sort: { sequence: 1 } },
      {
        $lookup: {
          from: this.events.collection.name,
          localField: 'eventId',
          foreignField: 'repairsEventId',
          as: 'corrections',
        },
      },
      { $match: { 'corrections.0': { $exists: false } } },
      { $limit: 100 },
      { $project: { eventId: 1, subject: 1 } },
    ]);
    for (const source of pending) {
      if (
        typeof source.subject !== 'string' ||
        !/^usr_[A-Za-z0-9_-]{16,}$/.test(source.subject)
      )
        problem(503, 'UPSTREAM_UNAVAILABLE', {
          title: 'Legacy event subject is missing or invalid',
        });
      this.events.db.base.set('transactionAsyncLocalStorage', true);
      try {
        await this.events.db.transaction(
          async () => {
            if (await this.events.exists({ repairsEventId: source.eventId }))
              return;
            const identity = await this.identities
              .findOne({ subject: source.subject })
              .lean();
            if (
              !identity ||
              !Number.isInteger(identity.revision) ||
              identity.revision < 1
            )
              problem(503, 'UPSTREAM_UNAVAILABLE', {
                title: 'Legacy event identity cannot be resolved',
              });
            await this.emit({
              type: 'identity.updated',
              repairsEventId: source.eventId,
              aggregate: {
                type: 'identity',
                id: identity.subject,
                revision: identity.revision,
              },
              subject: identity.subject,
            });
          },
          {
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' },
          },
        );
      } catch (error) {
        if (
          (error as { code?: number }).code === 11000 &&
          (await this.events.exists({ repairsEventId: source.eventId }))
        )
          continue;
        throw error;
      }
    }
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
