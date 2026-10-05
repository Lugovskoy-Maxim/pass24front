import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

export class Bitrix24Error extends Error {
  constructor(
    readonly code: string,
    readonly uncertain = false,
  ) {
    super(code);
  }
}
export type CrmStage = {
  id: string;
  name: string;
  semantic: string;
  sort: number;
};
export type ServiceFunnel = {
  id: number;
  name: string;
  stages: CrmStage[];
  initialStage: string;
};
export type CrmComment = {
  ID: string;
  ENTITY_ID: string;
  ENTITY_TYPE: string;
  COMMENT: string;
  AUTHOR_ID: string;
  CREATED: string;
  FILES?: Record<string, any>;
};

@Injectable()
export class Bitrix24Client {
  private cached?: { value: ServiceFunnel; expires: number };
  private users = new Map<string, string>();
  constructor(private readonly config: ConfigService) {}
  enabled() {
    return (
      !!this.config.get<string>('BITRIX_API_KEY')?.trim() &&
      this.config.get<string>('BITRIX_ENABLED') !== 'false'
    );
  }
  webhook() {
    try {
      const url = new URL(
        this.config.get<string>('BITRIX_API_KEY')?.trim() || '',
      );
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !/^\/rest\/\d+\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
      )
        throw new Error();
      url.pathname = url.pathname.replace(/\/?$/, '/');
      return url;
    } catch {
      throw new Bitrix24Error('webhook_not_configured');
    }
  }
  configured() {
    try {
      this.webhook();
      return true;
    } catch {
      return false;
    }
  }
  originator() {
    const app = this.config.get<string>('PUBLIC_APP_URL') || 'pass';
    return (
      'pass-service-' +
      createHash('sha256').update(app).digest('hex').slice(0, 16)
    );
  }
  dealUrl(id: number) {
    return `${this.webhook().origin}/crm/deal/details/${id}/`;
  }
  async call<T = any>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<{ result: T; next?: number }> {
    const mutating = method.endsWith('.add');
    let response: Response;
    try {
      response = await fetch(new URL(method + '.json', this.webhook()), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      });
    } catch (error) {
      if (error instanceof Bitrix24Error) throw error;
      // Fetch errors contain the credential URL; never persist or log their text.
      throw new Bitrix24Error('connection_failed', mutating);
    }
    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new Bitrix24Error('invalid_response', mutating);
    }
    if (data.error)
      throw new Bitrix24Error(
        /^[A-Za-z0-9_.-]{1,80}$/.test(data.error) ? data.error : 'api_error',
      );
    if (!response.ok || !Object.hasOwn(data, 'result'))
      throw new Bitrix24Error(
        'http_' + response.status,
        mutating && response.status >= 500,
      );
    return data;
  }
  async list<T = any>(
    method: string,
    params: Record<string, unknown>,
    nested?: string,
  ): Promise<T[]> {
    const rows: T[] = [];
    const seen = new Set<number>();
    let start = 0;
    do {
      if (seen.has(start)) throw new Bitrix24Error('pagination_invalid');
      seen.add(start);
      const response = await this.call<any>(method, { ...params, start });
      const page = nested ? response.result?.[nested] : response.result;
      if (!Array.isArray(page)) throw new Bitrix24Error('invalid_response');
      rows.push(...page);
      if (response.next == null) return rows;
      start = Number(response.next);
      if (!Number.isInteger(start) || start < 0 || rows.length > 10000)
        throw new Bitrix24Error('pagination_invalid');
    } while (seen.size <= 200);
    throw new Bitrix24Error('pagination_invalid');
  }
  async funnel(refresh = false): Promise<ServiceFunnel> {
    if (!refresh && this.cached && this.cached.expires > Date.now())
      return this.cached.value;
    const categories = await this.list<any>(
      'crm.category.list',
      { entityTypeId: 2 },
      'categories',
    );
    const requested = this.config.get<string>('BITRIX_SERVICE_CATEGORY_ID');
    const candidates = categories.filter((category) =>
      requested != null && requested !== ''
        ? String(category.id) === requested
        : String(category.name).trim().toLocaleLowerCase('ru') === 'сервис',
    );
    if (candidates.length !== 1)
      throw new Bitrix24Error(
        candidates.length
          ? 'service_funnel_ambiguous'
          : 'service_funnel_not_found',
      );
    const category = candidates[0];
    const rows = await this.list<any>('crm.status.list', {
      filter: {
        ENTITY_ID: Number(category.id)
          ? `DEAL_STAGE_${category.id}`
          : 'DEAL_STAGE',
      },
      order: { SORT: 'ASC' },
    });
    const stages: CrmStage[] = rows
      .map((row) => ({
        id: String(row.STATUS_ID),
        name: String(row.NAME),
        semantic: String(row.EXTRA?.SEMANTICS || row.SEMANTICS || 'process'),
        sort: Number(row.SORT || 0),
      }))
      .sort((a, b) => a.sort - b.sort);
    const initial = stages.find(
      (stage) => !['success', 'failure', 'S', 'F'].includes(stage.semantic),
    );
    if (
      !initial ||
      !stages.some((stage) => ['success', 'S'].includes(stage.semantic))
    )
      throw new Bitrix24Error('service_stages_not_configured');
    const value = {
      id: Number(category.id),
      name: String(category.name),
      stages,
      initialStage: initial.id,
    };
    this.cached = { value, expires: Date.now() + 900000 };
    return value;
  }
  async comments(dealId: number) {
    return this.list<CrmComment>('crm.timeline.comment.list', {
      filter: { ENTITY_ID: dealId, ENTITY_TYPE: 'deal' },
      order: { ID: 'ASC' },
      select: [
        'ID',
        'ENTITY_ID',
        'ENTITY_TYPE',
        'COMMENT',
        'AUTHOR_ID',
        'CREATED',
        'FILES',
      ],
    });
  }
  async author(id: string) {
    if (this.users.has(id)) return this.users.get(id)!;
    try {
      const { result } = await this.call<any[]>('user.get', { ID: id });
      const name =
        result?.[0] &&
        [result[0].LAST_NAME, result[0].NAME, result[0].SECOND_NAME]
          .filter(Boolean)
          .join(' ');
      if (name) {
        this.users.set(id, name);
        return name as string;
      }
    } catch {
      /* The webhook may have only CRM scope. */
    }
    this.users.set(id, 'Служба сервиса');
    return 'Служба сервиса';
  }
}
