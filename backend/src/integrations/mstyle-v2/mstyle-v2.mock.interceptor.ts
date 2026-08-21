import { ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable, of } from 'rxjs';
import { SiteSettingsService } from '../../site-settings/site-settings.service';
import { MSTYLE_V2_CATALOG } from './mstyle-v2.catalog';
import { MstyleV2Config } from './mstyle-v2.config';
import {
  createMstyleMockResponse,
  matchMstyleMockEndpoint,
} from './mstyle-v2.mock';
import { MstyleResult } from './mstyle-v2.problem';

@Injectable()
export class MstyleMockResponseInterceptor implements NestInterceptor {
  constructor(
    private readonly cfg: MstyleV2Config,
    private readonly siteSettings: SiteSettingsService,
  ) {}

  async intercept(
    ctx: ExecutionContext,
    next: { handle: () => Observable<unknown> },
  ): Promise<Observable<unknown>> {
    const setting = await this.siteSettings.getMstyleMockResponsesEnabled(
      this.cfg.mockResponsesDefaultEnabled(),
    );
    if (!setting.enabled) return next.handle();

    const req = ctx.switchToHttp().getRequest<Request>();
    const match = matchMstyleMockEndpoint(
      MSTYLE_V2_CATALOG,
      req.method,
      req.originalUrl || req.url,
    );
    if (!match || match.endpoint.id === 'A-01') return next.handle();

    const mock = createMstyleMockResponse({
      id: match.endpoint.id,
      params: match.params,
      body:
        req.body && typeof req.body === 'object'
          ? (req.body as Record<string, unknown>)
          : {},
    });
    return of(new MstyleResult(mock.body, mock.status, mock.headers));
  }
}
