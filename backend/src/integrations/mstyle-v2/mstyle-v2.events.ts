import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Ids } from './mstyle-v2.ids';
import { nowIso, schema } from './mstyle-v2.present';
import {
  MstyleChangeEvent,
  MstyleChangeEventDocument,
} from './mstyle-v2.schemas';
import { MstyleV2Config } from './mstyle-v2.config';

@Injectable()
export class MstyleEventsService {
  constructor(
    @InjectModel(MstyleChangeEvent.name)
    private readonly events: Model<MstyleChangeEventDocument>,
    private readonly cfg: MstyleV2Config,
  ) {}

  async emit(input: {
    type: string;
    aggregate: { type: string; id: string };
    subject?: string;
    profileId?: string;
    guestPartyId?: string;
    payload?: Record<string, unknown>;
  }): Promise<string> {
    const last = await this.events.findOne().sort({ sequence: -1 }).lean();
    const sequence = (last?.sequence || 0) + 1;
    const eventId = Ids.event();
    await this.events.create({
      eventId,
      sequence,
      type: input.type,
      occurredAt: nowIso(),
      aggregate: input.aggregate,
      subject: input.subject,
      profileId: input.profileId,
      guestPartyId: input.guestPartyId,
      payload: input.payload || {},
    });
    return eventId;
  }

  async list(after?: string, limit = 50) {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    let minSeq = 0;
    if (after) {
      const cursor = await this.events.findOne({ eventId: after }).lean();
      if (cursor) minSeq = cursor.sequence;
    }
    const rows = await this.events
      .find(minSeq ? { sequence: { $gt: minSeq } } : {})
      .sort({ sequence: 1 })
      .limit(safeLimit + 1)
      .lean();
    const hasMore = rows.length > safeLimit;
    const items = (hasMore ? rows.slice(0, safeLimit) : rows).map((row) =>
      schema({
        streamName: 'mstyle.changes',
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
    const last = items[items.length - 1];
    const latest = await this.events.findOne().sort({ sequence: -1 }).lean();
    return schema({
      streamName: 'mstyle.changes',
      items,
      nextCursor: last?.eventId || after || null,
      hasMore,
      asOfSequence: latest?.sequence || 0,
      generatedAt: nowIso(),
    });
  }
}
