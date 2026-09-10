import { MstyleNativeConsoleProof } from './mstyle-v2.native-console';
import { MstyleIdentityService } from './mstyle-v2.identities';
import { MSTYLE_ADMIN_PROBE_CLIENT_ID } from './mstyle-v2.constants';
import { guestFlowRoute, guestWriteAllowed } from './mstyle-v2.guest-access';
import {
  BadRequestException,
  CanActivate,
  Catch,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  ExceptionFilter,
  ArgumentsHost,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Observable, mergeMap } from 'rxjs';
import { MstylePublicResponseService } from './mstyle-v2.public-response';
import { membershipIsEffective } from './mstyle-v2.membership-policy';
import { MstyleReadinessService } from './mstyle-v2.readiness';
import { expandMstyleScopes, ROUTE_SCOPES } from './mstyle-v2.constants';
import { MstyleV2Config } from './mstyle-v2.config';
import { Ids } from './mstyle-v2.ids';
import {
  MstyleResult,
  OAuthException,
  ProblemException,
  problem,
} from './mstyle-v2.problem';
import {
  AdminAssertionException,
  ADMIN_ASSERTION_TYPE,
  adminAssertionError,
  verifyAdminAssertion,
} from './mstyle-v2.assertions';
import { jwtReplayKey } from './mstyle-v2.jwt';
import { sha256Hex } from './mstyle-v2.crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MstyleAdminAssertionJti,
  MstyleAdminAssertionAudit,
  MstyleMembership,
  MstyleAdminAssertionJtiDocument,
  MstyleAuthentication,
  MstyleAuthenticationDocument,
  MstyleGuestParty,
  MstyleServiceToken,
  MstyleServiceTokenDocument,
} from './mstyle-v2.schemas';
import { SiteSettingsService } from '../../site-settings/site-settings.service';

export type MstyleRequest = Request & {
  mstyleRequestId: string;
  mstyleClientId?: string;
  mstyleScopes?: string[];
  mstyleTokenScopes?: string[];
  mstyleAcceptedScopes?: string[];
  mstyleResidentSubject?: string;
  mstyleGuestPartyId?: string;
  mstyleActorRef?: string;
  mstylePurposeCode?: string;
};

export const REQUIRE_IDEMPOTENCY = 'mstyle:idempotency';
export const REQUIRE_REQUEST_ID = 'mstyle:request-id';

@Injectable()
export class MstyleEnabledGuard implements CanActivate {
  constructor(
    private readonly cfg: MstyleV2Config,
    private readonly siteSettings: SiteSettingsService,
    private readonly readiness: MstyleReadinessService,
  ) {}

  async canActivate(): Promise<boolean> {
    if (this.cfg.isEnabled()) {
      await this.readiness.assertReady();
      return true;
    }
    const mockMode = await this.siteSettings.getMstyleMockResponsesEnabled(
      this.cfg.mockResponsesDefaultEnabled(),
    );
    if (!mockMode.enabled) {
      throw new BadRequestException({
        hideAsNotFound: true,
      });
    }
    await this.readiness.assertReady();
    return true;
  }
}

