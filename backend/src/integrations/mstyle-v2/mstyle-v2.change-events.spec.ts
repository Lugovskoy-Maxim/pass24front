import {
  mapChangeEventType,
  presentChangeEvent,
} from './mstyle-v2.change-events';
import { publicResponse } from './mstyle-v2.public-response';

describe('R-03 change event presentation', () => {
  const context = {
    streamName: 'mstyle-production',
    environment: 'production',
  };
  const legacyBinding = {
    sequence: 32,
    eventId: 'evt_01M0CDCXXEDTV22K3VWFZKS6MT',
    type: 'snapshot.bound',
    occurredAt: '2026-08-19T07:05:03.662Z',
    aggregate: { type: 'snapshot', id: 'rps_01M0CDCXVNY8Y86JGBAC0V0NZS' },
    payload: { operationRef: 'op_probe_mszqyai9' },
  };

  it('presents historical bindings using their persisted snapshot ID', () => {
    const before = JSON.stringify(legacyBinding);
    const item = presentChangeEvent(legacyBinding, context);
    expect(item).toMatchObject({
      sequence: 32,
      eventId: legacyBinding.eventId,
      type: 'snapshot.operation_bound',
      aggregate: { type: 'snapshot_operation_binding', revision: 1 },
      payload: { snapshotId: legacyBinding.aggregate.id },
    });
    expect(item.payload).not.toHaveProperty('operationRef');
    expect(JSON.stringify(legacyBinding)).toBe(before);
  });

  it('preserves a valid legacy operation reference', () => {
    const operationRef = 'op_6422c21292821b927416647f6ff44b1ce18ec214';
    const item = presentChangeEvent(
      { ...legacyBinding, payload: { operationRef } },
      context,
    );
    expect(item.payload).toEqual({
      operationRef,
      snapshotId: legacyBinding.aggregate.id,
    });
  });

  it('projects the original snp storage prefix in both legacy event references', async () => {
    const stored = {
      ...legacyBinding,
      aggregate: { type: 'snapshot', id: 'snp_01M0CDCXVNY8Y86JGBAC0V0NZS' },
    };
    const result = (await publicResponse(
      presentChangeEvent(stored, context),
      async () => 'resident_profile',
    )) as any;
    expect(result.aggregate.id).toBe('rps_01M0CDCXVNY8Y86JGBAC0V0NZS');
    expect(result.payload).toEqual({ snapshotId: result.aggregate.id });
    expect(stored.payload).toEqual(legacyBinding.payload);
  });

  it('does not repair malformed current events or invent missing legacy references', () => {
    expect(
      presentChangeEvent(
        { ...legacyBinding, type: 'snapshot.operation_bound' },
        context,
      ).payload,
    ).toEqual(legacyBinding.payload);
    expect(
      presentChangeEvent(
        { ...legacyBinding, aggregate: { id: 'invalid' } },
        context,
      ).payload,
    ).toEqual(legacyBinding.payload);
  });

  it('does not replace an explicit stored snapshot reference', () => {
    const payload = {
      ...legacyBinding.payload,
      snapshotId: 'gps_01M0CDCXVNY8Y86JGBAC0V0NZS',
    };
    expect(
      presentChangeEvent({ ...legacyBinding, payload }, context).payload,
    ).toEqual({ snapshotId: payload.snapshotId });
  });

  it('projects early structured operation identifiers by their explicit snapshot only', () => {
    const event = {
      ...legacyBinding,
      type: 'snapshot.operation_bound',
      payload: {
        snapshotId: legacyBinding.aggregate.id,
        operationRef: {
          sourceSystem: 'mstyle',
          environment: 'production',
          operationType: 'booking',
          operationId: 'tz-op-mtu4etx1',
        },
      },
    };
    expect(presentChangeEvent(event, context).payload).toEqual({
      snapshotId: legacyBinding.aggregate.id,
    });
    for (const operationRef of [
      { ...event.payload.operationRef, operationId: 'op_invalid' },
      { ...event.payload.operationRef, environment: 'different' },
      { ...event.payload.operationRef, unexpected: true },
    ]) {
      const payload = { ...event.payload, operationRef };
      expect(
        presentChangeEvent({ ...event, payload }, context).payload,
      ).toEqual(payload);
    }
    const payload = {
      ...event.payload,
      snapshotId: 'gps_01M0CDCXVNY8Y86JGBAC0V0NZS',
    };
    expect(presentChangeEvent({ ...event, payload }, context).payload).toEqual(
      payload,
    );
  });

  it('maps legacy types and fills aggregate.revision', () => {
    const item = presentChangeEvent(
      {
        sequence: 1,
        eventId: 'evt_1',
        type: 'resident.onboarded',
        occurredAt: '2026-08-19T06:09:36.915Z',
        aggregate: { type: 'profile', id: 'prf_1' },
        profileId: 'prf_1',
        subject: 'usr_1',
      },
      { streamName: 'mstyle-production', environment: 'production' },
    );
    expect(item).toMatchObject({
      type: 'profile.updated',
      aggregate: { type: 'resident_profile', id: 'prf_1', revision: 1 },
    });
  });

  it('keeps new events and their revisions', () => {
    const item = presentChangeEvent(
      {
        sequence: 280,
        eventId: 'evt_2',
        type: 'guest_party.updated',
        occurredAt: '2026-09-09T12:55:51.952Z',
        aggregate: { type: 'guest_party', id: 'gst_1', revision: 2 },
        guestPartyId: 'gst_1',
        payload: { status: 'draft' },
      },
      { streamName: 'mstyle-production', environment: 'production' },
    );
    expect(item.aggregate).toEqual({
      type: 'guest_party',
      id: 'gst_1',
      revision: 2,
    });
    expect(item.payload).toEqual({ status: 'draft' });
  });

  it('adds guest status for legacy guest.created', () => {
    const item = presentChangeEvent(
      {
        sequence: 3,
        eventId: 'evt_3',
        type: 'guest.created',
        occurredAt: '2026-08-19T06:09:36.915Z',
        aggregate: { type: 'guest_party', id: 'gst_2' },
        guestPartyId: 'gst_2',
      },
      { streamName: 'mstyle-production', environment: 'production' },
    );
    expect(item.type).toBe('guest_party.updated');
    expect(item.payload).toEqual({ status: 'draft' });
  });

  it('maps consent events by party', () => {
    expect(mapChangeEventType('consent.accepted')).toBe(
      'resident_consent.updated',
    );
    expect(mapChangeEventType('consent.accepted', 'gst_1')).toBe(
      'guest_consent.updated',
    );
  });
});
