import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, createConnection } from 'mongoose';
import request from 'supertest';
import { OperationsStore } from '../../operations/operations.store';
import { Bitrix24Client } from './bitrix24.client';
import { QualitySyncService } from './quality-sync.service';
import {
  QualityAdminController,
  QualityRatingController,
} from './quality.controller';

describe('quality rating persistence', () => {
  let mongo: MongoMemoryServer;
  let connection: Connection;
  let store: OperationsStore;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create({
      binary: { version: process.env.MONGOMS_VERSION || '7.0.24' },
    });
    connection = await createConnection(mongo.getUri()).asPromise();
    store = new OperationsStore(connection);
    const client = { enabled: () => false } as Bitrix24Client;
    await new QualitySyncService(store, client).onModuleInit();
  }, 60000);

  afterAll(async () => {
    await connection?.close();
    await mongo?.stop();
  });

  it('paginates filtered tickets without restricting the weekly report to the page', async () => {
    const officeId = 'pagination-test';
    await store.collection('quality_tickets').insertMany(
      Array.from({ length: 26 }, (_, index) => ({
        _id: `pagination-${index}`,
        title: 'Заявка',
        officeId,
        createdAt: new Date('2026-11-16T08:00:00Z'),
      })),
    );
    const manager = new QualityAdminController(store);
    const first = await manager.list('2026-11-16', officeId);
    const second = await manager.list('2026-11-16', officeId, undefined, '2');
    expect(first.tickets).toHaveLength(25);
    expect(second.tickets).toHaveLength(1);
    expect(first.tickets.map(({ _id }) => _id)).not.toContain(
      second.tickets[0]._id,
    );
    expect(second.pagination).toEqual({
      page: 2,
      pageSize: 25,
      pages: 2,
      total: 26,
    });
    expect(second.report).toEqual(first.report);
    expect(second.report?.created).toBe(26);
    await store
      .collection('quality_tickets')
      .updateOne(
        { _id: 'pagination-0' },
        { $set: { stageName: 'Сделка успешна' } },
      );
    const closed = await manager.list(
      '2026-11-16',
      officeId,
      undefined,
      '2',
      '25',
      'true',
    );
    expect(closed.pagination).toEqual({
      page: 1,
      pageSize: 25,
      pages: 1,
      total: 1,
    });
    expect(closed.tickets.map(({ _id }) => _id)).toEqual(['pagination-0']);
    expect(closed.report?.created).toBe(26);
    await store.collection('quality_tickets').deleteMany({ officeId });
  });

  it('accepts a valid public response via HTTP without authentication', async () => {
    await store.collection('quality_tickets').insertOne({
      _id: 'public-test',
      title: 'Публичная оценка',
      stageName: 'Можно закрывать',
      createdAt: new Date(),
    });
    const { token } = await new QualityAdminController(store).create(
      'public-test',
      false,
      false,
    );
    const module = await Test.createTestingModule({
      controllers: [QualityRatingController],
      providers: [{ provide: OperationsStore, useValue: store }],
    }).compile();
    const app = module.createNestApplication();
    try {
      app.setGlobalPrefix('api');
      await app.init();
      const http = request(app.getHttpServer());
      const path = '/api/quality-rating/' + token;
      await http
        .get(path)
        .expect(200, { title: 'Публичная оценка', answer: null });
      await http.post(path).send({ score: 2.5 }).expect(400);
      await http
        .post(path)
        .send({ score: 5, comment: 'x'.repeat(501) })
        .expect(400);
      await http.post(path).send({ score: 5 }).expect(201);
      const response = await http
        .get(path)
        .expect('Cache-Control', 'no-store')
        .expect(200);
      expect(response.body.answer).toMatchObject({ score: 5, comment: '' });
    } finally {
      await app.close();
    }
  });

  it('upserts CRM deals and preserves manual office, flags and requests', async () => {
    await connection
      .db!.collection('offices')
      .insertMany([{ number: '401', company: 'Пример' }, { number: '502' }]);
    const deal = {
      ID: '88',
      TITLE: 'Уборка офиса 502',
      DATE_CREATE: '2026-11-16T09:00:00+03:00',
      STAGE_ID: 'NEW',
      CREATED_BY_ID: '12',
      COMPANY_ID: '15',
      SOURCE_ID: 'EMAIL',
    };
    let categoryId = 9;
    const client = {
      funnel: async () => ({
        id: categoryId,
        stages: [
          { id: 'NEW', name: 'Новая' },
          { id: 'DONE', name: 'Закрыта' },
        ],
      }),
      originator: () => 'PASS',
      author: async () => 'Иван Петров',
      call: jest.fn(async (method, { filter }) => ({
        result:
          method === 'crm.company.get'
            ? { TITLE: 'Пример' }
            : filter['>ID'] < 88
              ? [deal]
              : [],
      })),
    };
    const sync = new QualitySyncService(
      store,
      client as unknown as Bitrix24Client,
    );
    const manager = new QualityAdminController(store);
    await Promise.all([
      sync.sync(),
      new QualitySyncService(store, client as unknown as Bitrix24Client).sync(),
    ]);
    expect((await manager.list(undefined, '401')).tickets).toEqual([
      expect.objectContaining({
        _id: '88',
        stageName: 'Новая',
        creatorName: 'Иван Петров',
        officeId: '401',
        source: 'EMAIL',
      }),
    ]);
    await expect(manager.create('88', false, false)).rejects.toMatchObject({
      status: 409,
    });
    expect(
      (await store.collection('quality_tickets').findOne({ _id: '88' }))
        ?.requests,
    ).toBeUndefined();
    await manager.update('88', true, true, '777');
    await store
      .collection('quality_tickets')
      .updateOne({ _id: '88' }, { $set: { stageName: 'Можно закрывать' } });
    await expect(manager.create('88', true, true)).rejects.toMatchObject({
      status: 404,
    });
    const request = await manager.create('88', false, false);
    deal.STAGE_ID = 'DONE';
    deal.COMPANY_ID = '0';
    client.call.mockClear();
    await sync.sync();
    expect(client.call).toHaveBeenCalledWith(
      'crm.deal.list',
      expect.objectContaining({
        filter: expect.objectContaining({
          CATEGORY_ID: 9,
          '>=DATE_MODIFY': expect.any(String),
        }),
      }),
    );
    const list = await manager.list(undefined, '777', 'true');
    expect(list.tickets).toEqual([
      expect.objectContaining({
        _id: '88',
        stageName: 'Закрыта',
        autoOfficeId: '502',
        officeId: '777',
        excluded: true,
        requests: [request],
      }),
    ]);
    expect((await manager.list(undefined, '502')).tickets).toEqual([]);
    const weekly = await manager.list('2026-11-16', '777', 'true');
    expect(weekly.report).toMatchObject({
      created: 0,
      answered: 0,
      requested: 0,
      excluded: 1,
      average: null,
    });
    expect(
      await store.collection('quality_tickets').countDocuments({ _id: '88' }),
    ).toBe(1);
    categoryId = 10;
    client.call.mockClear();
    const state = store.collection('quality_sync');
    const beforeFailure = await state.findOne({ _id: 'deals' });
    client.call.mockRejectedValueOnce(new Error('temporary CRM outage'));
    await sync.sync();
    expect(await state.findOne({ _id: 'deals' })).toEqual(beforeFailure);
    client.call.mockClear();
    await sync.sync();
    expect(client.call.mock.calls[0][1].filter).toEqual({
      CATEGORY_ID: 10,
      '>ID': 0,
    });
    const buildings = await connection
      .db!.collection('properties')
      .insertMany([{ name: 'БЦ Добрынинский' }, { name: 'БЦ Добрынинский-2' }]);
    await connection.db!.collection('offices').insertMany([
      { number: '405', property: buildings.insertedIds[0] },
      { number: '405', property: buildings.insertedIds[1] },
    ]);
    deal.TITLE = 'Д-2/405-84м Проводка';
    await sync.sync();
    expect((await manager.list(undefined, '777')).tickets[0]).toMatchObject({
      officeId: '777',
      autoOfficeId: 'Добрынинский-2 · 405',
    });
    deal.TITLE = 'Д/405-74 м², вынос тмц';
    Object.assign(deal, {
      CLOSED: 'Y',
      MOVED_TIME: '2026-11-16T12:00:00+03:00',
    });
    await sync.sync();
    expect((await manager.list(undefined, '777')).tickets[0]).toMatchObject({
      officeId: '777',
      autoOfficeId: 'Добрынинский · 405',
      closedAt: new Date('2026-11-16T09:00:00Z'),
    });
    expect(await manager.offices()).toEqual(
      expect.arrayContaining(['Добрынинский · 405', 'Добрынинский-2 · 405']),
    );
    const file = manager.exportCsv('2026-11-16', '2026-11-16', '777');
    let csv = '';
    for await (const chunk of file.getStream()) csv += String(chunk);
    expect(csv).toContain('"Закрыта (МСК)"');
    expect(csv).toContain('"Д/405-74 м², вынос тмц"');
    expect(csv).toContain('12:00');
  });

  it('shares one saved answer across chat and link, and keeps earlier answers after a repeat', async () => {
    const createdAt = new Date('2026-11-16T08:00:00Z');
    const tickets = store.collection('quality_tickets');
    await tickets.insertOne({
      _id: '42',
      title: 'Тестовая заявка',
      stageName: 'Сделка успешна',
      passTicketId: '7',
      createdAt,
    });
    await store
      .collection('tickets')
      .insertOne({ id: 7, bitrix: { deal_id: 42 } });
    const manager = new QualityAdminController(store);
    const rating = new QualityRatingController(store);

    const link = await manager.create('42', false, false);
    const chat = await manager.create('42', false, true);
    expect(chat.token).toBe(link.token);
    expect((await tickets.findOne({ _id: '42' }))?.requests).toEqual([
      { ...link, chat: true, chatAt: expect.any(Date) },
    ]);

    await expect(rating.answer(chat.token, 0, '')).rejects.toThrow();
    await expect(
      rating.answer(chat.token, 4, 'Спасибо'),
    ).resolves.toMatchObject({
      answer: { score: 4, comment: 'Спасибо' },
    });
    await expect(
      rating.answer(link.token, 1, 'Другой ответ'),
    ).resolves.toMatchObject({
      answer: { score: 4, comment: 'Спасибо' },
    });

    const repeat = await manager.create('42', true, true);
    expect(repeat.token).not.toBe(link.token);
    await expect(rating.get(repeat.token)).resolves.toMatchObject({
      answer: null,
    });
    const [fromChat, fromLink] = await Promise.all([
      rating.answer(repeat.token, 5, 'Из чата'),
      rating.answer(repeat.token, 3, 'По ссылке'),
    ]);
    expect(fromChat.answer).toEqual(fromLink.answer);
    expect([3, 5]).toContain(fromChat.answer.score);
    await expect(rating.get(link.token)).resolves.toMatchObject({
      answer: { score: 4 },
    });
    const result = await manager.list();
    expect(
      result.tickets.find((ticket) => ticket._id === '42')?.chatAvailable,
    ).toBe(true);
    expect(
      result.tickets.find((ticket) => ticket._id === '88')?.chatAvailable,
    ).toBe(false);
    expect(
      result.tickets.find((ticket) => ticket._id === '42')?.requests,
    ).toMatchObject([
      { token: link.token, answer: { score: 4 } },
      { token: repeat.token, chat: true },
    ]);
  });
});