@Injectable()
export class MstyleServiceTokenGuard implements CanActivate {
  constructor(
    private readonly cfg: MstyleV2Config,
    @InjectModel(MstyleServiceToken.name)
    private readonly tokens: Model<MstyleServiceTokenDocument>,
    @InjectModel(MstyleGuestParty.name)
    private readonly guests?: Model<MstyleGuestParty>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<MstyleRequest>();
    validateHeaderEnvelope(req);
    const header = String(req.headers.authorization || '');
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) problem(401, 'INVALID_SERVICE_TOKEN');
    const token = match[1].trim();
    let row: MstyleServiceTokenDocument | null;
    try {
      row = await this.tokens.findOne({ tokenHash: sha256Hex(token) });
    } catch {
      problem(503, 'UPSTREAM_UNAVAILABLE', { retryable: true });
    }
    const path = (req.originalUrl || req.url || '').split('?')[0];
    const method = (req.method || 'GET').toUpperCase();
    const guestId = guestFlowRoute(method, path);
    if (!row && this.guests) {
      const guest = await this.guests.findOne({
        guestFlowAccessTokenHash: sha256Hex(token),
      });
      if (!guest || guest.expiresAt.getTime() <= Date.now())
        problem(401, 'INVALID_SERVICE_TOKEN');
      if (!guestId || guestId !== guest.guestPartyId)
        problem(403, 'INSUFFICIENT_SCOPE');
      if (method !== 'GET' && !guestWriteAllowed(guest.status))
        problem(409, 'CONFLICT');
      const scope = ROUTE_SCOPES.find(
        (rule) => rule.method === method && rule.match.test(path),
      )?.scope;
      if (!scope) problem(403, 'INSUFFICIENT_SCOPE');
      req.mstyleGuestPartyId = guestId;
      req.mstyleClientId = `guest-flow:${guestId}`;
      req.mstyleTokenScopes =
        req.mstyleScopes =
        req.mstyleAcceptedScopes =
          [scope];
      return true;
    }
    if (!row || row.expiresAt.getTime() <= Date.now()) {
      problem(401, 'INVALID_SERVICE_TOKEN');
    }
    if (row.aud !== this.cfg.tokenAudience()) {
      problem(401, 'INVALID_SERVICE_TOKEN');
    }
    req.mstyleClientId = row.clientId;
    req.mstyleTokenScopes = [...(row.scopes || [])];
    req.mstyleScopes = expandMstyleScopes(row.scopes || []);
    if (guestId) problem(403, 'INSUFFICIENT_SCOPE');
    const needed = ROUTE_SCOPES.find(
      (rule) => rule.method === method && rule.match.test(path),
    );
    const acceptedScopes = needed
      ? [needed.scope, ...(needed.alternatives || [])]
      : [];
    req.mstyleAcceptedScopes = acceptedScopes;
    if (
      !needed ||
      !acceptedScopes.some((scope) => req.mstyleScopes!.includes(scope))
    ) {
      problem(403, 'INSUFFICIENT_SCOPE');
    }
    return true;
  }
}

@Injectable()
export class MstyleRequestGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<MstyleRequest>();
    const needId =
      this.reflector.getAllAndOverride<boolean>(REQUIRE_REQUEST_ID, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? false;
    const headerId = String(req.headers['x-request-id'] || '').trim();
    if (needId && !headerId) {
      problem(422, 'VALIDATION_FAILED', {
        errors: [
          { field: 'X-Request-ID', code: 'required', message: 'Required' },
        ],
      });
    }
    req.mstyleRequestId = headerId || Ids.request();

    const needIdem =
      this.reflector.getAllAndOverride<boolean>(REQUIRE_IDEMPOTENCY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? false;
    if (needIdem && !String(req.headers['idempotency-key'] || '').trim()) {
      problem(422, 'VALIDATION_FAILED', {
        errors: [
          {
            field: 'Idempotency-Key',
            code: 'required',
            message: 'Required',
          },
        ],
      });
    }
    return true;
  }
}

/**
 * Enforces the actor context defined by the M1/M2 contract, including a
 * signed admin assertion and a stored resident step-up authentication.
 */
