import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MstyleSnapshot } from './mstyle-v2.schemas';
import {
  publicAssignmentId,
  publicContactId,
  publicConsentId,
  publicSnapshotId,
  SnapshotPartyType,
} from './mstyle-v2.ids';
import { problem } from './mstyle-v2.problem';

type RecordValue = Record<string, any>;

/** Projects current and persisted replay responses without changing stored records. */
export async function publicResponse(
  value: unknown,
  resolveSnapshot: (id: string) => Promise<SnapshotPartyType | undefined>,
  inheritedParty?: SnapshotPartyType,
): Promise<unknown> {
  if (Array.isArray(value))
    return Promise.all(
      value.map((item) =>
        publicResponse(item, resolveSnapshot, inheritedParty),
      ),
    );
  if (!value || typeof value !== 'object' || value instanceof Date)
    return value;
  const row = value as RecordValue;
  const party: SnapshotPartyType | undefined =
    row.partyType === 'guest_party' ||
    row.guestPartyId ||
    row.aggregate?.type === 'guest_snapshot'
      ? 'guest_party'
      : row.partyType === 'resident_profile' ||
          row.profileId ||
          row.aggregate?.type === 'resident_snapshot'
        ? 'resident_profile'
        : inheritedParty;
  const result: RecordValue = {};
  for (const [key, item] of Object.entries(row)) {
    // These objects contain user values or signed content, not API references.
    if (
      [
        'values',
        'privateData',
        'operationRef',
        'contentDigest',
        'sourceLinks',
      ].includes(key)
    ) {
      result[key] = item;
    } else if (
      key === 'snapshotId' &&
      typeof item === 'string' &&
      item.startsWith('snp_')
    ) {
      const resolvedParty = party || (await resolveSnapshot(item));
      if (!resolvedParty)
        problem(503, 'UPSTREAM_UNAVAILABLE', {
          title: 'Snapshot reference cannot be resolved',
        });
      result[key] = publicSnapshotId(item, resolvedParty);
    } else if (key === 'assignmentId' && typeof item === 'string') {
      result[key] = publicAssignmentId(item);
    } else if (key === 'status' && row.assignmentId && item === 'inactive') {
      result[key] = 'revoked';
    } else if (key === 'contactId' && typeof item === 'string') {
      result[key] = publicContactId(item);
    } else if (key === 'aggregate' && item && typeof item === 'object') {
      const aggregate = { ...(item as RecordValue) };
      if (typeof aggregate.id === 'string' && aggregate.id.startsWith('snp_')) {
        const resolvedParty = party || (await resolveSnapshot(aggregate.id));
        if (!resolvedParty) problem(503, 'UPSTREAM_UNAVAILABLE');
        aggregate.id = publicSnapshotId(aggregate.id, resolvedParty);
      }
      if (
        aggregate.type === 'guest_contact' &&
        typeof aggregate.id === 'string'
      )
        aggregate.id = publicContactId(aggregate.id);
      if (
        ['guest_consent', 'resident_consent'].includes(aggregate.type) &&
        typeof aggregate.id === 'string'
      )
        aggregate.id = publicConsentId(aggregate.id);
      result[key] = aggregate;
    } else {
      result[key] = await publicResponse(item, resolveSnapshot, party);
    }
  }
  return result;
}

@Injectable()
export class MstylePublicResponseService {
  constructor(
    @InjectModel(MstyleSnapshot.name)
    private readonly snapshots: Model<MstyleSnapshot>,
  ) {}

  async present(body: unknown, route: string): Promise<unknown> {
    const cache = new Map<string, Promise<SnapshotPartyType | undefined>>();
    return publicResponse(
      body,
      (id) => {
        if (!cache.has(id))
          cache.set(
            id,
            this.snapshots
              .findOne({ snapshotId: id })
              .select('partyType')
              .lean()
              .then((snapshot) => snapshot?.partyType),
          );
        return cache.get(id)!;
      },
      route.includes('/guest-parties') ? 'guest_party' : undefined,
    );
  }
}
