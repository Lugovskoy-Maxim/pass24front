import type { MstyleOauthClient } from './mstyle-v2.config';
import { verifyRegisteredJwt } from './mstyle-v2.jwt';
import { ProblemException } from './mstyle-v2.problem';

export const ADMIN_ASSERTION_TYPE = 'mstyle-admin-step-up+jwt';
export const ADMIN_ASSERTION_MAX_TTL_SEC = 60;
export const ADMIN_ASSERTION_FIELDS = [
  'iss',
  'sub',
  'aud',
  'iat',
  'exp',
  'jti',
  'auth_context',
  'scope',
  'purpose',
  'method',
  'target',
  'requestId',
] as const;
export type AdminAssertionClaims = {
  iss: string;
  sub: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
  auth_context: string;
  scope: string;
  purpose: string;
  method: string;
  target: string;
  requestId: string;
};
export type AdminAssertionReason =
  'required' | 'invalid' | 'expired' | 'replayed';
export class AdminAssertionException extends ProblemException {
  constructor(
    reason: AdminAssertionReason,
    message: string,
    public readonly detail: string,
    public readonly jti?: string,
  ) {
    super(403, 'ADMIN_ASSERTION_INVALID', {
      retryable: false,
      errors: [{ field: 'X-Admin-Step-Up-Assertion', code: reason, message }],
    });
  }
}
export function adminAssertionError(
  reason: AdminAssertionReason,
  detail = reason as string,
  jti?: string,
): never {
  const messages = {
    required: 'Administrative assertion is required',
    invalid: 'Administrative assertion is invalid',
    expired: 'Administrative assertion has expired',
    replayed: 'Administrative assertion has already been used',
  };
  throw new AdminAssertionException(reason, messages[reason], detail, jti);
}
export function verifyAdminAssertion(
  raw: string,
  client: MstyleOauthClient,
  expected: {
    actor: string;
    audience: string;
    scope: string;
    purpose: string;
    method: string;
    target: string;
    requestId: string;
  },
  now = Math.floor(Date.now() / 1000),
): AdminAssertionClaims {
  if (!raw) adminAssertionError('required');
  let claims: AdminAssertionClaims | undefined;
  try {
    claims = verifyRegisteredJwt(
      raw,
      client,
      ADMIN_ASSERTION_TYPE,
      ADMIN_ASSERTION_FIELDS,
    ) as AdminAssertionClaims;
    if (
      !client.adminAllowed ||
      ADMIN_ASSERTION_FIELDS.some(
        (field) =>
          typeof claims?.[field] !==
          (field === 'iat' || field === 'exp' ? 'number' : 'string'),
      ) ||
      !Number.isSafeInteger(claims.iat) ||
      !Number.isSafeInteger(claims.exp) ||
      claims.iss !== client.clientId ||
      claims.sub !== expected.actor ||
      !/^wp-admin:[1-9][0-9]*$/.test(claims.sub) ||
      claims.aud !== expected.audience ||
      claims.auth_context !== 'wp_session' ||
      claims.scope !== expected.scope ||
      !client.scopes.includes(claims.scope) ||
      claims.purpose !== expected.purpose ||
      claims.method !== expected.method ||
      claims.target !== expected.target ||
      claims.requestId !== expected.requestId ||
      !/^[A-Za-z0-9_-]{32}$/.test(claims.jti) ||
      claims.exp - claims.iat <= 0 ||
      claims.exp - claims.iat > 60 ||
      claims.iat > now + 5
    )
      throw new Error('claims');
  } catch (error) {
    const detail = [
      'size',
      'format',
      'encoding',
      'json',
      'duplicate',
      'fields',
      'profile',
      'key',
      'signature',
      'claims',
    ].includes((error as Error).message)
      ? (error as Error).message
      : 'verification';
    adminAssertionError(
      'invalid',
      detail,
      typeof claims?.jti === 'string' && /^[A-Za-z0-9_-]{32}$/.test(claims.jti)
        ? claims.jti
        : undefined,
    );
  }
  if (now >= claims.exp + 5)
    adminAssertionError('expired', 'expired', claims.jti);
  return claims;
}