@Injectable()
export class MstyleRouteContextGuard implements CanActivate {
  constructor(
    private readonly cfg: MstyleV2Config,
    @InjectModel(MstyleAuthentication.name)
    private readonly authentications: Model<MstyleAuthenticationDocument>,
    @InjectModel(MstyleAdminAssertionJti.name)
    private readonly adminAssertions: Model<MstyleAdminAssertionJtiDocument>,
    @InjectModel(MstyleAdminAssertionAudit.name)
    private readonly assertionAudit: Model<MstyleAdminAssertionAudit>,
    private readonly identities: MstyleIdentityService,
    @InjectModel(MstyleMembership.name)
    private readonly memberships: Model<MstyleMembership>,
    private readonly nativeConsole?: MstyleNativeConsoleProof,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<MstyleRequest>();
    const path = (req.originalUrl || req.url || '').split('?')[0];
    const method = (req.method || 'GET').toUpperCase();
    const isChanges = method === 'GET' && /\/changes$/.test(path);
    const reconcileClientId = this.cfg.reconcileClientId();

    if (isChanges) {
      if (!reconcileClientId || req.mstyleClientId !== reconcileClientId) {
        problem(403, 'INSUFFICIENT_SCOPE');
      }
    } else if (reconcileClientId && req.mstyleClientId === reconcileClientId) {
      problem(403, 'INSUFFICIENT_SCOPE');
    }

    const actor = header(req, 'x-actor-ref');
    const purpose = header(req, 'x-purpose-code');
    req.mstyleActorRef = actor || undefined;
    req.mstylePurposeCode = purpose || undefined;

    if (req.mstyleGuestPartyId) {
      requireHeaderValue(
        'X-Actor-Ref',
        actor,
        `guest:${req.mstyleGuestPartyId}`,
      );
      if (
        Object.keys(req.headers).some(
          (name) =>
            name.startsWith('x-resident-') ||
            name === 'x-step-up-authentication-id' ||
            name === 'x-admin-step-up-assertion',
        )
      )
        validationError('X-Actor-Ref', 'Mixed actor contexts');
      if (/\/snapshots$/.test(path))
        requirePurpose(purpose, ['booking_snapshot_create']);
      else if (method === 'PATCH' || /\/contact-challenges/.test(path))
        requirePurpose(purpose, ['guest_booking_registration']);
      else if (purpose) validationError('X-Purpose-Code', 'must be absent');
      return true;
    }
    if (method === 'POST' && /\/guest-parties$/.test(path)) {
      requireHeaderValue('X-Actor-Ref', actor, 'guest:booking');
      requirePurpose(purpose, ['guest_booking_registration']);
      return true;
    }
    if (isChanges) {
      requireHeaderValue('X-Actor-Ref', actor, 'system:reconcile');
      return true;
    }

    const policy = m1m2ContextPolicy(method, path, actor);
    if (!policy) {
      if (
        actor.startsWith('wp-admin:') ||
        header(req, 'x-admin-step-up-assertion')
      )
        problem(403, 'INSUFFICIENT_SCOPE');
      return true;
    }
    if (policy.actor === 'outbox') {
      requireHeaderValue('X-Actor-Ref', actor, 'system:outbox');
      return true;
    }

    if (policy.actor === 'resident') {
      const subject = header(req, 'x-resident-subject');
      requireHeader('X-Resident-Subject', subject);
      requireHeaderValue('X-Actor-Ref', actor, `resident:${subject}`);
      const stepUpId = header(req, 'x-step-up-authentication-id');
      requireHeader('X-Step-Up-Authentication-ID', stepUpId);
      if (policy.purposes) requirePurpose(purpose, policy.purposes);
      const session = await this.authentications.findOne({
        authenticationId: stepUpId,
        subject,
      });
      if (!session || session.expiresAt.getTime() <= Date.now()) {
        problem(401, 'STEP_UP_REQUIRED');
      }
      const identity = await this.identities.findIdentityBySubject(subject);
      if (
        !identity ||
        identity.identityStatus !== 'active' ||
        identity.authVersion !== session.authVersion
      )
        problem(401, 'STEP_UP_REQUIRED');
      if (req.params.subject && req.params.subject !== subject)
        problem(404, 'NOT_FOUND');
      if (req.params.profileId) {
        const owner = await this.memberships.findOne({
          profileId: req.params.profileId,
          subject,
          ...(policy.owner ? { role: 'owner' } : {}),
          status: 'active',
        });
        if (!membershipIsEffective(owner)) problem(404, 'NOT_FOUND');
      }
      req.mstyleResidentSubject = subject;
      return true;
    }

    if (policy.actor === 'admin') {
      if (
        actor === 'wp-admin:api-console' &&
        req.mstyleClientId === MSTYLE_ADMIN_PROBE_CLIENT_ID &&
        this.nativeConsole
      ) {
        if (policy.purposes) requirePurpose(purpose, policy.purposes);
        const nativeId = await this.nativeConsole.verify(
          header(req, 'x-admin-step-up-assertion'),
        );
        await this.assertionAudit.create({
          clientId: req.mstyleClientId,
          actorRef: `pass-admin:${nativeId}`,
          route: method + ' ' + (req.route?.path || path),
          purpose,
          requestId: req.mstyleRequestId,
          result: 'accepted',
          detail: 'native-console',
        });
        return true;
      }
      if (!/^wp-admin:[1-9][0-9]*$/.test(actor))
        validationError('X-Actor-Ref', 'must identify a wp-admin actor');
      if (policy.purposes) requirePurpose(purpose, policy.purposes);
      else if (purpose) validationError('X-Purpose-Code', 'must be absent');
      await this.assertAdminProof(req, actor, purpose);
      return true;
    }

    requireHeaderValue('X-Actor-Ref', actor, 'system:delivery');
    requirePurpose(purpose, policy.purposes || []);
    return true;
  }

