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
export type CrmAuthor = { name: string; position: string };

@Injectable()
export class Bitrix24Client {
  private cached?: { value: ServiceFunnel; expires: number };
  private users = new Map<string, { value: CrmAuthor; expires: number }>();
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
  async staff(id?: number) {
    const users = await this.list<any>('user.get', {
      FILTER: {
        ACTIVE: true,
        USER_TYPE: 'employee',
        ...(id ? { ID: id } : {}),
      },
      select: [
        'ID',
        'NAME',
        'LAST_NAME',
        'SECOND_NAME',
        'ACTIVE',
        'WORK_POSITION',
      ],
    });
    return users
      .filter((user) => user.ACTIVE === true || user.ACTIVE === 'Y')
      .map((user) => ({
        id: Number(user.ID),
        name:
          [user.LAST_NAME, user.NAME, user.SECOND_NAME]
            .filter(Boolean)
            .join(' ') || `Сотрудник №${user.ID}`,
        position: user.WORK_POSITION || '',
      }));
  }
  async capabilities() {
    const { result } = await this.call<string[]>('scope');
    if (!Array.isArray(result)) throw new Bitrix24Error('invalid_response');
    return {
      staff: ['user', 'user_brief', 'user_basic'].some((scope) =>
        result.includes(scope),
      ),
      notifications: result.includes('im'),
      files: result.includes('disk'),
    };
  }
  async downloadFile(id: number): Promise<Buffer> {
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new Bitrix24Error('file_invalid');
    let file: any;
    try {
      ({ result: file } = await this.call('disk.file.get', { id }));
    } catch (error) {
      if (error instanceof Bitrix24Error && error.code === 'insufficient_scope')
        throw new Bitrix24Error('file_scope_required');
      if (
        error instanceof Bitrix24Error &&
        ['ACCESS_DENIED', 'access_denied', 'ERROR_ACCESS_DENIED'].includes(
          error.code,
        )
      )
        throw new Bitrix24Error('file_access_denied');
      throw error;
    }
    if (Number(file?.ID) !== id || typeof file?.DOWNLOAD_URL !== 'string')
      throw new Bitrix24Error('file_invalid');
    if (Number(file.SIZE) > 10485760) throw new Bitrix24Error('file_too_large');
    const portal = this.webhook().origin;
    try {
      let url = new URL(file.DOWNLOAD_URL, portal);
      if (url.origin !== portal) throw new Bitrix24Error('file_url_invalid');
      const signal = AbortSignal.timeout(20000);
      for (let hop = 0; hop < 5; hop++) {
        if (
          url.protocol !== 'https:' ||
          url.username ||
          url.password ||
          (url.origin !== portal &&
            !/\.(?:bitrix24\.(?:ru|com|net)|bitrix\.info|cloudfront\.net)$/i.test(
              url.hostname,
            ))
        )
          throw new Bitrix24Error('file_url_invalid');
        const response = await fetch(url, {
          redirect: 'manual',
          signal,
          headers: {
            'User-Agent': 'Pass-MStyle/1.0',
            Accept: '*/*',
            'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
            Referer: portal + '/',
          },
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          await response.body?.cancel();
          const location = response.headers.get('location');
          if (!location) throw new Bitrix24Error('file_download_failed');
          url = new URL(location, url);
          continue;
        }
        const contentType = response.headers.get('content-type') || '';
        if (
          !response.ok ||
          !response.body ||
          /(?:text\/html|application\/json)/i.test(contentType)
        ) {
          await response.body?.cancel();
          throw new Bitrix24Error('file_download_failed');
        }
        if (Number(response.headers.get('content-length')) > 10485760) {
          await response.body.cancel();
          throw new Bitrix24Error('file_too_large');
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > 10485760) throw new Bitrix24Error('file_too_large');
          chunks.push(Buffer.from(chunk));
        }
        if (!size) throw new Bitrix24Error('file_download_failed');
        return Buffer.concat(chunks);
      }
      throw new Bitrix24Error('file_download_failed');
    } catch (error) {
      // Download links contain a REST token: never propagate fetch errors or URLs.
      if (error instanceof Bitrix24Error) throw error;
      throw new Bitrix24Error('file_download_failed');
    }
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
    return (await this.authorProfile(id)).name;
  }
  async authorProfile(id: string): Promise<CrmAuthor> {
    const cached = this.users.get(id);
    if (cached && cached.expires > Date.now()) return cached.value;
    let value: CrmAuthor = { name: 'Служба сервиса', position: '' };
    try {
      const { result } = await this.call<any[]>('user.get', {
        FILTER: { ID: id },
        select: ['ID', 'NAME', 'LAST_NAME', 'SECOND_NAME', 'WORK_POSITION'],
      });
      const user = Array.isArray(result)
        ? result.find((row) => String(row.ID) === id)
        : undefined;
      if (user) {
        value = {
          name:
            [user.LAST_NAME, user.NAME, user.SECOND_NAME]
              .filter(Boolean)
              .join(' ')
              .trim() || value.name,
          position:
            typeof user.WORK_POSITION === 'string'
              ? user.WORK_POSITION.replace(/\s+/g, ' ').trim()
              : '',
        };
      }
    } catch {
      /* The webhook may have only CRM scope. */
    }
    // Refresh positions and recover from restricted access without polling per message.
    this.users.set(id, { value, expires: Date.now() + 300000 });
    return value;
  }
}
