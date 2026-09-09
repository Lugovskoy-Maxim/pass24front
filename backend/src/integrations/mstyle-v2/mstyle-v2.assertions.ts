import { hmacHex, safeEqualHex } from './mstyle-v2.crypto';
import { Ids } from './mstyle-v2.ids';
import { problem } from './mstyle-v2.problem';

export const ADMIN_ASSERTION_MAX_TTL_SEC = 300;

export type AdminAssertionClaims = {
  v: 1;
  actor: string;
  purpose?: string;
  iat: number;
  exp: number;
  jti: string;
};

export function createAdminAssertion(
  secret: string,
  input: {
    actor: string;
    purpose?: string;
    ttlSec?: number;
    now?: number;
    jti?: string;
  },
): string {
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const ttl = Math.min(
    input.ttlSec ?? ADMIN_ASSERTION_MAX_TTL_SEC,
    ADMIN_ASSERTION_MAX_TTL_SEC,
  );
  const claims: AdminAssertionClaims = {
    v: 1,
    actor: input.actor,
    iat: now,
    exp: now + Math.max(1, ttl),
    jti: input.jti || Ids.jti(),
  };
  if (input.purpose) claims.purpose = input.purpose;
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `v1.${body}.${hmacHex(secret, assertionMaterial(body))}`;
}

export function verifyAdminAssertion(
  secret: string,
  raw: string,
  expected: { actor: string; purpose?: string },
  now = Math.floor(Date.now() / 1000),
): { jti: string; exp: number } {
  const [version, body, signature, extra] = String(raw || '').split('.');
  if (version !== 'v1' || !body || !signature || extra) {
    problem(401, 'INVALID_ADMIN_ASSERTION');
  }
  const expectedSignature = hmacHex(secret, assertionMaterial(body));
  if (!safeEqualHex(signature, expectedSignature)) {
    problem(401, 'INVALID_ADMIN_ASSERTION');
  }
  let claims: AdminAssertionClaims;
  try {
    claims = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as AdminAssertionClaims;
  } catch {
    problem(401, 'INVALID_ADMIN_ASSERTION');
  }
  if (
    claims.v !== 1 ||
    claims.actor !== expected.actor ||
    typeof claims.jti !== 'string' ||
    !claims.jti ||
    !Number.isInteger(claims.iat) ||
    !Number.isInteger(claims.exp) ||
    claims.exp <= now ||
    claims.iat > now + 5 ||
    claims.exp - claims.iat > ADMIN_ASSERTION_MAX_TTL_SEC ||
    claims.exp - claims.iat < 1
  ) {
    problem(401, 'INVALID_ADMIN_ASSERTION');
  }
  if (
    expected.purpose &&
    claims.purpose &&
    claims.purpose !== expected.purpose
  ) {
    problem(401, 'INVALID_ADMIN_ASSERTION');
  }
  return { jti: claims.jti, exp: claims.exp };
}

function assertionMaterial(body: string): string {
  return `mstyle-admin-assertion:${body}`;
}