  private async assertAdminProof(
    req: MstyleRequest,
    actor: string,
    purpose: string,
  ) {
    let nonce: string | undefined;
    let result = 'accepted';
    let detail = 'verified';
    try {
      const assertion = header(req, 'x-admin-step-up-assertion');
      if (!assertion) adminAssertionError('required');
      const client = this.cfg.oauthClient(req.mstyleClientId!);
      const scopes = req.mstyleTokenScopes || [];
      if (
        !client ||
        !client.adminAllowed ||
        scopes.length !== 1 ||
        !req.mstyleAcceptedScopes?.includes(scopes[0])
      )
        adminAssertionError('invalid');
      const claims = verifyAdminAssertion(assertion, client, {
        actor,
        audience: this.cfg.privateApiBase(),
        scope: scopes[0],
        purpose,
        method: req.method.toUpperCase(),
        target: req.originalUrl || req.url,
        requestId: req.mstyleRequestId,
      });
      nonce = claims.jti;
      try {
        await this.adminAssertions.create(
          [
            {
              jti: jwtReplayKey(claims.iss, ADMIN_ASSERTION_TYPE, claims.jti),
              issuer: claims.iss,
              tokenType: ADMIN_ASSERTION_TYPE,
              nonce: claims.jti,
              actor,
              expiresAt: new Date((claims.exp + 5) * 1000),
            },
          ],
          { w: 'majority' },
        );
      } catch (error) {
        if ((error as { code?: number }).code === 11000)
          adminAssertionError('replayed');
        problem(503, 'UPSTREAM_UNAVAILABLE', { retryable: true });
      }
    } catch (error) {
      if (error instanceof AdminAssertionException) {
        detail = error.detail;
        nonce = nonce || error.jti;
      } else detail = 'infrastructure';
      result =
        error instanceof ProblemException
          ? error.errors[0]?.code || error.problemCode
          : 'UPSTREAM_UNAVAILABLE';
      if (error instanceof ProblemException) throw error;
      problem(503, 'UPSTREAM_UNAVAILABLE', { retryable: true });
    } finally {
      try {
        await this.assertionAudit.create({
          clientId: req.mstyleClientId,
          actorRef: actor,
          route:
            req.method +
            ' ' +
            (req.route?.path || (req.originalUrl || req.url).split('?')[0]),
          purpose,
          requestId: req.mstyleRequestId,
          jti: nonce,
          result,
          detail,
        });
      } catch {
        problem(503, 'UPSTREAM_UNAVAILABLE', { retryable: true });
      }
    }
  }
}

type ContextPolicy = {
  actor: 'resident' | 'admin' | 'delivery' | 'outbox';
  owner?: boolean;
  purposes?: readonly string[];
};

