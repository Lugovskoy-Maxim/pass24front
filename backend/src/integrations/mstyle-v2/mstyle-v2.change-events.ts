const TZ_AGGREGATE_TYPE: Record<string, string> = {
  'identity.updated': 'identity',
  'identity.auth_version_changed': 'identity',
  'profile.updated': 'resident_profile',
  'resident_membership.updated': 'resident_membership',
  'resident_contact_assignments.updated': 'resident_contact_assignment_set',
  'resident_private_data.updated': 'resident_private_data',
  'resident_change_request.updated': 'resident_change_request',
  'resident_deletion_request.updated': 'resident_deletion_request',
  'resident_consent.updated': 'resident_consent',
  'resident_snapshot.created': 'resident_snapshot',
  'guest_party.updated': 'guest_party',
  'guest_contact.updated': 'guest_contact',
  'guest_private_data.updated': 'guest_private_data',
  'guest_consent.updated': 'guest_consent',
  'guest_snapshot.created': 'guest_snapshot',
  'snapshot.operation_bound': 'snapshot_operation_binding',
  'physical_access.updated': 'physical_access_subject',
};

const LEGACY_EVENT_TYPE: Record<string, string> = {
  'resident.onboarded': 'profile.updated',
  'private_data.updated': 'resident_private_data.updated',
  'profile.suspend': 'profile.updated',
  'profile.activate': 'profile.updated',
  'guest.created': 'guest_party.updated',
  'guest.private_data.updated': 'guest_private_data.updated',
  'profile.deletion_requested': 'resident_deletion_request.updated',
  'membership.invited': 'resident_membership.updated',
  'membership.updated': 'resident_membership.updated',
  'membership.owner_transferred': 'resident_membership.updated',
  'membership.revoked': 'resident_membership.updated',
  'contact_assignments.replaced': 'resident_contact_assignments.updated',
  'private_data.snapshot_created': 'resident_snapshot.created',
  'snapshot.bound': 'snapshot.operation_bound',
  'profile.change_requested': 'resident_change_request.updated',
  'profile.change_cancelled': 'resident_change_request.updated',
  'profile.change_approved': 'resident_change_request.updated',
  'guest.contact_challenge': 'guest_contact.updated',
  'guest.contact_verified': 'guest_contact.updated',
  'guest.snapshot_created': 'guest_snapshot.created',
  'guest.booked': 'guest_party.updated',
  'guest.claimed': 'guest_party.updated',
};

const LEGACY_GUEST_STATUS: Record<string, string> = {
  'guest.created': 'draft',
  'guest.booked': 'booked',
  'guest.claimed': 'claimed',
};

export type StoredChangeEvent = {
  sequence: number;
  eventId: string;
  type: string;
  occurredAt: string;
  aggregate?: { type?: string; id?: string; revision?: number };
  subject?: string;
  profileId?: string;
  guestPartyId?: string;
  payload?: Record<string, unknown>;
};

export function mapChangeEventType(
  type: string,
  guestPartyId?: string,
): string {
  if (type === 'consent.accepted' || type === 'consent.withdrawn') {
    return guestPartyId ? 'guest_consent.updated' : 'resident_consent.updated';
  }
  if (type === 'contact.challenge_started' || type === 'contact.verified') {
    return guestPartyId ? 'guest_contact.updated' : 'identity.updated';
  }
  return LEGACY_EVENT_TYPE[type] || type;
}

export function presentChangeEvent(
  row: StoredChangeEvent,
  ctx: { streamName: string; environment: string },
): Record<string, unknown> {
  const type = mapChangeEventType(row.type, row.guestPartyId);
  const aggregateType =
    TZ_AGGREGATE_TYPE[type] ||
    (row.aggregate?.type === 'profile'
      ? 'resident_profile'
      : row.aggregate?.type || type);
  const revision = row.aggregate?.revision;
  const payload =
    row.payload && typeof row.payload === 'object' ? { ...row.payload } : {};
  if (type === 'guest_party.updated' && payload.status == null) {
    const status = LEGACY_GUEST_STATUS[row.type];
    if (status) payload.status = status;
  }
  return {
    streamName: ctx.streamName,
    environment: ctx.environment,
    sequence: row.sequence,
    eventId: row.eventId,
    type,
    occurredAt: row.occurredAt,
    aggregate: {
      type: aggregateType,
      id:
        row.aggregate?.id ||
        row.profileId ||
        row.guestPartyId ||
        row.subject ||
        '',
      revision: Number.isInteger(revision) && (revision as number) >= 1 ? revision : 1,
    },
    subject: row.subject,
    profileId: row.profileId,
    guestPartyId: row.guestPartyId,
    payload,
  };
}
