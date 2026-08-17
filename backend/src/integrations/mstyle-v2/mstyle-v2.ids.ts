import { randomBytes } from 'crypto';

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
  contact: () => newId('cnt'),
  assignment: () => newId('cas'),
  guest: () => newId('gst'),
  snapshot: () => newId('snp'),
  binding: () => newId('bnd'),
  event: () => newId('evt'),
  request: () => newId('req'),
  changeRequest: () => newId('crq'),
  deletion: () => newId('del'),
  grant: () => newId('grn'),
  token: () => `svc_${ulid()}${ulid().slice(0, 10)}`,
  jti: () => newId('jti'),
};