function m1m2ContextPolicy(
  method: string,
  path: string,
  actor: string,
): ContextPolicy | null {
  if (
    method === 'GET' &&
    /\/resident-profiles\/[^/]+(?:\/memberships|\/contact-assignments)?$/.test(
      path,
    )
  ) {
    return actor.startsWith('wp-admin:')
      ? { actor: 'admin' }
      : { actor: 'resident', owner: /\/memberships$/.test(path) };
  }
  if (
    method === 'POST' &&
    /(?:\/private-data-snapshots\/[^/]+\/operation-bindings|\/guest-parties\/[^/]+\/booking-confirmations)$/.test(
      path,
    )
  )
    return { actor: 'outbox' };
  if (
    method === 'POST' &&
    /\/resident-profiles\/[^/]+\/memberships$/.test(path)
  )
    return {
      actor: 'resident',
      owner: true,
      purposes: ['membership_invitation'],
    };
  if (
    method === 'PATCH' &&
    /\/resident-profiles\/[^/]+\/contact-assignments$/.test(path)
  )
    return {
      actor: 'resident',
      owner: true,
      purposes: ['account_profile_edit'],
    };
  if (
    method === 'POST' &&
    /\/residents\/[^/]+\/contacts\/challenges(?:\/[^/]+\/verify)?$/.test(path)
  )
    return { actor: 'resident' };
  if (method === 'POST' && /\/residents\/[^/]+\/contacts\/reveal$/.test(path))
    return { actor: 'resident', purposes: ['account_contact_view'] };
  if (
    method === 'GET' &&
    /\/resident-profiles\/[^/]+\/private-data\/status$/.test(path)
  )
    return { actor: 'resident' };
  if (
    method === 'POST' &&
    /\/resident-profiles\/[^/]+\/private-data\/reveal$/.test(path)
  )
    return {
      actor: 'resident',
      owner: true,
      purposes: ['account_profile_view'],
    };
  if (
    method === 'PATCH' &&
    /\/resident-profiles\/[^/]+\/private-data$/.test(path)
  )
    return {
      actor: 'resident',
      owner: true,
      purposes: ['account_profile_edit'],
    };
  if (
    method === 'POST' &&
    /\/resident-profiles\/[^/]+\/private-data\/snapshots$/.test(path)
  )
    return { actor: 'resident', purposes: ['booking_snapshot_create'] };
  const adminOnly =
    (method === 'POST' && /\/resident-profiles\/search$/.test(path)) ||
    (method === 'POST' && /\/resident-onboarding$/.test(path)) ||
    (method === 'POST' &&
      /\/resident-profiles\/[^/]+\/lifecycle-transitions$/.test(path)) ||
    (method === 'POST' &&
      /\/resident-profiles\/[^/]+\/deletion-requests$/.test(path)) ||
    (method === 'GET' && /\/identities\/[^/]+$/.test(path)) ||
    (method === 'POST' &&
      /\/resident-profile-change-requests\/[^/]+\/decisions$/.test(path)) ||
    (method === 'GET' && /\/deletion-requests\/[^/]+$/.test(path)) ||
    (method === 'POST' && /\/guest-parties\/search$/.test(path)) ||
    (method === 'POST' &&
      /\/guest-parties\/[^/]+\/(?:contacts|private-data)\/reveal$/.test(path));
  if (adminOnly) {
    if (/\/resident-onboarding$/.test(path)) {
      return { actor: 'admin', purposes: ['resident_onboarding'] };
    }
    if (/\/identities\/[^/]+$/.test(path)) {
      return { actor: 'admin' };
    }
    if (
      /\/resident-profiles\/search$/.test(path) ||
      /\/resident-profile-change-requests\/[^/]+\/decisions$/.test(path) ||
      /\/guest-parties\/(?:search|[^/]+\/(?:contacts|private-data)\/reveal)$/.test(
        path,
      )
    ) {
      return {
        actor: 'admin',
        purposes: /\/decisions$/.test(path)
          ? ['admin_support_review', 'profile_change_request']
          : ['admin_support_review'],
      };
    }
    return { actor: 'admin' };
  }

  if (
    method === 'GET' &&
    /\/resident-profiles\/[^/]+\/physical-access$/.test(path)
  ) {
    return actor.startsWith('wp-admin:')
      ? { actor: 'admin' }
      : { actor: 'resident' };
  }
  if (
    method === 'POST' &&
    /\/resident-profiles\/[^/]+\/contacts\/reveal$/.test(path)
  ) {
    return actor.startsWith('wp-admin:')
      ? { actor: 'admin', purposes: ['admin_support_review'] }
      : { actor: 'resident', purposes: ['account_profile_view'] };
  }
  if (
    method === 'POST' &&
    /\/private-data-snapshots\/[^/]+\/reveal$/.test(path)
  ) {
    return actor.startsWith('wp-admin:')
      ? { actor: 'admin', purposes: ['admin_support_review'] }
      : { actor: 'delivery', purposes: ['booking_document_render'] };
  }
  if (
    method === 'POST' &&
    /\/private-data-snapshots\/[^/]+\/contacts\/reveal$/.test(path)
  ) {
    return {
      actor: 'delivery',
      purposes: [
        'booking_document_render',
        'payment_receipt_delivery',
        'booking_notification_delivery',
      ],
    };
  }

  if (
    /\/residents\/[^/]+\/consents(?:\/[^/]+\/(?:accept|withdraw))?$/.test(path)
  )
    return { actor: 'resident' };
  const residentOnly =
    (method === 'POST' &&
      /\/resident-profiles\/[^/]+\/change-requests$/.test(path)) ||
    (method === 'GET' &&
      /\/resident-profiles\/[^/]+\/change-requests\/current$/.test(path)) ||
    (method === 'POST' &&
      /\/resident-profile-change-requests\/[^/]+\/cancel$/.test(path)) ||
    (method === 'PATCH' && /\/resident-memberships\/[^/]+$/.test(path)) ||
    (method === 'POST' &&
      /\/resident-memberships\/[^/]+\/revoke$/.test(path)) ||
    (method === 'POST' &&
      /\/resident-profiles\/[^/]+\/owner-transfer$/.test(path)) ||
    (method === 'POST' && /\/guest-parties\/[^/]+\/claim$/.test(path));
  if (!residentOnly) return null;
  return {
    actor: 'resident',
    purposes: /\/change-requests$/.test(path)
      ? ['profile_change_request']
      : undefined,
  };
}

