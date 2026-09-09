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
import { Observable, map } from 'rxjs';
import { expandMstyleScopes, ROUTE_SCOPES } from './mstyle-v2.constants';
import { MstyleV2Config } from './mstyle-v2.config';
import { Ids } from './mstyle-v2.ids';
import {
  MstyleResult,
  OAuthException,
  ProblemException,
  problem,
} from './mstyle-v2.problem';
import { verify as verifyJwt } from 'jsonwebtoken';
import { verifyAdminAssertion } from './mstyle-v2.assertions';
import { sha256Hex } from './mstyle-v2.crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MstyleAdminAssertionJti,
  MstyleAdminAssertionJtiDocument,
  MstyleAuthentication,
  MstyleAuthenticationDocument,
  MstyleServiceToken,
  MstyleServiceTokenDocument,
} from './mstyle-v2.schemas';
import { SiteSettingsService } from '../../site-settings/site-settings.service';

export type MstyleRequest = Request & {
  mstyleRequestId: string;
  mstyleClientId?: string;
  mstyleScopes?: string[];
  mstyleResidentSubject?: string;
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
  ) {}

  async canActivate(): Promise<boolean> {
    if (this.cfg.isEnabled()) return true;
    const mockMode = await this.siteSettings.getMstyleMockResponsesEnabled(
      this.cfg.mockResponsesDefaultEnabled(),
    );
    if (!mockMode.enabled) {
      throw new BadRequestException({
        hideAsNotFound: true,
      });
    }
    return true;
  }
}

@Injectable()
export class MstyleServiceTokenGuard implements CanActivate {
  constructor(
    private readonly cfg: MstyleV2Config,
    @InjectModel(MstyleServiceToken.name)
    private readonly tokens: Model<MstyleServiceTokenDocument>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<MstyleRequest>();
    const header = String(req.headers.authorization || '');
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) problem(401, 'INVALID_SERVICE_TOKEN');
    const token = match[1].trim();
    const row = await this.tokens.findOne({ tokenHash: sha256Hex(token) });
    if (!row || row.expiresAt.getTime() <= Date.now()) {
      problem(401, 'INVALID_SERVICE_TOKEN');
    }
    if (row.aud !== this.cfg.tokenAudience()) {
      problem(401, 'INVALID_SERVICE_TOKEN');
    }
    req.mstyleClientId = row.clientId;
    req.mstyleScopes = expandMstyleScopes(row.scopes || []);
    const path = (req.originalUrl || req.url || '').split('?')[0];
    const method = (req.method || 'GET').toUpperCase();
    const needed = ROUTE_SCOPES.find(
      (rule) => rule.method === method && rule.match.test(path),
    );
    const acceptedScopes = needed
      ? [needed.scope, ...(needed.alternatives || [])]
      : [];
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

    if (isChanges) {
      requireHeaderValue('X-Actor-Ref', actor, 'system:reconcile');
      return true;
    }

    const policy = m1m2ContextPolicy(method, path, actor);
    if (!policy) return true;

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
      req.mstyleResidentSubject = subject;
      return true;
    }

    if (policy.actor === 'admin') {
      if (!/^wp-admin:[^:\s]+$/.test(actor)) {
        validationError('X-Actor-Ref', 'must identify a wp-admin actor');
      }
      const assertion = header(req, 'x-admin-step-up-assertion');
      requireHeader('X-Admin-Step-Up-Assertion', assertion);
      if (policy.purposes) requirePurpose(purpose, policy.purposes);
      await this.assertAdminProof(assertion, actor, purpose || undefined);
      return true;
    }

    requireHeaderValue('X-Actor-Ref', actor, 'system:delivery');
    requirePurpose(purpose, policy.purposes || []);
    return true;
  }

  private async assertAdminProof(
    assertion: string,
    actor: string,
    purpose?: string,
  ) {
    if (assertion.startsWith('v1.')) {
      const verified = verifyAdminAssertion(
        this.cfg.adminAssertionSecret(),
        assertion,
        { actor, purpose },
      );
      try {
        await this.adminAssertions.create({
          jti: verified.jti,
          actor,
          expiresAt: new Date(verified.exp * 1000),
        });
      } catch {
        problem(401, 'INVALID_ADMIN_ASSERTION');
      }
      return;
    }
    try {
      const payload = verifyJwt(assertion, this.cfg.jwtSecret()) as {
        role?: string;
        exp?: number;
      };
      if (payload?.role !== 'admin') {
        problem(401, 'INVALID_ADMIN_ASSERTION');
      }
    } catch {
      problem(401, 'INVALID_ADMIN_ASSERTION');
    }
  }
}

type ContextPolicy = {
  actor: 'resident' | 'admin' | 'delivery';
  purposes?: readonly string[];
};

function m1m2ContextPolicy(
  method: string,
  path: string,
  actor: string,
): ContextPolicy | null {
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
  intercept(
    ctx: ExecutionContext,
    next: { handle: () => Observable<unknown> },
  ) {
    const req = ctx.switchToHttp().getRequest<MstyleRequest>();
    const res = ctx.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((value) => {
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
          return value.body;
        }
        if (!res.getHeader('Cache-Control')) {
          res.setHeader('Cache-Control', 'no-store');
        }
        return value;
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
