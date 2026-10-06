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
import {
  BITRIX_CUSTOMER_VERSION,
  Bitrix24Customers,
} from './bitrix24.customers';
import { ObjectId } from 'mongodb';

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
    contacts: any[],
    companies: any[],
    bindings: { deal: number; CONTACT_ID: number; IS_PRIMARY: string }[],
    notifications: any[],
    notificationFailure: string,
    failAfterCustomer: string,
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
    jest.spyOn(client, 'authorProfile').mockResolvedValue({
      name: 'Сотрудник сервиса',
      position: 'Инженер сервиса',
    });
    deals = [];
    comments = [];
    contacts = [];
    companies = [];
    bindings = [];
    notifications = [];
    notificationFailure = '';
    failAfterCustomer = '';
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
        if (['crm.contact.list', 'crm.company.list'].includes(method)) {
          const rows = method === 'crm.contact.list' ? contacts : companies;
          return rows.filter((row) =>
            Object.entries(params.filter).every(
              ([field, value]) =>
                String(row[field.replace(/^=/, '')]) === String(value),
            ),
          );
        }
        if (method === 'user.get')
          return [
            { ID: '10', NAME: 'Мастер', ACTIVE: true },
            { ID: '20', NAME: 'Инженер', ACTIVE: true },
            { ID: '30', NAME: 'Уволенный', ACTIVE: false },
          ].filter(
            (user) =>
              !params.FILTER?.ID || Number(user.ID) === params.FILTER.ID,
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
        if (method === 'crm.deal.update') {
          Object.assign(
            deals.find((deal) => Number(deal.ID) === Number(params.id)),
            params.fields,
          );
          return { result: true } as any;
        }
        if (method === 'crm.duplicate.findbycomm') {
          return {
            result: {
              CONTACT: contacts
                .filter((contact) =>
                  (contact[params.type] || []).some((item: any) =>
                    params.values.includes(item.VALUE),
                  ),
                )
                .map((contact) => Number(contact.ID)),
            },
          } as any;
        }
        if (['crm.contact.add', 'crm.company.add'].includes(method)) {
          const rows = method === 'crm.contact.add' ? contacts : companies;
          const row = { ...params.fields, ID: String(2000 + rows.length) };
          rows.push(row);
          if (failAfterCustomer === method) {
            failAfterCustomer = '';
            throw new Bitrix24Error('connection_failed', true);
          }
          return { result: Number(row.ID) } as any;
        }
        if (method === 'crm.deal.contact.items.get') {
          return {
            result: bindings.filter(
              (binding) => binding.deal === Number(params.id),
            ),
          } as any;
        }
        if (method === 'crm.deal.contact.add') {
          if (
            !bindings.some(
              (binding) =>
                binding.deal === Number(params.id) &&
                binding.CONTACT_ID === params.fields.CONTACT_ID,
            )
          )
            bindings.push({ deal: Number(params.id), ...params.fields });
          return { result: true } as any;
        }
        if (method === 'crm.company.get')
          return {
            result: companies.find(
              (company) => Number(company.ID) === Number(params.id),
            ),
          } as any;
        if (method === 'im.notify.system.add') {
          if (notificationFailure) throw new Bitrix24Error(notificationFailure);
          notifications = notifications.filter(
            (notification) => notification.TAG !== params.TAG,
          );
          notifications.push(params);
          return { result: 9000 + notifications.length } as any;
        }
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
  const create = (key = 'crm-create-test') =>
    support.create(
      resident,
      {
        topic_key: 'service',
        subject: 'Не работает вентиляция',
        message_text: 'Нужна помощь',
      },
      key,
    );
  const operatorComment = (text = '(ответ) Мастер уже идёт') => {
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

  const customerTicket = async (
    officeCompany: string | null = 'ООО Ромашка',
  ) => {
    await store.canonical('identities').updateOne(
      { subject: resident.subject },
      {
        $set: {
          displayName: 'Иванов Иван Иванович',
          name: {
            firstName: 'Иван',
            lastName: 'Иванов',
            middleName: 'Иванович',
          },
          phone: '+79001234567',
          email: 'tenant@example.invalid',
        },
      },
    );
    await store.canonical('profiles').updateOne(
      { profileId: 'prf_crm' },
      {
        $set: {
          companyName: 'ООО Компания профиля',
          companyShortName: 'Компания профиля',
        },
      },
    );
    const officeId = new ObjectId();
    const propertyId = new ObjectId();
    await connection.db!.collection('properties').insertOne({
      _id: propertyId,
      name: 'БЦ Добрынинский-2',
    });
    await connection.db!.collection('offices').insertOne({
      _id: officeId,
      property: propertyId,
      areaSqm: 18,
      number: '102',
      externalId: 'tf-room:102',
      company: officeCompany,
    });
    const result = await create();
    await store.collection('tickets').updateOne(
      { id: result.ticket.id },
      {
        $set: {
          office_id: String(officeId),
          office_ids: ['tf-room:102'],
          profile_id: 'prf_crm',
        },
      },
    );
    return result.ticket.id;
  };

  it('puts only the selected office and subject in the title and links a customer with phone/email', async () => {
    const id = await customerTicket();
    await connection.db!.collection('offices').insertOne({
      number: '999',
      externalId: 'tf-room:999',
      company: 'Другая компания',
    });
    await store
      .collection('tickets')
      .updateOne({ id }, { $addToSet: { office_ids: 'tf-room:999' } });
    await worker.tick();
    expect(deals[0].TITLE).toBe('Д-2/102-18 м², Не работает вентиляция');
    expect(deals[0].COMMENTS).toContain('Заявитель: Иванов Иван Иванович');
    expect(deals[0].COMMENTS).toContain('Телефон: +79001234567');
    expect(deals[0].COMMENTS).toContain('Email: tenant@example.invalid');
    expect(deals[0].TITLE).not.toContain('999');
    expect(companies).toHaveLength(1);
    expect(companies[0].TITLE).toBe('ООО Ромашка');
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({
      NAME: 'Иван',
      LAST_NAME: 'Иванов',
      SECOND_NAME: 'Иванович',
      PHONE: [{ VALUE: '+79001234567' }],
      EMAIL: [{ VALUE: 'tenant@example.invalid' }],
    });
    expect(deals[0].COMPANY_ID).toBe(Number(companies[0].ID));
    expect(bindings).toMatchObject([
      {
        deal: Number(deals[0].ID),
        CONTACT_ID: Number(contacts[0].ID),
        IS_PRIMARY: 'Y',
      },
    ]);
    await worker.sendTicket(id, funnel);
    expect(contacts).toHaveLength(1);
    expect(companies).toHaveLength(1);
    expect(bindings).toHaveLength(1);
    expect((await support.detail(admin, id)).ticket.crm.error).toBe('');
  });

  it('falls back to the profile company and reuses existing CRM clients instead of copying their data', async () => {
    const id = await customerTicket(null);
    companies.push({
      ID: '55',
      TITLE: 'ООО Компания профиля',
      COMMENTS: 'Заметка оператора',
    });
    contacts.push({
      ID: '66',
      NAME: 'Имя в CRM',
      PHONE: [{ VALUE: '+79001234567' }],
      EMAIL: [{ VALUE: 'tenant@example.invalid' }],
      COMPANY_ID: 9,
    });
    await worker.tick();
    expect(deals[0].TITLE).toBe('Д-2/102-18 м², Не работает вентиляция');
    expect(deals[0].COMMENTS).toContain('Компания: ООО Компания профиля');
    expect(deals[0].COMPANY_ID).toBe(55);
    expect(bindings[0].CONTACT_ID).toBe(66);
    expect(companies).toHaveLength(1);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].NAME).toBe('Имя в CRM');
    expect(contacts[0].COMPANY_ID).toBe(9);
    expect(
      (await store.collection('tickets').findOne({ id }))!.bitrix
        .customer_version,
    ).toBe(BITRIX_CUSTOMER_VERSION);
  });

  it('renames previously enriched CRM cards to the current office reference without duplicating clients', async () => {
    const id = await customerTicket();
    await worker.tick();
    deals[0].TITLE = 'Офис 102 · Не работает вентиляция';
    await store.collection('tickets').updateOne(
      { id },
      {
        $set: { 'bitrix.customer_version': 1 },
      },
    );
    const ticket = await store.collection('tickets').findOne({ id });
    await connection.db!.collection('offices').updateOne(
      { externalId: 'tf-room:102' },
      {
        $set: { number: '6', areaSqm: 18 },
      },
    );
    await worker.syncTicket(ticket, funnel);
    expect(deals[0].TITLE).toBe('Д-2/6-18 м², Не работает вентиляция');
    expect(contacts).toHaveLength(1);
    expect(companies).toHaveLength(1);
    expect(bindings).toHaveLength(1);
    expect(notifications).toHaveLength(0);
    const updates = jest
      .mocked(client.call)
      .mock.calls.filter(([method]) => method === 'crm.deal.update').length;
    await worker.syncTicket(
      await store.collection('tickets').findOne({ id }),
      funnel,
    );
    expect(
      jest
        .mocked(client.call)
        .mock.calls.filter(([method]) => method === 'crm.deal.update'),
    ).toHaveLength(updates);
  });

  it('enriches an existing deal once while retaining CRM notes and manually assigned clients', async () => {
    const id = await customerTicket();
    await worker.tick();
    const deal = deals[0];
    deal.TITLE = `Pass №${id} · Не работает вентиляция`;
    deal.COMMENTS = 'Заметка сотрудника CRM';
    deal.COMPANY_ID = 555;
    bindings.unshift({
      deal: Number(deal.ID),
      CONTACT_ID: 777,
      IS_PRIMARY: 'Y',
    });
    await store
      .collection('tickets')
      .updateOne({ id }, { $unset: { 'bitrix.customer_version': '' } });
    let ticket = await store.collection('tickets').findOne({ id });
    await worker.syncTicket(ticket, funnel);
    expect(deal.TITLE).toBe('Д-2/102-18 м², Не работает вентиляция');
    expect(deal.COMMENTS).toContain('Заметка сотрудника CRM');
    expect(deal.COMMENTS).toContain('Телефон: +79001234567');
    expect(deal.COMPANY_ID).toBe(555);
    expect(bindings.find((item) => item.CONTACT_ID === 777)!.IS_PRIMARY).toBe(
      'Y',
    );
    const notes = deal.COMMENTS;
    ticket = await store.collection('tickets').findOne({ id });
    await worker.syncTicket(ticket, funnel);
    expect(deal.COMMENTS).toBe(notes);
    expect(contacts).toHaveLength(1);
  });

  it.each(['crm.company.add', 'crm.contact.add'])(
    'reconciles an uncertain %s without duplicate clients',
    async (method) => {
      const id = await customerTicket();
      failAfterCustomer = method;
      await worker.sendTicket(id, funnel);
      let ticket = await store.collection('tickets').findOne({ id });
      expect(ticket!.bitrix.customer_error_code).toBe('connection_failed');
      expect(ticket!.status).toBe('in_progress');
      await worker.syncTicket(ticket, funnel);
      ticket = await store.collection('tickets').findOne({ id });
      expect(ticket!.bitrix.customer_version).toBe(BITRIX_CUSTOMER_VERSION);
      expect(ticket!.bitrix.customer_error_code).toBe('');
      expect(companies).toHaveLength(1);
      expect(contacts).toHaveLength(1);
      expect(bindings).toHaveLength(1);
    },
  );

  it('keeps chat/status synchronization working when customer matching is ambiguous', async () => {
    const id = await customerTicket();
    contacts.push(
      ...['66', '67'].map((ID) => ({
        ID,
        PHONE: [{ VALUE: '+79001234567' }],
        EMAIL: [{ VALUE: 'tenant@example.invalid' }],
      })),
    );
    await worker.tick();
    expect(bindings).toHaveLength(0);
    expect(contacts).toHaveLength(2);
    expect((await support.detail(admin, id)).ticket.crm.error).toContain(
      'несколько совпадений',
    );
    operatorComment();
    deals[0].STAGE_ID = 'C7:WON';
    deals[0].STAGE_SEMANTIC_ID = 'S';
    await worker.syncTicket(
      await store.collection('tickets').findOne({ id }),
      funnel,
    );
    const detail = await support.detail(resident, id);
    expect(detail.ticket.status).toBe('completed');
    expect(detail.messages[1].message_text).toBe('Мастер уже идёт');
  });

  it('handles missing client/office data, caps titles and does not use names to match contacts', async () => {
    const result = await create();
    await store
      .collection('tickets')
      .updateOne(
        { id: result.ticket.id },
        { $set: { subject: 'Т'.repeat(600) } },
      );
    const data = await new Bitrix24Customers(store, client).describe(
      await store.collection('tickets').findOne({ id: result.ticket.id }),
    );
    expect(data.title).toHaveLength(255);
    expect(data.title).toBe('Т'.repeat(255));
    expect(data.description).not.toMatch(/undefined|null/);
    contacts.push({ ID: '66', NAME: 'Арендатор' });
    await worker.tick();
    expect(contacts).toHaveLength(2);
    expect(companies).toHaveLength(0);
    expect(bindings[0].CONTACT_ID).not.toBe(66);
  });

  it('links a tenant to an explicitly chosen existing CRM company and refreshes their existing tickets', async () => {
    const id = await customerTicket();
    await worker.tick();
    companies.push({ ID: '555', TITLE: 'Существующая компания CRM' });
    const result = await worker.linkTenantCompany('prf_crm', {
      companyId: 555,
    });
    expect(result.company).toEqual({
      id: 555,
      name: 'Существующая компания CRM',
    });
    const ticket = await store.collection('tickets').findOne({ id });
    expect(ticket!.bitrix.customer_version).toBeUndefined();
    await worker.syncTicket(ticket, funnel);
    expect(deals[0].COMPANY_ID).toBe(555);
    expect(deals[0].COMMENTS).toContain('Компания: Существующая компания CRM');
    expect(deals[0].TITLE).toBe('Д-2/102-18 м², Не работает вентиляция');
    expect(companies).toHaveLength(2);
    expect(contacts).toHaveLength(1);
    expect(await worker.tenantCompany('prf_crm')).toEqual(result);
    await expect(
      worker.linkTenantCompany('prf_crm', { companyId: 123456 }),
    ).rejects.toMatchObject({
      response: { error: { code: 'validation_error' } },
    });
    expect(await worker.tenantCompany('prf_crm')).toEqual(result);
    await worker.linkTenantCompany('prf_crm', { companyId: null });
    expect((await worker.tenantCompany('prf_crm')).company).toBeNull();
  });

  it('assigns the configured default only to new tickets, notifies once and permits a Pass administrator to replace it', async () => {
    const legacy = await create('legacy-before-default');
    expect(notifications).toHaveLength(0);
    expect(await worker.saveAssignmentSettings({ userId: 10 })).toEqual({
      userId: 10,
      name: 'Мастер',
    });
    await worker.tick();
    expect(notifications).toHaveLength(0);
    const created = await create('new-with-default');
    await worker.tick();
    const deal = deals.find(
      (deal) => deal.ORIGIN_ID === String(created.ticket.id),
    );
    expect(deal.ASSIGNED_BY_ID).toBe(10);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      USER_ID: 10,
      CLIENT_ID: client.originator(),
    });
    expect(notifications[0].MESSAGE).toContain(client.dealUrl(Number(deal.ID)));
    await worker.sendTicket(created.ticket.id, funnel);
    expect(notifications).toHaveLength(1);
    let ticket = await store
      .collection('tickets')
      .findOne({ id: created.ticket.id });
    expect(ticket!.bitrix.assignment_notified_revision).toBe(1);
    await support.assign(
      admin,
      ticket!.id,
      { user_id: 20, revision: ticket!.revision },
      'replace-assignee',
    );
    await worker.syncTicket(
      await store.collection('tickets').findOne({ id: ticket!.id }),
      funnel,
    );
    expect(deal.ASSIGNED_BY_ID).toBe(20);
    expect(notifications).toHaveLength(2);
    expect(notifications[1].USER_ID).toBe(20);
    await worker.saveAssignmentSettings({ userId: 20 });
    await worker.syncTicket(
      await store.collection('tickets').findOne({ id: legacy.ticket.id }),
      funnel,
    );
    expect(
      deals.find((deal) => deal.ORIGIN_ID === String(legacy.ticket.id))
        .ASSIGNED_BY_ID,
    ).toBeUndefined();
    expect(notifications).toHaveLength(2);
    ticket = await store
      .collection('tickets')
      .findOne({ id: created.ticket.id });
    await expect(
      support.assign(
        resident,
        ticket!.id,
        { user_id: 10, revision: ticket!.revision },
        'tenant-cannot-assign',
      ),
    ).rejects.toBeDefined();
    await expect(
      support.assign(
        admin,
        ticket!.id,
        { user_id: 30, revision: ticket!.revision },
        'inactive-staff',
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'validation_error' } },
    });
    await expect(
      support.assign(
        admin,
        ticket!.id,
        { user_id: 10, revision: 1 },
        'stale-assignment',
      ),
    ).rejects.toBeDefined();
    expect(deal.ASSIGNED_BY_ID).toBe(20);
  });

  it('retains assignments and CRM status when notification access is missing, and retries after recovery', async () => {
    await worker.saveAssignmentSettings({ userId: 10 });
    const created = await create();
    notificationFailure = 'insufficient_scope';
    await worker.tick();
    let ticket = await store
      .collection('tickets')
      .findOne({ id: created.ticket.id });
    expect(ticket!.status).toBe('in_progress');
    expect(ticket!.bitrix.assignment_synced_revision).toBe(1);
    expect(ticket!.bitrix.assignment_notified_revision).toBeUndefined();
    expect(
      (await support.detail(admin, ticket!.id)).ticket.crm.assignmentError,
    ).toContain('Чат и уведомления');
    notificationFailure = '';
    await worker.syncTicket(ticket, funnel);
    ticket = await store
      .collection('tickets')
      .findOne({ id: created.ticket.id });
    expect(ticket!.bitrix.assignment_error_code).toBe('');
    expect(notifications).toHaveLength(1);
    await store
      .collection('settings')
      .updateOne({ key: 'ownership' }, { $set: { mode: 'paused' } });
    await expect(worker.saveAssignmentSettings({ userId: 20 })).rejects.toThrow(
      'operations_paused',
    );
    expect((await worker.assignmentSettings()).userId).toBe(10);
  });
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
    expect(detail.messages[1].author_label).toBe('Инженер сервиса');
    expect(detail.messages[1].author).toBe('Инженер сервиса');
    expect(JSON.stringify(detail.messages[1])).not.toContain(
      'Сотрудник сервиса',
    );
    expect(
      (await support.detail(admin, result.ticket.id)).messages[1],
    ).toMatchObject({
      author_label: 'Сотрудник сервиса',
      author: 'Сотрудник сервиса',
    });
    expect(detail.ticket.unread_for_customer).toBe(true);
    expect(
      await store
        .collection('outbox')
        .countDocuments({ type: 'bitrix.message' }),
    ).toBe(1);
    external.COMMENT = '[b](ответ) Мастер прибудет к 12:00[/b]';
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
  it('backfills and refreshes positions on unchanged CRM replies without marking them edited or unread', async () => {
    const created = await create();
    await worker.tick();
    operatorComment();
    const ticket = await store
      .collection('tickets')
      .findOne({ id: created.ticket.id });
    await worker.syncTicket(ticket, funnel);
    const imported = await store.collection('messages').findOne({
      request_id: ticket!.id,
      'bitrix.direction': 'in',
    });
    await support.read(resident, ticket!.id, {}, 'read-crm-reply');
    await store
      .collection('messages')
      .updateOne({ id: imported!.id }, { $unset: { author_position: '' } });
    // An old record must never expose its stored personal name before backfill.
    expect(
      (await support.detail(resident, ticket!.id)).messages[1],
    ).toMatchObject({
      author_label: 'Служба сервиса',
      author: 'Служба сервиса',
    });
    const before = await support.detail(resident, ticket!.id);
    await worker.syncTicket(ticket, funnel);
    let detail = await support.detail(resident, ticket!.id);
    expect(detail.messages).toHaveLength(2);
    expect(detail.messages[1]).toMatchObject({
      author_label: 'Инженер сервиса',
      author: 'Инженер сервиса',
      message_text: imported!.message_text,
      created_at: imported!.created_at,
    });
    expect(detail.messages[1]).not.toHaveProperty('edited_at');
    expect(detail.ticket.unread_for_customer).toBe(false);
    expect(detail.ticket.message_seq).toBe(before.ticket.message_seq);
    expect(detail.ticket.revision).toBe(before.ticket.revision);
    jest.mocked(client.authorProfile).mockResolvedValue({
      name: 'Сотрудник сервиса',
      position: 'Руководитель сервиса',
    });
    await worker.syncTicket(ticket, funnel);
    detail = await support.detail(resident, ticket!.id);
    expect(detail.messages[1].author_label).toBe('Руководитель сервиса');
    expect(detail.messages[1]).not.toHaveProperty('edited_at');
    expect(detail.ticket.unread_for_customer).toBe(false);
    expect(detail.ticket.revision).toBe(before.ticket.revision);
  });
  it('falls back to the service label for CRM replies without a position and preserves native Pass authors', async () => {
    jest.mocked(client.authorProfile).mockResolvedValue({
      name: 'Сотрудник сервиса',
      position: '',
    });
    const created = await create();
    await worker.tick();
    operatorComment();
    await worker.syncTicket(
      await store.collection('tickets').findOne({ id: created.ticket.id }),
      funnel,
    );
    const detail = await support.detail(resident, created.ticket.id);
    expect(detail.messages[1]).toMatchObject({
      author_label: 'Служба сервиса',
      author: 'Служба сервиса',
      message_text: 'Мастер уже идёт',
    });
    expect(JSON.stringify(detail.messages[1])).not.toContain(
      'Сотрудник сервиса',
    );
    expect(
      (await support.detail(admin, created.ticket.id)).messages[1].author_label,
    ).toBe('Сотрудник сервиса');
    await support.reply(
      admin,
      created.ticket.id,
      {
        message_text: 'Ответ администратора Pass',
      },
      'native-pass-reply',
    );
    expect(
      (await support.detail(resident, created.ticket.id)).messages[2],
    ).toMatchObject({
      author_label: admin.name,
      author: admin.name,
    });
  });
  it('imports only explicitly marked replies, never downloads unmarked files and permits adding/removing the marker', async () => {
    const created = await create();
    await worker.tick();
    const note = operatorComment('Внутренняя заметка без метки');
    note.FILES = {
      '55': {
        id: 55,
        name: 'internal.txt',
        urlDownload: 'https://portal.bitrix24.ru/file/55',
      },
    };
    operatorComment('Метка (ответ) внутри заметки');
    operatorComment('(ответить) внутренняя заметка');
    operatorComment('(ответ)');
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('private'));
    const row = await store
      .collection('tickets')
      .findOne({ id: created.ticket.id });
    await worker.syncTicket(row, funnel);
    expect(fetch).not.toHaveBeenCalled();
    expect((await support.detail(resident, row!.id)).messages).toHaveLength(1);
    expect(
      (await support.detail(resident, row!.id)).ticket.unread_for_customer,
    ).toBe(false);
    note.FILES = {};
    note.COMMENT = '<p>(ответ) Мастер прибудет</p>';
    await worker.syncTicket(row, funnel);
    let detail = await support.detail(resident, row!.id);
    expect(detail.messages).toHaveLength(2);
    expect(detail.messages[1].message_text).toBe('Мастер прибудет');
    note.COMMENT = 'Только для сотрудников';
    await worker.syncTicket(row, funnel);
    detail = await support.detail(resident, row!.id);
    expect(detail.messages[1].deleted).toBe(true);
    expect(detail.messages[1].message_text).toBe('Комментарий скрыт в CRM');
    expect(detail.ticket.last_message_preview).toBe('Комментарий скрыт в CRM');
    note.COMMENT = '(ОТВЕТ) Снова опубликован';
    await worker.syncTicket(row, funnel);
    detail = await support.detail(resident, row!.id);
    expect(detail.messages).toHaveLength(2);
    expect(detail.messages[1].deleted).toBe(false);
    expect(detail.messages[1].message_text).toBe('Снова опубликован');
  });
  it('hides an unmarked comment previously imported under the old publication rule', async () => {
    const created = await create();
    await worker.tick();
    const note = operatorComment(
      'Ранее опубликованная заметка для сотрудников',
    );
    const original = await store
      .collection('messages')
      .findOne({ request_id: created.ticket.id });
    const id = await store.transaction((session) =>
      store.nextId('messages', session),
    );
    const fields = { ...original!, _id: new ObjectId() };
    await store.collection('messages').insertOne({
      ...fields,
      id,
      source_key: `${client.originator()}:crm-comment:${note.ID}`,
      author_type: 'support',
      message_text: note.COMMENT,
      bitrix: { direction: 'in', comment_id: Number(note.ID) },
    });
    await worker.syncTicket(
      await store.collection('tickets').findOne({ id: created.ticket.id }),
      funnel,
    );
    const detail = await support.detail(resident, created.ticket.id);
    expect(detail.messages[1].deleted).toBe(true);
    expect(JSON.stringify(detail)).not.toContain(note.COMMENT);
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
    const external: any = operatorComment('(ответ) Ответ с файлом');
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
    external.COMMENT = 'Файл только для сотрудников';
    await worker.syncTicket(
      await store.collection('tickets').findOne({ id: result.ticket.id }),
      funnel,
    );
    await expect(
      support.download(resident, attachment.attachment_id),
    ).rejects.toMatchObject({
      response: { error: { code: 'not_found' } },
    });
    const hidden = await support.detail(resident, result.ticket.id);
    expect(hidden.messages[1].attachments).toEqual([]);
    external.COMMENT = '(ответ)';
    await worker.syncTicket(
      await store.collection('tickets').findOne({ id: result.ticket.id }),
      funnel,
    );
    const republished = await support.detail(resident, result.ticket.id);
    expect(republished.messages[1].message_text).toBe('Вложение');
    expect(republished.messages[1].attachments[0].attachment_id).toBe(
      attachment.attachment_id,
    );
    expect(
      (
        await support.download(resident, attachment.attachment_id)
      ).bytes.toString(),
    ).toBe('Ответ');
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