export function validateHeaderEnvelope(req: MstyleRequest): void {
  const protectedNames = new Set([
    'authorization',
    'x-actor-ref',
    'x-admin-step-up-assertion',
    'x-request-id',
    'x-purpose-code',
    'if-match',
    'idempotency-key',
  ]);
  const seen = new Set<string>();
  for (let index = 0; index < (req.rawHeaders || []).length; index += 2) {
    const name = req.rawHeaders[index].toLowerCase();
    if (protectedNames.has(name) && seen.has(name))
      validationError(name, 'Duplicate header');
    seen.add(name);
  }
  for (const name of protectedNames)
    if (Array.isArray(req.headers[name]))
      validationError(name, 'Duplicate header');
  const actor = String(req.headers['x-actor-ref'] || '');
  const admin =
    actor.startsWith('wp-admin:') || !!req.headers['x-admin-step-up-assertion'];
  if (
    admin &&
    Object.keys(req.headers).some(
      (name) =>
        name.startsWith('x-resident-') ||
        name.startsWith('x-guest-') ||
        name === 'x-step-up-authentication-id',
    )
  )
    validationError('X-Actor-Ref', 'Mixed actor contexts');
  if (
    req.headers['x-admin-step-up-assertion'] &&
    !actor.startsWith('wp-admin:')
  )
    validationError('X-Actor-Ref', 'Mixed actor contexts');
  req.mstyleRequestId =
    String(req.headers['x-request-id'] || '').trim() || Ids.request();
}

