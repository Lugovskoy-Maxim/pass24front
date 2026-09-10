import {
  mapChangeEventType,
  presentChangeEvent,
} from './mstyle-v2.change-events';

describe('R-03 change event presentation', () => {
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
