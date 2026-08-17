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
import { ROUTE_SCOPES } from './mstyle-v2.constants';
import { MstyleV2Config } from './mstyle-v2.config';
import { Ids } from './mstyle-v2.ids';
import {
  MstyleResult,
  OAuthException,
  ProblemException,
  problem,
} from './mstyle-v2.problem';
import { sha256Hex } from './mstyle-v2.crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MstyleServiceToken,
  MstyleServiceTokenDocument,
} from './mstyle-v2.schemas';

export type MstyleRequest = Request & {
  mstyleRequestId: string;
  mstyleClientId?: string;
  mstyleScopes?: string[];
};

export const REQUIRE_IDEMPOTENCY = 'mstyle:idempotency';
export const REQUIRE_REQUEST_ID = 'mstyle:request-id';

@Injectable()
export class MstyleEnabledGuard implements CanActivate {
  constructor(private readonly cfg: MstyleV2Config) {}

  canActivate(): boolean {
    if (!this.cfg.isEnabled()) {
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
    req.mstyleScopes = row.scopes || [];
    const path = (req.originalUrl || req.url || '').split('?')[0];
    const method = (req.method || 'GET').toUpperCase();
    const needed = ROUTE_SCOPES.find(
      (rule) => rule.method === method && rule.match.test(path),
    );
    if (needed && !req.mstyleScopes.includes(needed.scope)) {
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