function header(req: Request, name: string): string {
  return String(req.headers[name] || '').trim();
}

function requireHeader(name: string, value: string): void {
  if (!value) validationError(name, 'Required');
}

function requireHeaderValue(
  name: string,
  value: string,
  expected: string,
): void {
  if (value !== expected) validationError(name, `must be ${expected}`);
}

function requirePurpose(value: string, allowed: readonly string[]): void {
  if (!allowed.includes(value)) {
    validationError('X-Purpose-Code', `must be one of: ${allowed.join(', ')}`);
  }
}

function validationError(field: string, message: string): never {
  problem(422, 'VALIDATION_FAILED', {
    errors: [{ field, code: 'invalid', message }],
  });
}

@Injectable()
export class MstyleResultInterceptor implements NestInterceptor {
  constructor(private readonly responses: MstylePublicResponseService) {}
  intercept(
    ctx: ExecutionContext,
    next: { handle: () => Observable<unknown> },
  ) {
    const req = ctx.switchToHttp().getRequest<MstyleRequest>();
    const res = ctx.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      mergeMap(async (value) => {
        const requestId = req.mstyleRequestId || Ids.request();
        res.setHeader('X-Request-ID', requestId);
        if (value instanceof MstyleResult) {
          res.status(value.status);
          for (const [key, header] of Object.entries(value.headers)) {
            res.setHeader(key, header);
          }
          if (!res.getHeader('Cache-Control')) {
            res.setHeader('Cache-Control', 'no-store');
          }
          return this.responses.present(
            value.body,
            req.originalUrl || req.url || '',
          );
        }
        if (!res.getHeader('Cache-Control')) {
          res.setHeader('Cache-Control', 'no-store');
        }
        return this.responses.present(value, req.originalUrl || req.url || '');
      }),
    );
  }
}

@Catch()
export class MstyleProblemFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<MstyleRequest>();
    const res = ctx.getResponse<Response>();
    const requestId = req.mstyleRequestId || Ids.request();
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('Cache-Control', 'no-store');

    if (exception instanceof OAuthException) {
      return res.status(exception.getStatus()).json(exception.toBody());
    }

    if (exception instanceof ProblemException) {
      if (exception.retryAfter) {
        res.setHeader('Retry-After', String(exception.retryAfter));
      }
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'application/problem+json; charset=utf-8');
      return res
        .status(exception.getStatus())
        .json(exception.toBody(requestId));
    }

    if (exception instanceof BadRequestException) {
      const body = exception.getResponse();
      if (
        body &&
        typeof body === 'object' &&
        (body as { hideAsNotFound?: boolean }).hideAsNotFound
      ) {
        return res.status(404).json({
          statusCode: 404,
          message: 'Запрошенные данные не найдены.',
          error: 'Not Found',
        });
      }
      const messages = extractMessages(body);
      const problemEx = new ProblemException(422, 'VALIDATION_FAILED', {
        errors: messages.map((message) => ({ message })),
      });
      res.setHeader('Content-Type', 'application/problem+json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(422).json(problemEx.toBody(requestId));
    }

    if (exception instanceof UnauthorizedException) {
      const problemEx = new ProblemException(401, 'INVALID_SERVICE_TOKEN');
      res.setHeader('Content-Type', 'application/problem+json; charset=utf-8');
      return res.status(401).json(problemEx.toBody(requestId));
    }

    const fallback = new ProblemException(503, 'UPSTREAM_UNAVAILABLE', {
      retryable: true,
    });
    res.setHeader('Content-Type', 'application/problem+json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json(fallback.toBody(requestId));
  }
}

function extractMessages(body: unknown): string[] {
  if (typeof body === 'string') return [body];
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (Array.isArray(message)) return message.map(String);
    if (typeof message === 'string') return [message];
  }
  return ['Validation failed'];
}
