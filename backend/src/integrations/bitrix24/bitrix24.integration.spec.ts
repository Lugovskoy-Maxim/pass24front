import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createConnection, Connection } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { OperationsStore } from '../../operations/operations.store';
import { OperationsSupport } from '../../operations/operations.support';
import { OperationsIdentity } from '../../operations/operations.identity';
import { OperationsActor } from '../../operations/operations.rules';
import { SiteSettingsService } from '../../site-settings/site-settings.service';
import { AppSettingsSchema } from '../../schemas/app-settings.schema';
import { SiteSourceService } from '../../site-source/site-source.service';
import {
  dailyMysqlSlot,
  mysqlSourceFingerprint,
} from '../../site-source/site-source.schedule';
import {
  Bitrix24Client,
  Bitrix24Error,
  ServiceFunnel,
} from './bitrix24.client';
import { Bitrix24Service } from './bitrix24.service';

jest.setTimeout(900000);
const resident: OperationsActor = {
  kind: 'resident',
  ref: 'resident:usr_crm',
  subject: 'usr_crm',
  name: 'Арендатор',
};
const admin: OperationsActor = {
  kind: 'admin',
  ref: 'admin:crm',
  name: 'Оператор Pass',
  permissions: ['admin.panel', 'support.manage'],
};
const funnel: ServiceFunnel = {
  id: 7,
  name: 'Сервис',
  initialStage: 'C7:NEW',
  stages: [
    { id: 'C7:NEW', name: 'Новая', semantic: 'process', sort: 10 },
    { id: 'C7:WORK', name: 'В работе', semantic: 'process', sort: 20 },
    { id: 'C7:WON', name: 'Выполнено', semantic: 'success', sort: 30 },
    { id: 'C7:LOSE', name: 'Отменено', semantic: 'failure', sort: 40 },
  ],
};
describe('Daily MySQL and Bitrix24 with transactional Mongo storage', () => {
  let mongo: MongoMemoryReplSet,
    connection: Connection,
    store: OperationsStore,
    client: Bitrix24Client,
    worker: Bitrix24Service,
    support: OperationsSupport,
    settings: any;
  let deals: any[],
    comments: any[],
    failAfterDeal: boolean,
    failAfterComment: boolean;
  const supportSettings = {
    get: jest.fn(async () => ({ tenantServiceRequestsEnabled: true })),
  };
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({
      binary: { version: process.env.MONGOMS_VERSION || '7.0.24' },
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    connection = await createConnection(mongo.getUri()).asPromise();
    store = new OperationsStore(connection);
    await store.onModuleInit();
    settings = connection.model('DailyAppSettings', AppSettingsSchema);
  });
  afterAll(async () => {
    await connection?.close();
    await mongo?.stop();
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    supportSettings.get.mockResolvedValue({
      tenantServiceRequestsEnabled: true,
    });
    for (const collection of await connection.db!.collections())
      await collection.deleteMany({});
    await store
      .collection('settings')
      .insertOne({ key: 'ownership', mode: 'pass' });
    await store.collection('bitrix_state').insertOne({ _id: 'worker' });
    await store.canonical('identities').insertOne({
      subject: resident.subject,
      displayName: 'Арендатор',
      identityStatus: 'active',
    });
    await store
      .canonical('profiles')
      .insertOne({ profileId: 'prf_crm', status: 'active', memberPolicy: {} });
    await store.canonical('memberships').insertOne({
      profileId: 'prf_crm',
      subject: resident.subject,
      status: 'active',
      role: 'owner',
    });
    await settings.create({
      key: 'global',
      siteMysql: {
        enabled: true,
        autoSyncEnabled: true,
        autoSyncSchedule: 'daily',
        autoSyncTime: '03:00',
        autoApply: true,
      },
    });
    client = new Bitrix24Client(
      new ConfigService({
        BITRIX_API_KEY: 'https://portal.bitrix24.ru/rest/42/test-secret/',
        PUBLIC_APP_URL: 'https://pass.example.invalid',
      }),
    );
    jest.spyOn(client, 'funnel').mockResolvedValue(funnel);
    jest.spyOn(client, 'author').mockResolvedValue('Сотрудник сервиса');
    deals = [];
    comments = [];
    failAfterDeal = false;
    failAfterComment = false;
    jest
      .spyOn(client, 'list')
      .mockImplementation(async (method: string, params: any) => {
        if (method === 'crm.deal.list')
          return deals.filter(
            (deal) =>
              deal.ORIGINATOR_ID === params.filter.ORIGINATOR_ID &&
              deal.ORIGIN_ID === params.filter.ORIGIN_ID,
          );
        throw new Error('Unexpected list: ' + method);
      });
    jest
      .spyOn(client, 'comments')
      .mockImplementation(async (id) =>
        comments
          .filter((comment) => Number(comment.ENTITY_ID) === id)
          .map((comment) => ({ ...comment })),
      );
    jest
      .spyOn(client, 'call')
      .mockImplementation(async (method: string, params: any) => {
        if (method === 'crm.deal.add') {
          const deal = {
            ...params.fields,
            ID: String(77 + deals.length),
            STAGE_SEMANTIC_ID: 'P',
          };
          deals.push(deal);
          if (failAfterDeal) {
            failAfterDeal = false;
            throw new Bitrix24Error('connection_failed', true);
          }
          return { result: Number(deal.ID) } as any;
        }
        if (method === 'crm.deal.get')
          return {
            result: deals.find((deal) => Number(deal.ID) === Number(params.id)),
          } as any;
        if (method === 'crm.timeline.comment.add') {
          const comment = {
            ...params.fields,
            ID: String(100 + comments.length),
            ENTITY_ID: String(params.fields.ENTITY_ID),
            AUTHOR_ID: '42',
            CREATED: '2026-10-05T10:00:00+03:00',
          };
          comments.push(comment);
          if (failAfterComment) {
            failAfterComment = false;
            throw new Bitrix24Error('connection_failed', true);
          }
          return { result: Number(comment.ID) } as any;
        }
        throw new Error('Unexpected method: ' + method);
      });
    const identity = new OperationsIdentity(
      store,
      {} as any,
      {} as any,
      {
        piiSecret: () => 'test-only-secret-32-characters',
        environment: () => 'local',
      } as any,
    );
    support = new OperationsSupport(
      store,
      identity,
      supportSettings as unknown as SiteSettingsService,
      undefined,
      client,
    );
    worker = new Bitrix24Service(store, client);
  });
  const create = () =>
    support.create(
      resident,
      {
        topic_key: 'service',
        subject: 'Не работает вентиляция',
        message_text: 'Нужна помощь',
      },
      'crm-create-test',
    );
  const operatorComment = (text = 'Мастер уже идёт') => {
    const comment = {
      ID: String(200 + comments.length),
      ENTITY_ID: deals[0].ID,
      ENTITY_TYPE: 'deal',
      AUTHOR_ID: '10',
      CREATED: '2026-10-05T10:02:00+03:00',
      COMMENT: text,
      FILES: {},
    };
    comments.push(comment);
    return comment;
  };

  it('atomically queues a new request and exports one deal and one comment after replay', async () => {
    const result = await create();
    await create();
    expect(
      await store
        .collection('outbox')
        .countDocuments({ type: 'bitrix.message' }),
    ).toBe(1);
    await worker.tick();
    await worker.tick();
    expect(deals).toHaveLength(1);
    expect(comments).toHaveLength(1);
    expect(deals[0]).toMatchObject({
      CATEGORY_ID: 7,
      STAGE_ID: 'C7:NEW',
      ORIGIN_ID: String(result.ticket.id),
    });
    expect(comments[0].COMMENT).toContain('Арендатор');
    expect(comments[0].COMMENT).toContain('Нужна помощь');
    const detail = await support.detail(admin, result.ticket.id);
    expect(detail.ticket.status).toBe('in_progress');
    expect(detail.ticket.crm).toMatchObject({
      managed: true,
      dealId: 77,
      url: 'https://portal.bitrix24.ru/crm/deal/details/77/',
    });
    expect(detail.messages).toHaveLength(1);
    const own = await support.detail(resident, result.ticket.id);
    expect(own.ticket.crm).toBeNull();
    expect(JSON.stringify(own)).not.toContain('test-secret');
    expect(own.messages[0]).not.toHaveProperty('bitrix');
  });
  it('imports replies once, tracks edits/deletions and excludes internal notes without echo', async () => {
    const result = await create();
    await worker.tick();
    const external = operatorComment();
    operatorComment('[Внутреннее] Позвонить подрядчику');
    const ticket = await store
      .collection('tickets')
      .findOne({ id: result.ticket.id });
    await worker.syncTicket(ticket, funnel);
    await worker.syncTicket(ticket, funnel);
    let detail = await support.detail(resident, result.ticket.id);
    expect(detail.messages).toHaveLength(2);
    expect(detail.messages[1].author_label).toBe('Сотрудник сервиса');
    expect(detail.ticket.unread_for_customer).toBe(true);
    expect(
      await store
        .collection('outbox')
        .countDocuments({ type: 'bitrix.message' }),
    ).toBe(1);
    external.COMMENT = '[b]Мастер прибудет к 12:00[/b]';
    await worker.syncTicket(ticket, funnel);
    detail = await support.detail(resident, result.ticket.id);
    expect(detail.messages).toHaveLength(2);
    expect(detail.messages[1].message_text).toBe('Мастер прибудет к 12:00');
    expect(detail.ticket.last_message_preview).toBe('Мастер прибудет к 12:00');
    expect(detail.messages[1].edited_at).toBeTruthy();
    comments = comments.filter((comment) => comment.ID !== external.ID);
    await worker.syncTicket(ticket, funnel);
    detail = await support.detail(resident, result.ticket.id);
    expect(detail.messages[1].deleted).toBe(true);
    expect(detail.messages[1].message_text).toContain('удалён');
    expect(detail.ticket.last_message_preview).toContain('удалён');
  });
  it('keeps a delivery error visible when reading the CRM status succeeds', async () => {
    const result = await create();
    const original = jest.mocked(client.call).getMockImplementation()!;
    jest.spyOn(client, 'call').mockImplementation(async (method, params) => {
      if (method === 'crm.timeline.comment.add')
        throw new Bitrix24Error('insufficient_scope');
      return original(method, params);
    });
    await worker.tick();
    const detail = await support.detail(admin, result.ticket.id);
    expect(detail.ticket.status).toBe('in_progress');
    expect(detail.ticket.crm.error).toBeTruthy();
    expect(
      await store.collection('outbox').findOne({ type: 'bitrix.message' }),
    ).toMatchObject({
      state: 'pending',
      last_error_code: 'insufficient_scope',
    });
  });
  it('checks CRM metadata without creating deals or opening tenant requests', async () => {
    supportSettings.get.mockResolvedValue({
      tenantServiceRequestsEnabled: false,
    });
    expect(await worker.health(true)).toMatchObject({
      ready: true,
      funnel: { id: 7 },
    });
    expect(deals).toHaveLength(0);
    expect(comments).toHaveLength(0);
    expect(await store.collection('tickets').countDocuments()).toBe(0);
    expect((await supportSettings.get()).tenantServiceRequestsEnabled).toBe(
      false,
    );
  });
  it('takes completion, cancellation and reopening from CRM and prevents local overrides', async () => {
    const result = await create();
    await worker.tick();
    let ticket = await store
      .collection('tickets')
      .findOne({ id: result.ticket.id });
    await expect(
      support.status(
        admin,
        ticket!.id,
        { status: 'completed', revision: ticket!.revision },
        'local-status-refused',
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'crm_managed_status' } },
    });
    deals[0].STAGE_ID = 'C7:WON';
    deals[0].STAGE_SEMANTIC_ID = 'S';
    await worker.syncTicket(ticket, funnel);
    let detail = await support.detail(resident, ticket!.id);
    expect(detail.ticket.status).toBe('completed');
    expect(detail.can_reply).toBe(false);
    await expect(
      support.reply(
        resident,
        ticket!.id,
        { message_text: 'Ещё вопрос' },
        'closed-reply-test',
      ),
    ).rejects.toMatchObject({ response: { error: { code: 'ticket_closed' } } });
    deals[0].STAGE_ID = 'C7:WORK';
    deals[0].STAGE_SEMANTIC_ID = 'P';
    await worker.syncTicket(ticket, funnel);
    await support.reply(
      resident,
      ticket!.id,
      { message_text: 'Уточнение' },
      'reopened-reply-test',
    );
    await worker.tick();
    expect(comments).toHaveLength(2);
    expect(comments[1].COMMENT).toContain('Уточнение');
    ticket = await store.collection('tickets').findOne({ id: ticket!.id });
    deals[0].STAGE_ID = 'C7:LOSE';
    deals[0].STAGE_SEMANTIC_ID = 'F';
    await worker.syncTicket(ticket, funnel);
    detail = await support.detail(resident, ticket!.id);
    expect(detail.ticket.status).toBe('cancelled');
  });
  it.each(['deal', 'comment'])(
    'reconciles an uncertain %s delivery without creating a duplicate',
    async (kind) => {
      const result = await create();
      failAfterDeal = kind === 'deal';
      failAfterComment = kind === 'comment';
      await expect(worker.sendTicket(result.ticket.id, funnel)).rejects.toThrow(
        'connection_failed',
      );
      await worker.sendTicket(result.ticket.id, funnel);
      expect(deals).toHaveLength(1);
      expect(comments).toHaveLength(1);
      expect(
        await store
          .collection('messages')
          .countDocuments({ request_id: result.ticket.id }),
      ).toBe(1);
    },
  );
  it('keeps ambiguous delivery pending when CRM has no matching result, and preserves pause and tenant gates', async () => {
    const result = await create();
    await store
      .collection('tickets')
      .updateOne(
        { id: result.ticket.id },
        { $set: { 'bitrix.create_state': 'uncertain' } },
      );
    await expect(worker.sendTicket(result.ticket.id, funnel)).rejects.toThrow(
      'delivery_uncertain',
    );
    expect(deals).toHaveLength(0);
    await store
      .collection('settings')
      .updateOne({ key: 'ownership' }, { $set: { mode: 'paused' } });
    await worker.tick();
    expect(deals).toHaveLength(0);
    supportSettings.get.mockResolvedValue({
      tenantServiceRequestsEnabled: false,
    });
    await expect(
      support.create(
        resident,
        { topic_key: 'it', message_text: 'Тест' },
        'disabled-crm-create',
      ),
    ).rejects.toMatchObject({ response: { error: { code: 'forbidden' } } });
  });
  it('sends a private attachment to CRM and saves a downloaded CRM attachment behind ticket access checks', async () => {
    const file = await support.upload(
      resident,
      {
        name: 'question.txt',
        base64: Buffer.from('Вопрос').toString('base64'),
      },
      'crm-upload-file',
    );
    const result = await support.create(
      resident,
      {
        topic_key: 'it',
        message_text: 'Файл',
        attachment_ids: [file.attachment_id],
      },
      'crm-create-with-file',
    );
    await worker.tick();
    expect(comments[0].FILES).toEqual([
      ['question.txt', Buffer.from('Вопрос').toString('base64')],
    ]);
    // The API returns a FILES object on reads, not the add-method upload array.
    comments[0].FILES = {};
    const external: any = operatorComment('Ответ с файлом');
    external.FILES = {
      '25': {
        id: 25,
        name: 'answer.txt',
        size: 5,
        date: '2026-10-05',
        urlDownload: 'https://portal.bitrix24.ru/file/25',
      },
    };
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(Buffer.from('Ответ')));
    await worker.syncTicket(
      await store.collection('tickets').findOne({ id: result.ticket.id }),
      funnel,
    );
    const detail = await support.detail(resident, result.ticket.id);
    const attachment = detail.messages[1].attachments[0];
    expect(attachment.original_name).toBe('answer.txt');
    expect(
      (
        await support.download(resident, attachment.attachment_id)
      ).bytes.toString(),
    ).toBe('Ответ');
    await expect(
      support.download(
        { ...resident, subject: 'other-person' },
        attachment.attachment_id,
      ),
    ).rejects.toMatchObject({ response: { error: { code: 'not_found' } } });
  });

  function source(check?: () => Promise<any>) {
    const service: any = Object.create(SiteSourceService.prototype);
    service.settings = settings;
    service.logger = new Logger('DailyMySQLTest');
    if (check) service.checkSource = jest.fn(check);
    return service as SiteSourceService;
  }
  it('runs once at the Moscow daily slot across restart and competing workers', async () => {
    const check = jest.fn(async () => ({ changed: false }));
    const first = source(check),
      restarted = source(check);
    const day = new Date('2026-10-06T00:00:00Z');
    await Promise.all([
      first.runScheduledCheck(day),
      restarted.runScheduledCheck(day),
    ]);
    await restarted.runScheduledCheck(new Date('2026-10-06T10:00:00Z'));
    expect(check).toHaveBeenCalledTimes(1);
    await restarted.runScheduledCheck(new Date('2026-10-07T00:00:00Z'));
    expect(check).toHaveBeenCalledTimes(2);
    expect(
      (await settings.findOne({ key: 'global' })).siteMysql.autoSyncLastDate,
    ).toBe('2026-10-07');
  });
  it('catches up after downtime and retries a failed daily check after an hour', async () => {
    const check = jest
      .fn()
      .mockRejectedValueOnce(new Error('Private database detail'))
      .mockResolvedValue({ changed: true });
    const service = source(check);
    await service.runScheduledCheck(new Date('2026-10-06T04:00:00Z'));
    let doc = await settings.findOne({ key: 'global' });
    expect(doc.siteMysql.autoSyncLastDate).toBeUndefined();
    expect(doc.siteMysql.lastSyncError).not.toContain('Private');
    await service.runScheduledCheck(new Date('2026-10-06T04:30:00Z'));
    expect(check).toHaveBeenCalledTimes(1);
    await service.runScheduledCheck(new Date('2026-10-06T05:01:00Z'));
    expect(check).toHaveBeenCalledTimes(2);
    doc = await settings.findOne({ key: 'global' });
    expect(doc.siteMysql.autoSyncLastDate).toBe('2026-10-06');
    expect(doc.siteMysql.lastSyncError).toBe('');
  });
  it('detects metadata-only changes and retries applying pending changes on the same fingerprint', async () => {
    const service: any = source();
    const conn = { end: jest.fn(), query: jest.fn() };
    let items = [{ externalId: 'tf_room:641', floor: '2', areaSqm: 18 }];
    service.connect = jest.fn(async () => conn);
    service.listTables = jest.fn(async () => []);
    service.resolvePrefix = jest.fn(async () => 'wp_');
    service.currentMapping = jest.fn(async () => ({
      serviceRequestsTable: 'requests',
      serviceRequestMessagesTable: 'messages',
      servicesTable: 'services',
    }));
    service.resolveOfficeSource = jest.fn(async () => ({ items }));
    service.syncLinked = jest.fn(async () => {
      await settings.updateOne(
        { key: 'global' },
        { $set: { 'siteMysql.pendingChanges': false } },
      );
      return { updated: 1, skipped: 0, total: 1 };
    });
    service.syncLinked.mockRejectedValueOnce(
      new Error('First apply interrupted'),
    );
    await expect(service.checkSource()).rejects.toThrow(
      'First apply interrupted',
    );
    expect(
      (await settings.findOne({ key: 'global' })).siteMysql.pendingChanges,
    ).toBe(true);
    await service.checkSource();
    expect(service.syncLinked).toHaveBeenCalledTimes(2);
    items = [{ externalId: 'tf_room:641', floor: '3', areaSqm: 18 }];
    service.syncLinked.mockRejectedValueOnce(new Error('Apply interrupted'));
    await expect(service.checkSource()).rejects.toThrow('Apply interrupted');
    expect(
      (await settings.findOne({ key: 'global' })).siteMysql.pendingChanges,
    ).toBe(true);
    const retry = await service.checkSource();
    expect(retry.changed).toBe(false);
    expect(retry.autoApplied).toBe(true);
    expect(retry.pendingChanges).toBe(false);
    expect(service.syncLinked).toHaveBeenCalledTimes(4);
    expect(conn.end).toHaveBeenCalledTimes(4);
    const unchanged = await service.checkSource();
    expect(unchanged.autoApplied).toBe(false);
  });
  it('calculates Moscow boundaries and detects late rows, nested edits and deletions regardless of row order', () => {
    expect(dailyMysqlSlot(new Date('2026-10-05T23:59:00Z')).key).toBe(
      '2026-10-05',
    );
    expect(dailyMysqlSlot(new Date('2026-10-06T00:00:00Z')).key).toBe(
      '2026-10-06',
    );
    expect(
      dailyMysqlSlot(new Date('2026-10-06T00:00:00Z')).next.toISOString(),
    ).toBe('2026-10-07T00:00:00.000Z');
    const rows = Array.from({ length: 601 }, (_, id) => ({
      id,
      floor: 2,
      detail: { active: true },
    }));
    const before = mysqlSourceFingerprint({ offices: rows });
    expect(mysqlSourceFingerprint({ offices: [...rows].reverse() })).toBe(
      before,
    );
    rows[600].detail.active = false;
    expect(mysqlSourceFingerprint({ offices: rows })).not.toBe(before);
    expect(mysqlSourceFingerprint({ offices: rows.slice(0, 600) })).not.toBe(
      before,
    );
  });
});
