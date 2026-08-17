import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmacHex(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    timingSafeEqual(left, Buffer.alloc(left.length));
    return false;
  }
  return timingSafeEqual(left, right);
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
    .join(',')}}`;
}

export function idempotencyFingerprint(
  secret: string,
  parts: {
    clientId: string;
    method: string;
    route: string;
    body: unknown;
  },
): string {
  const material = [
    parts.clientId,
    parts.method.toUpperCase(),
    parts.route,
    canonicalJson(parts.body ?? {}),
  ].join('\n');
  return hmacHex(secret, `v1\n${material}`);
}

export function deriveKey(secret: string, salt: string): Buffer {
  return createHmac('sha256', secret).update(salt).digest();
}

export function encryptJson(
  secret: string,
  value: unknown,
): { keyVersion: number; iv: string; tag: string; ciphertext: string } {
  const key = deriveKey(secret, 'mstyle-v2-pii-v1');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plain = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    keyVersion: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export function decryptJson<T = unknown>(
  secret: string,
  payload: {
    keyVersion: number;
    iv: string;
    tag: string;
    ciphertext: string;
  },
): T {
  const key = deriveKey(secret, `mstyle-v2-pii-v${payload.keyVersion || 1}`);
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(payload.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(plain.toString('utf8')) as T;
}

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 6) return '***';
  const tail = digits.slice(-4);
  if (value.startsWith('+')) return `+${digits[0]}******${tail}`;
  return `${digits[0]}******${tail}`;
}

export function maskEmail(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const at = trimmed.indexOf('@');
  if (at < 1) return '***';
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const keep = local.slice(0, 1);
  return `${keep}***@${domain}`;
}

export function maskContact(type: 'phone' | 'email', value: string): string {
  return type === 'phone' ? maskPhone(value) : maskEmail(value);
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function dummyHashWork(secret: string, value: string): string {
  return hmacHex(secret, `dummy-work:${value}`);
}
