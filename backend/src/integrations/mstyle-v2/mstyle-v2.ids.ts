import { createHash, randomBytes } from 'crypto';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function ulid(): string {
  let ts = Date.now();
  let time = '';
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[ts % 32] + time;
    ts = Math.floor(ts / 32);
  }
  const bytes = randomBytes(10);
  let rand = '';
  let acc = 0;
  let bits = 0;
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      rand += CROCKFORD[(acc >> bits) & 31];
    }
  }
  if (bits > 0) rand += CROCKFORD[(acc << (5 - bits)) & 31];
  return (time + rand).slice(0, 26);
}

export function newId(prefix: string): string {
  return `${prefix}_${ulid()}`;
}

export const Ids = {
  subject: () => newId('usr'),
  profile: () => newId('prf'),
  membership: () => newId('mem'),
  challenge: () => newId('ach'),
  authentication: () => newId('aut'),
  contact: () => newId('ict'),
  guestContact: () => newId('cnt'),
  assignment: () => newId('cas'),
  guest: () => newId('gst'),
  guestToken: () => `gft_${randomBytes(32).toString('base64url')}`,
  snapshot: () => newId('snp'),
  binding: () => newId('bnd'),
  operationLink: () => newId('opl'),
  audit: () => newId('aud'),
  event: () => newId('evt'),
  request: () => newId('req'),
  changeRequest: () => newId('crq'),
  deletion: () => newId('del'),
  grant: () => newId('grt'),
  token: () => `svc_${ulid()}${ulid().slice(0, 10)}`,
  jti: () => newId('jti'),
};

// Existing cnt_ references remain valid; all public identity-contact IDs use ict_.
export function publicContactId(id: string): string {
  return id.replace(/^cnt_/, 'ict_');
}

// Older consent events used partyId:documentCode, which is not a contract ID.
export function publicConsentId(id: string): string {
  return id.includes(':')
    ? `cns_${createHash('sha256').update(id).digest('hex').slice(0, 32)}`
    : id;
}
export function contactIdQuery(id: string) {
  const canonical = publicContactId(id);
  return { $in: [canonical, canonical.replace(/^ict_/, 'cnt_')] };
}

export function publicAssignmentId(id: string): string {
  return id.replace(/^cas_/, 'pca_');
}

export type SnapshotPartyType = 'resident_profile' | 'guest_party';

export function publicSnapshotId(
  id: string,
  partyType: SnapshotPartyType,
): string {
  return id.replace(/^snp_/, partyType === 'guest_party' ? 'gps_' : 'rps_');
}

// A typed alias cannot resolve to a snapshot of the other party type.
export function snapshotQuery(id: string) {
  const partyType: SnapshotPartyType | undefined = id.startsWith('rps_')
    ? 'resident_profile'
    : id.startsWith('gps_')
      ? 'guest_party'
      : undefined;
  return {
    snapshotId: { $in: [id, id.replace(/^(rps|gps)_/, 'snp_')] },
    ...(partyType ? { partyType } : {}),
  };
}
