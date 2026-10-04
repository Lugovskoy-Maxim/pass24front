import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createConnection, Connection } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { OperationsStore } from './operations.store';
import { OperationsIdentity } from './operations.identity';
import { OperationsHours } from './operations.hours';
import { OperationsBookings } from './operations.bookings';
import { OperationsCatalog } from './operations.catalog';
import { OperationsSupport } from './operations.support';
import { OperationsMigration } from './operations.migration';
import { OperationsPayments } from './operations.payments';
import {
  bookingNeedsAction,
  monthlyPeriod,
  OperationsActor,
  supportNeedsAction,
} from './operations.rules';
import { encryptJson } from '../integrations/mstyle-v2/mstyle-v2.crypto';
import { OfficeServicesService } from '../office-services/office-services.service';
import { Office, OfficeSchema, User, UserSchema } from '../schemas';
import { Types } from 'mongoose';
import {
  OperationsAdminController,
  OperationsPrivateController,
} from './operations.controller';
import { ServiceRequestsController } from '../site-source/service-requests.controller';

jest.setTimeout(900000);
const secret = 'local-operations-test-secret-32-characters';
const admin: OperationsActor = {
  kind: 'admin',
  ref: 'admin:test',
  permissions: [
    'admin.panel',
    'bookings.manage',
    'bookings.finance',
    'resident_hours.adjust',
    'support.manage',
  ],
};
const resident: OperationsActor = {
  kind: 'resident',
  ref: 'resident:usr_test',
  subject: 'usr_test',
};
const catalogData = {
  version: 'v1',
  rooms: [
    {
      id: 1,
      title: 'Переговорная',
      type: 'meeting',
      config: {
        price_amount_minor: 200000,
        price_unit: 'hour',
        slot_step_min: 30,
        work_start_minute: 540,
        work_end_minute: 1260,
      },
    },
  ],
  services: [],
};
const input = {
  room_id: 1,
  profile_id: 'prf_test',
  snapshot_id: 'rps_test',
  payment_method: 'cash',
  writeoff_min: 30,
  segments: [{ date: '2099-10-20', start_minute: 600, end_minute: 660 }],
};

describe('Operations with real replica-set transactions', () => {
  let mongo: MongoMemoryReplSet;
  let connection: Connection;
  let store: OperationsStore;
  let identity: OperationsIdentity;
  let hours: OperationsHours;
  let bookings: OperationsBookings;
  let support: OperationsSupport;
  let payments: OperationsPayments;
  let officeServices: OfficeServicesService;
  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({
      binary: {
        version: process.env.MONGOMS_VERSION || '7.0.24',
      },
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    connection = await createConnection(mongo.getUri()).asPromise();
    store = new OperationsStore(connection);
    await store.onModuleInit();
    const cfg: any = { piiSecret: () => secret, environment: () => 'local' };
    identity = new OperationsIdentity(store, {} as any, {} as any, cfg);
    officeServices = new OfficeServicesService(
      connection,
      connection.model(Office.name, OfficeSchema),
      connection.model(User.name, UserSchema),
      { log: jest.fn() } as any,
    );
    await officeServices.onModuleInit();
    hours = new OperationsHours(store, identity, officeServices);
    const catalog = new OperationsCatalog(new ConfigService());
    jest.spyOn(catalog, 'get').mockResolvedValue(catalogData);
    bookings = new OperationsBookings(
      store,
      identity,
      hours,
      catalog,
      cfg,
      officeServices,
    );
    support = new OperationsSupport(store, identity, officeServices);
    payments = new OperationsPayments(store, bookings, catalog, cfg, {} as any);
  });
  afterAll(async () => {
    await connection?.close();
    await mongo?.stop();
  });
  beforeEach(async () => {
    await connection.db!.collection('offices').deleteMany({});
    await connection.db!.collection('office_service_prices').deleteMany({});
    for (const col of await connection.db!.collections())
      if (col.collectionName.startsWith('mstyle_')) await col.deleteMany({});
    await store
      .collection('settings')
      .insertOne({ key: 'ownership', mode: 'pass', generation: 1 });
    await store.canonical('profiles').insertOne({
      profileId: 'prf_test',
      status: 'active',
      memberPolicy: {
        residentHoursMonthlyQuotaMin: 600,
        residentHoursMonthlyResetDay: 1,
      },
    });
    await store.canonical('memberships').insertOne({
      profileId: 'prf_test',
      subject: 'usr_test',
      status: 'active',
      role: 'owner',
    });
    await store.canonical('identities').insertOne({
      subject: 'usr_test',
      displayName: 'Резидент',
      identityStatus: 'active',
    });
    await store.canonical('snapshots').insertOne({
      snapshotId: 'snp_test',
      partyType: 'resident_profile',
      partyId: 'prf_test',
      payloadEnc: encryptJson(secret, {
        contacts: { displayName: 'Резидент' },
      }),
    });
  });
  async function manualOffice(category = 'standard') {
    const _id = new Types.ObjectId(),
      property = new Types.ObjectId();
    await connection.db!.collection('offices').insertOne({
      _id,
      property,
      number: '401',
      externalId: 'tf-room:401',
      officeFormat: category,
      isActive: true,
      serviceRevision: 0,
      serviceDetails: {
        values: { packageName: 'Текущий сервис', publicIp: '1.2.3.4' },
        visibleFields: ['packageName', 'services'],
        serviceOverrides: [],
      },
    });
    await store
      .canonical('profiles')
      .updateOne(
        { profileId: 'prf_test' },
        { $set: { officeIds: ['tf-room:401'] } },
      );
    return {
      id: String(_id),
      property: String(property),
      user: { role: 'admin' },
    };
  }
  const manualPrice = (rules: any[], bookingRoomIds: number[] = []) => ({
    name: 'Услуга',
    description: '',
    propertyId: null,
    active: true,
    order: 0,
    rules,
    bookingRoomIds,
  });
  const standardRule = {
    categoryCode: 'standard',
    show: true,
    orderable: true,
    mode: 'paid',
    priceMinor: 180000,
    unit: 'hour',
    freeMinutes: 0,
    conditions: 'По записи',
  };
  it('restricts booking lists, actions, destination rooms and counts to the administrator business center', async () => {
    const fixture = await manualOffice();
    await connection.db!.collection('properties').insertOne({
      _id: new Types.ObjectId(fixture.property),
      code: 'tf_business_center:11',
    });
    const catalog = {
      ...catalogData,
      rooms: [
        {
          ...catalogData.rooms[0],
          business_center: { id: 11, name: 'Свой БЦ' },
        },
        {
          ...catalogData.rooms[0],
          id: 2,
          business_center: { id: 22, name: 'Другой БЦ' },
        },
      ],
    };
    jest.spyOn(bookings.catalog, 'get').mockResolvedValue(catalog);
    try {
      const scoped: OperationsActor = {
        ...admin,
        role: 'bc_admin',
        propertyIds: [fixture.property],
      };
      const guestInput = {
        ...input,
        profile_id: undefined,
        writeoff_min: 0,
        guest: { name: 'Гость', phone: '+79990000000' },
      };
      const own = await bookings.create(scoped, guestInput, 'own-center');
      const foreign = await bookings.create(
        admin,
        { ...guestInput, room_id: 2 },
        'other-center',
      );
      expect((await bookings.list(scoped)).items.map((b: any) => b.id)).toEqual(
        [own.booking.id],
      );
      expect((await bookings.list(admin)).total).toBe(2);
      expect(
        (await bookings.adminCatalog(scoped)).rooms.map((r: any) => r.id),
      ).toEqual([1]);
      await expect(
        bookings.detail(scoped, own.booking.id),
      ).resolves.toMatchObject({ booking: { id: own.booking.id } });
      await expect(
        bookings.detail(scoped, foreign.booking.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        bookings.action(
          scoped,
          foreign.booking.id,
          'cancel',
          { revision: 1, reason: 'Отмена' },
          'forbidden-cancel',
        ),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        bookings.change(
          scoped,
          own.booking.id,
          'edit',
          { room_id: 2, revision: 1 },
          'forbidden-transfer',
        ),
      ).rejects.toMatchObject({
        response: { error: { code: 'room_not_found' } },
      });
      await expect(
        bookings.block(
          scoped,
          { ...guestInput, room_id: 2, reason: 'Блокировка' },
          'forbidden-block',
        ),
      ).rejects.toMatchObject({
        response: { error: { code: 'room_not_found' } },
      });
      const controller = new OperationsAdminController(
        store,
        identity,
        support,
        bookings,
        payments,
        hours,
      );
      const req = {
        user: {
          userId: 'local-admin',
          role: 'bc_admin',
          propertyIds: [fixture.property],
          permissions: admin.permissions,
        },
      };
      expect((await controller.counts(req)).bookings).toBe(1);
      await expect(
        controller.availability(req, { room_id: 2, date: '2099-10-20' }),
      ).rejects.toMatchObject({ status: 404 });
      const unassigned = { ...scoped, propertyIds: [] };
      expect((await bookings.list(unassigned)).total).toBe(0);
      expect((await bookings.adminCatalog(unassigned)).rooms).toEqual([]);
      const comment = { revision: 1, comment_admin: 'Уточнение' };
      await bookings.action(
        scoped,
        own.booking.id,
        'comment',
        comment,
        'own-center-comment',
      );
      await store.collection('settings').insertOne({
        key: 'invoices',
        issuers: [{ id: 1, name: 'Получатель' }],
      });
      const invoice = {
        revision: 2,
        invoice_party: {
          profile_type: 'individual',
          values: { individual: { birthDate: '1990-01-01' } },
          email: 'test@example.test',
        },
      };
      await payments.invoice(scoped, own.booking.id, invoice, 'own-invoice');
      await bookings.action(
        scoped,
        own.booking.id,
        'mark-paid',
        { revision: 3 },
        'own-center-payment',
      );
      const edit = { revision: 4, comment_client: 'Обновлённая заявка' };
      await bookings.change(
        scoped,
        own.booking.id,
        'edit',
        edit,
        'own-center-edit',
      );
      await payments.sendInvoice(
        scoped,
        own.booking.id,
        { revision: 5 },
        'own-invoice-send',
      );
      await expect(
        bookings.create(scoped, guestInput, 'own-center'),
      ).resolves.toMatchObject({ booking: { id: own.booking.id } });
      await expect(
        bookings.create(unassigned, guestInput, 'own-center'),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        bookings.action(
          unassigned,
          own.booking.id,
          'comment',
          comment,
          'own-center-comment',
        ),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        bookings.change(
          unassigned,
          own.booking.id,
          'edit',
          edit,
          'own-center-edit',
        ),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        payments.invoice(unassigned, own.booking.id, invoice, 'own-invoice'),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        payments.sendInvoice(
          unassigned,
          own.booking.id,
          { revision: 5 },
          'own-invoice-send',
        ),
      ).rejects.toMatchObject({ status: 404 });
    } finally {
      jest.spyOn(bookings.catalog, 'get').mockResolvedValue(catalogData);
    }
  });
  it.each(['balance', 'cash'])(
    'rejects employee hour spending through the shared %s creation operation',
    async (method) => {
      await store
        .canonical('memberships')
        .updateOne(
          { subject: resident.subject },
          { $set: { role: 'employee' } },
        );
      const controller = Object.create(OperationsPrivateController.prototype);
      controller.bookings = bookings;
      controller.payments = payments;
      await expect(
        controller.dispatch(
          resident,
          {
            action: 'booking.create',
            input: { ...input, payment_method: method },
          },
          'employee-debit-' + method,
        ),
      ).rejects.toMatchObject({
        status: 403,
        response: { error: { code: 'balance_not_available_for_employee' } },
      });
      expect(await store.collection('bookings').countDocuments()).toBe(0);
      expect(
        await store
          .collection('hours_ledger')
          .countDocuments({ type: 'debit' }),
      ).toBe(0);
      const cash = await bookings.create(
        resident,
        { ...input, writeoff_min: 0 },
        'employee-without-hours',
      );
      expect(cash.booking.writeoff_min).toBe(0);
    },
  );
  it('rejects cross-center access and adjustment of resident hours', async () => {
    const fixture = await manualOffice();
    const scoped: OperationsActor = {
      ...admin,
      role: 'bc_admin',
      propertyIds: [String(new Types.ObjectId())],
    };
    await expect(hours.read(scoped, 'prf_test')).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      hours.adjust(
        scoped,
        'prf_test',
        { amount_min: 30, type: 'debit', reason: 'Корректировка', revision: 1 },
        'foreign-hours',
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(await store.collection('hours_ledger').countDocuments()).toBe(0);
    const allowed = { ...scoped, propertyIds: [fixture.property] };
    const current = await hours.read(allowed, 'prf_test');
    expect(current).toHaveProperty('account');
    await expect(
      hours.adjust(
        { ...allowed, permissions: ['admin.panel', 'resident_hours.adjust'] },
        'prf_test',
        {
          amount_min: 30,
          type: 'credit',
          reason: 'Корректировка своего БЦ',
          revision: current.account!.revision,
        },
        'own-hours-only-permission',
      ),
    ).resolves.toHaveProperty('balance_after_min');
  });
  it('lets the ticket owner download an admin attachment through the resident route and rejects other residents', async () => {
    await store
      .canonical('identities')
      .updateOne(
        { subject: resident.subject },
        { $set: { userId: 'owner-user' } },
      );
    await store.canonical('identities').insertOne({
      userId: 'other-user',
      subject: 'usr_other',
      identityStatus: 'active',
      displayName: 'Другой клиент',
    });
    const created = await support.create(
      resident,
      {
        topic_key: 'services',
        subject: 'Обслуживание',
        message_text: 'Нужна инструкция',
      },
      'ticket-file',
    );
    const file = await support.upload(
      admin,
      {
        name: 'instruction.txt',
        base64: Buffer.from('Инструкция').toString('base64'),
      },
      'admin-file',
    );
    await support.reply(
      admin,
      created.ticket.id,
      {
        message_text: 'Инструкция во вложении',
        attachment_ids: [file.attachment_id],
        revision: created.ticket.revision,
      },
      'admin-file-reply',
    );
    const controller = new ServiceRequestsController(identity, support);
    const response = { set: jest.fn().mockReturnThis(), send: jest.fn() };
    const user = (userId: string) => ({
      user: { userId, permissions: ['requests.view_own'] },
    });
    await controller.download(
      user('owner-user'),
      String(file.attachment_id),
      response as any,
    );
    expect(response.send).toHaveBeenCalledWith(Buffer.from('Инструкция'));
    await expect(
      controller.download(
        user('other-user'),
        String(file.attachment_id),
        response as any,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('enforces office visibility, business-center scope and optimistic revisions', async () => {
    const fixture = await manualOffice('standard_plus');
    const office = await connection
      .db!.collection('offices')
      .findOne({ _id: new Types.ObjectId(fixture.id) });
    const features = await officeServices.features(office);
    expect(features.details).toEqual({ packageName: 'Текущий сервис' });
    expect(features.category).toBeNull();
    const owner = new Types.ObjectId(),
      employee = new Types.ObjectId();
    await connection
      .db!.collection('users')
      .insertMany([{ _id: owner }, { _id: employee, parentTenantId: owner }]);
    await connection
      .db!.collection('offices')
      .updateOne(
        { _id: new Types.ObjectId(fixture.id) },
        { $set: { tenantId: owner, tenantIds: [owner] } },
      );
    expect(
      (
        await officeServices.tenantOffice(fixture.id, {
          userId: String(employee),
        })
      ).office.details,
    ).toEqual({ packageName: 'Текущий сервис' });
    await expect(
      officeServices.tenantOffice(fixture.id, {
        userId: String(new Types.ObjectId()),
      }),
    ).rejects.toThrow('Офис не найден');
    await expect(
      officeServices.adminOffice(fixture.id, {
        role: 'bc_admin',
        propertyIds: [],
      }),
    ).rejects.toThrow('Нет доступа');
    await expect(
      officeServices.adminOffice(fixture.id, {
        role: 'bc_admin',
        propertyIds: [fixture.property],
      }),
    ).resolves.toBeDefined();
    const value = {
      details: {
        ...office!.serviceDetails,
        visibleFields: ['category', 'publicIp'],
      },
      revision: 0,
    };
    const race = await Promise.allSettled([
      officeServices.saveOffice(fixture.id, value, fixture.user),
      officeServices.saveOffice(fixture.id, value, fixture.user),
    ]);
    expect(race.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(race.filter((r) => r.status === 'rejected')).toHaveLength(1);
    await expect(
      officeServices.saveOffice(
        fixture.id,
        { ...value, revision: 1, officeFormat: 'vip' },
        fixture.user,
      ),
    ).rejects.toThrow('сайте-источнике');
  });
  it('creates an office-specific order once and preserves its manual price', async () => {
    const fixture = await manualOffice();
    const { service } = await officeServices.savePrice(
      null,
      manualPrice([standardRule]),
      fixture.user,
    );
    const order = {
      topic_key: 'services',
      subject: 'Заказать услугу',
      message_text: 'Нужна услуга для офиса',
      office_id: fixture.id,
      service_id: service.id,
      quantity: 2,
    };
    const first = await support.create(resident, order, 'manual-service-order');
    expect(first.ticket.service_order.totalAmountMinor).toBe(360000);
    expect(first.ticket.office_id).toBe(fixture.id);
    await officeServices.savePrice(
      service.id,
      {
        ...manualPrice([{ ...standardRule, priceMinor: 200000 }]),
        revision: 1,
      },
      fixture.user,
    );
    const retry = await support.create(resident, order, 'manual-service-order');
    expect(retry.ticket.id).toBe(first.ticket.id);
    expect(retry.ticket.service_order.totalAmountMinor).toBe(360000);
    expect(
      (await support.detail(admin, first.ticket.id)).ticket.office_category
        .code,
    ).toBe('standard');
    expect(
      (await support.detail(resident, first.ticket.id)).ticket.office_category,
    ).toBeNull();
    await expect(
      support.detail(
        { ...admin, role: 'bc_admin', propertyIds: [] },
        first.ticket.id,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      support.create(
        resident,
        { ...order, office_id: String(new Types.ObjectId()) },
        'other-office',
      ),
    ).rejects.toThrow('Офис');
    await connection
      .db!.collection('offices')
      .updateOne(
        { _id: new Types.ObjectId(fixture.id) },
        { $set: { officeFormat: 'standard_plus' } },
      );
    await expect(
      support.create(resident, order, 'unfilled-category'),
    ).rejects.toThrow('недоступна');
  });
  it('calculates manual VIP minutes and blocks a stale price before booking', async () => {
    const fixture = await manualOffice('vip');
    const { service } = await officeServices.savePrice(
      null,
      manualPrice(
        [
          {
            ...standardRule,
            categoryCode: 'vip',
            mode: 'quota',
            freeMinutes: 120,
          },
        ],
        [1],
      ),
      fixture.user,
    );
    const draft = {
      ...input,
      office_id: fixture.id,
      writeoff_min: 120,
      segments: [{ date: '2099-10-20', start_minute: 600, end_minute: 780 }],
    };
    const quote = await bookings.quote(resident, draft);
    expect(quote.total_amount_minor).toBe(180000);
    expect(
      await officeServices.monthlyHours({ officeIds: ['tf-room:401'] }),
    ).toBe(120);
    await officeServices.savePrice(
      service.id,
      {
        ...manualPrice(
          [
            {
              ...standardRule,
              categoryCode: 'vip',
              mode: 'quota',
              freeMinutes: 120,
              priceMinor: 200000,
            },
          ],
          [1],
        ),
        revision: 1,
      },
      fixture.user,
    );
    await expect(
      bookings.create(
        resident,
        { ...draft, pricing_fingerprint: quote.pricing_fingerprint },
        'stale-manual-price',
      ),
    ).rejects.toThrow();
    const currentQuote = await bookings.quote(resident, draft);
    const result = await bookings.create(
      resident,
      { ...draft, pricing_fingerprint: currentQuote.pricing_fingerprint },
      'vip-manual-booking',
    );
    expect(result.booking.total_amount_minor).toBe(200000);
    expect(result.booking.office_id).toBe(fixture.id);
    expect(
      (await hours.read(resident, 'prf_test')).account!.available_balance_min,
    ).toBe(0);
    await bookings.customerCancel(
      resident,
      result.booking.id,
      {},
      'vip-manual-cancel',
    );
    expect(
      (await hours.read(resident, 'prf_test')).account!.available_balance_min,
    ).toBe(120);
  });
  it('does not grant another category the VIP quota or expose unpublished room prices', async () => {
    const fixture = await manualOffice('standard_plus');
    const { service } = await officeServices.savePrice(
      null,
      manualPrice(
        [
          {
            ...standardRule,
            categoryCode: 'vip',
            mode: 'quota',
            freeMinutes: 120,
          },
        ],
        [1],
      ),
      fixture.user,
    );
    expect(
      await officeServices.monthlyHours({ officeIds: ['tf-room:401'] }),
    ).toBe(0);
    expect(
      (
        await bookings.pricedCatalog(resident, {
          ...input,
          office_id: fixture.id,
        })
      ).rooms,
    ).toHaveLength(0);
    await officeServices.savePrice(
      service.id,
      { ...manualPrice([standardRule], [1]), revision: 1 },
      fixture.user,
    );
    await connection
      .db!.collection('offices')
      .updateOne(
        { _id: new Types.ObjectId(fixture.id) },
        { $set: { officeFormat: 'standard' } },
      );
    await expect(
      bookings.quote(resident, {
        ...input,
        office_id: fixture.id,
        writeoff_min: 30,
      }),
    ).rejects.toMatchObject({
      response: { error: { code: 'hours_not_available' } },
    });
    await connection
      .db!.collection('offices')
      .updateOne(
        { _id: new Types.ObjectId(fixture.id) },
        { $set: { 'serviceDetails.visibleFields': [] } },
      );
    expect(
      (
        await bookings.pricedCatalog(resident, {
          ...input,
          office_id: fixture.id,
        })
      ).rooms,
    ).toHaveLength(0);
  });
  it('keeps original prices and services when extending after a catalogue price change', async () => {
    const a = await bookings.create(
      resident,
      { ...input, writeoff_min: 0 },
      'old-tariff',
    );
    const old = await store
      .collection('bookings')
      .findOne({ id: a.booking.id });
    await store.collection('bookings').updateOne(
      { id: a.booking.id },
      {
        $set: {
          services: [
            {
              service_id: 99,
              name: 'Архивная услуга',
              total_amount_minor: 5000,
            },
          ],
          services_amount_minor: 5000,
          total_amount_minor: 205000,
        },
      },
    );
    const changed = structuredClone(catalogData);
    changed.rooms[0].config.price_amount_minor = 300000;
    jest.spyOn(bookings.catalog, 'get').mockResolvedValueOnce(changed);
    const result = await bookings.change(
      resident,
      a.booking.id,
      'extend',
      {
        revision: old!.revision,
        end_minute: 690,
        payment_method: 'cash',
        writeoff_min: 0,
      },
      'new-tariff-extension',
    );
    expect(result.booking.total_amount_minor).toBe(355000);
    expect(result.booking.services_amount_minor).toBe(5000);
    expect(result.booking.services[0].service_id).toBe(99);
  });
  it('replays a committed command even when the current catalogue is unavailable', async () => {
    const first = await bookings.create(
      resident,
      input,
      'replay-without-catalog',
    );
    const get = jest.spyOn(bookings.catalog, 'get');
    const calls = get.mock.calls.length;
    const again = await bookings.create(
      resident,
      input,
      'replay-without-catalog',
    );
    expect(again.booking.id).toBe(first.booking.id);
    expect(get.mock.calls.length).toBe(calls);
    expect(
      await store.collection('hours_ledger').countDocuments({ type: 'debit' }),
    ).toBe(1);
  });
  it('serializes competing reservations and rolls back the losing debit', async () => {
    const results = await Promise.allSettled([
      bookings.create(resident, input, 'create-first'),
      bookings.create(resident, input, 'create-second'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await store.collection('bookings').countDocuments()).toBe(1);
    expect(
      (await store.collection('hours_accounts').findOne({}))?.balance_min,
    ).toBe(570);
    expect(
      await store.collection('hours_ledger').countDocuments({ type: 'debit' }),
    ).toBe(1);
  });
  it('replays a concurrent command and returns hours once across admin and cabinet cancellation', async () => {
    const [a, b] = await Promise.all([
      bookings.create(resident, input, 'one-intent'),
      bookings.create(resident, input, 'one-intent'),
    ]);
    expect(a.booking.id).toBe(b.booking.id);
    await expect(
      bookings.action(
        admin,
        a.booking.id,
        'confirm',
        { revision: 1 },
        'confirm-unpaid',
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'payment_required' } },
    });
    await Promise.all([
      bookings.customerCancel(resident, a.booking.id, {}, 'cancel-cabinet'),
      bookings.customerCancel(admin, a.booking.id, {}, 'cancel-admin'),
    ]);
    expect(
      (await store.collection('hours_accounts').findOne({}))?.balance_min,
    ).toBe(600);
    expect(
      await store.collection('hours_ledger').countDocuments({ type: 'credit' }),
    ).toBe(1);
  });
  it('checks revisions and limits manual refunds to actual unreturned debits', async () => {
    const a = await bookings.create(resident, input, 'create-hours');
    await expect(
      bookings.action(
        admin,
        a.booking.id,
        'comment',
        { revision: 2, comment_admin: 'x' },
        'stale-version',
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'revision_conflict' } },
    });
    await expect(
      hours.adjust(
        admin,
        'prf_test',
        {
          amount_min: 60,
          type: 'credit',
          reason: 'Исправление',
          booking_id: a.booking.id,
          revision: 2,
        },
        'over-refund',
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'refund_exceeds_debit' } },
    });
    await hours.adjust(
      admin,
      'prf_test',
      {
        amount_min: 10,
        type: 'credit',
        reason: 'Исправление',
        booking_id: a.booking.id,
        revision: 2,
      },
      'partial-refund',
    );
    await bookings.customerCancel(resident, a.booking.id, {}, 'cancel-rest');
    expect(
      (await store.collection('hours_accounts').findOne({}))?.balance_min,
    ).toBe(600);
  });
  it('isolates support and GridFS files, preserves action counts on read, clears on reply', async () => {
    const file = await support.upload(resident, {
      name: 'notice.txt',
      base64: Buffer.from('Тест').toString('base64'),
    });
    const a = await support.create(
      resident,
      {
        topic_key: 'booking',
        message_text: 'Помогите с бронью',
        attachment_ids: [file.attachment_id],
      },
      'support-create',
    );
    expect(supportNeedsAction(a.ticket)).toBe(true);
    const seen = await support.read(admin, a.ticket.id, {}, 'support-read');
    expect(supportNeedsAction(seen.ticket)).toBe(true);
    const other: OperationsActor = {
      kind: 'resident',
      ref: 'resident:other',
      subject: 'other',
    };
    await expect(support.detail(other, a.ticket.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      support.download(other, file.attachment_id),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (await support.download(resident, file.attachment_id)).bytes.toString(),
    ).toBe('Тест');
    const answered = await support.reply(
      admin,
      a.ticket.id,
      { message_text: 'Готово', revision: 1 },
      'support-reply',
    );
    expect(supportNeedsAction(answered.ticket)).toBe(false);
    expect(answered.ticket.unread_for_customer).toBe(true);
  });
  it('defers mixed-payment hours and makes duplicate provider notifications harmless', async () => {
    const a = await bookings.create(
      resident,
      { ...input, payment_method: 'card_online' },
      'mixed-payment',
    );
    expect(
      await store.collection('hours_ledger').countDocuments({ type: 'debit' }),
    ).toBe(0);
    await store.collection('payments').insertOne({
      id: 1,
      booking_id: a.booking.id,
      provider: 'yookassa',
      provider_payment_id: 'payment-test-1',
      amount_minor: 100000,
      status: 'pending',
    });
    jest.spyOn(payments as any, 'gateway').mockResolvedValue({
      id: 'payment-test-1',
      status: 'succeeded',
      amount: { value: '1000.00', currency: 'RUB' },
    });
    await Promise.all([
      payments.checkPayment('payment-test-1'),
      payments.checkPayment('payment-test-1'),
    ]);
    expect(
      await store.collection('hours_ledger').countDocuments({ type: 'debit' }),
    ).toBe(1);
    expect(
      (await store.collection('bookings').findOne({ id: a.booking.id }))
        ?.payment_status,
    ).toBe('paid');
  });
  it('uses a shared root and keeps a booking resource owner after relinking', async () => {
    await store.canonical('profiles').insertOne({
      profileId: 'prf_child',
      status: 'active',
      resourceOwnerProfileId: 'prf_test',
    });
    await store.canonical('memberships').insertOne({
      profileId: 'prf_child',
      subject: 'usr_test',
      status: 'active',
    });
    await store.canonical('snapshots').insertOne({
      snapshotId: 'snp_child',
      partyType: 'resident_profile',
      partyId: 'prf_child',
      payloadEnc: encryptJson(secret, { contacts: {} }),
    });
    const a = await bookings.create(
      resident,
      { ...input, profile_id: 'prf_child', snapshot_id: 'rps_child' },
      'shared-hours',
    );
    await store
      .canonical('profiles')
      .updateOne(
        { profileId: 'prf_child' },
        { $set: { resourceOwnerProfileId: null } },
      );
    const historical = await hours.read(admin, a.booking.resource_profile_id);
    expect(historical.account!.resource_profile_id).toBe('prf_test');
    expect(
      historical.history.some((entry) => entry.booking_id === a.booking.id),
    ).toBe(true);
    await bookings.customerCancel(resident, a.booking.id, {}, 'cancel-shared');
    expect(
      (
        await store
          .collection('hours_accounts')
          .findOne({ resource_profile_id: 'prf_test' })
      )?.balance_min,
    ).toBe(600);
  });
  it('pauses mutations without losing previously committed command receipts', async () => {
    const a = await bookings.create(resident, input, 'before-pause');
    await store
      .collection('settings')
      .updateOne({ key: 'ownership' }, { $set: { mode: 'paused' } });
    expect(
      (await bookings.create(resident, input, 'before-pause')).booking.id,
    ).toBe(a.booking.id);
    await expect(
      bookings.customerCancel(resident, a.booking.id, {}, 'during-pause'),
    ).rejects.toMatchObject({ status: 503 });
    expect((await bookings.detail(resident, a.booking.id)).booking.status).toBe(
      'awaiting_payment',
    );
  });
  it('creates an admin guest as GuestParty, without a native user or invented verification', async () => {
    const a = await bookings.create(
      admin,
      {
        ...input,
        profile_id: null,
        snapshot_id: null,
        writeoff_min: 0,
        guest: { name: 'Гость', phone: '+79990001122' },
      },
      'admin-guest',
    );
    expect(a.booking.guest).toBe(true);
    expect(a.booking.owner_subject).toBeNull();
    const party = await store
      .canonical('guest_parties')
      .findOne({ guestPartyId: a.booking.pass_party_id });
    expect(party?.primaryContact.verifiedAt).toBeNull();
    expect(a.booking.requester.name).toBe('Гость');
    expect(await store.canonical('identities').countDocuments()).toBe(1);
  });
  it('requests guest requisites at invoicing and freezes them without rewriting the booking author', async () => {
    const a = await bookings.create(
      admin,
      {
        ...input,
        profile_id: null,
        snapshot_id: null,
        writeoff_min: 0,
        guest: { name: 'Гость', phone: '+79990001122' },
      },
      'invoice-guest',
    );
    await store
      .collection('settings')
      .insertOne({ key: 'invoices', issuers: [{ id: 1, name: 'Получатель' }] });
    await expect(
      payments.invoice(
        admin,
        a.booking.id,
        { revision: 1 },
        'guest-invoice-missing',
      ),
    ).rejects.toMatchObject({ status: 409 });
    const command = {
      revision: 1,
      invoice_party: {
        profile_type: 'individual',
        values: { individual: { birthDate: '1990-01-01' } },
        email: 'test@example.test',
      },
    };
    const first = await payments.invoice(
      admin,
      a.booking.id,
      command,
      'guest-invoice-complete',
    );
    const again = await payments.invoice(
      admin,
      a.booking.id,
      command,
      'guest-invoice-complete',
    );
    expect(again.invoice.id).toBe(first.invoice.id);
    expect(await store.collection('invoices').countDocuments()).toBe(1);
    const booking = await store
      .collection('bookings')
      .findOne({ id: a.booking.id });
    expect(booking!.pass_snapshot_id).toBe(a.booking.pass_snapshot_id);
    expect(first.invoice.snapshot_id).not.toBe(a.booking.pass_snapshot_id);
    expect(first.invoice.booking_render.date).toBe('2099-10-20');
    await payments.sendInvoice(
      admin,
      a.booking.id,
      { revision: 2 },
      'send-guest-invoice',
    );
    const mail = await store
      .collection('outbox')
      .findOne({ type: 'invoice.send' });
    expect(mail!.payload.recipient).toBe('test@example.test');
    expect(mail!.payload.invoice_id).toBe(first.invoice.id);
  });
  it('imports history without replaying debit/credit and verifies fields on repeated import', async () => {
    await store
      .collection('settings')
      .updateOne({ key: 'ownership' }, { $set: { mode: 'paused' } });
    const migration = new OperationsMigration(store, secret);
    const bundle: any = {
      environment: 'local',
      owner_mode: 'paused',
      export_id: 'test-export',
      digest: 'test',
      catalog: catalogData,
      attachments: [],
      payment_settings: {},
      tables: {
        bookings: [
          {
            id: 42,
            number: 'B-00042',
            room_id: 1,
            date: '2099-10-20',
            start_minute: 600,
            end_minute: 660,
            duration_min: 60,
            pass_party_type: 'resident_profile',
            pass_party_id: 'prf_test',
            pass_snapshot_id: 'rps_test',
            pass_principal_id: 7,
            status: 'confirmed',
            payment_status: 'paid',
            payment_method: 'balance',
            total_amount_minor: 0,
          },
        ],
        pass_principals: [{ id: 7, pass_subject: 'usr_test' }],
        pass_operation_links: [
          { booking_id: 42, resource_profile_id: 'prf_test' },
        ],
        pass_resident_hour_accounts: [
          {
            id: 1,
            resource_profile_id: 'prf_test',
            balance_min: 540,
            applied_monthly_quota_min: 600,
            applied_monthly_reset_day: 1,
            resident_hours_accrual_date: '2099-10-01',
            resident_hours_expires_date: '2099-10-31',
          },
        ],
        balance_transactions: [
          {
            id: 1,
            booking_id: 42,
            principal_id: 7,
            type: 'debit',
            amount_min: 60,
            balance_after_min: 540,
          },
        ],
        service_requests: [
          { id: 4, pass_principal_id: 7, subject: 'История', status: 'new' },
        ],
        service_request_messages: [
          {
            id: 3,
            request_id: 4,
            author_type: 'customer',
            message_text: 'Историческое сообщение',
            created_at: '2099-10-01 10:00:00',
          },
        ],
      },
    };
    await migration.import(bundle);
    await migration.import(bundle);
    expect(
      (await store.collection('hours_accounts').findOne({}))?.balance_min,
    ).toBe(540);
    expect(await store.collection('hours_ledger').countDocuments()).toBe(1);
    expect((await migration.verify(bundle)).ok).toBe(true);
    expect(await store.nextId('bookings')).toBe(43);
    await store
      .collection('hours_accounts')
      .updateOne({}, { $set: { balance_min: 539 } });
    expect((await migration.verify(bundle)).differences.length).toBeGreaterThan(
      0,
    );
    await store
      .collection('settings')
      .updateOne({ key: 'ownership' }, { $set: { ever_opened: true } });
    await expect(migration.import(bundle)).rejects.toMatchObject({
      response: { error: { code: 'import_after_cutover' } },
    });
  });
  it('replays attachment uploads without publishing another GridFS file', async () => {
    const input = {
      name: 'one.txt',
      base64: Buffer.from('one').toString('base64'),
    };
    const [a, b] = await Promise.all([
      support.upload(resident, input, 'same-upload'),
      support.upload(resident, input, 'same-upload'),
    ]);
    expect(a.attachment_id).toBe(b.attachment_id);
    expect(await store.collection('attachments').countDocuments()).toBe(1);
    expect(
      await connection
        .db!.collection('mstyle_ops_files.files')
        .countDocuments(),
    ).toBe(1);
    await store
      .collection('settings')
      .updateOne({ key: 'ownership' }, { $set: { mode: 'paused' } });
    await expect(
      support.upload(resident, input, 'paused-upload'),
    ).rejects.toMatchObject({ status: 503 });
  });
  it('does not mark a changed booking fully paid on a late provider response', async () => {
    const a = await bookings.create(
      resident,
      { ...input, payment_method: 'card_online' },
      'late-payment',
    );
    await store
      .collection('bookings')
      .updateOne(
        { id: a.booking.id },
        { $set: { total_amount_minor: 200000 } },
      );
    await store.collection('payments').insertOne({
      id: 1,
      booking_id: a.booking.id,
      provider: 'yookassa',
      provider_payment_id: 'late-payment-1',
      amount_minor: 100000,
      status: 'pending',
    });
    jest.spyOn(payments as any, 'gateway').mockResolvedValue({
      id: 'late-payment-1',
      status: 'succeeded',
      amount: { value: '1000.00', currency: 'RUB' },
    });
    await payments.checkPayment('late-payment-1');
    expect(
      (await store.collection('bookings').findOne({ id: a.booking.id }))
        ?.payment_status,
    ).toBe('unpaid');
    expect(
      await store.collection('hours_ledger').countDocuments({ type: 'debit' }),
    ).toBe(0);
  });
  it('keeps a paid guest conflict out of occupied intervals until it is resolved', async () => {
    await bookings.create(
      resident,
      { ...input, writeoff_min: 0 },
      'resident-first',
    );
    const guest = await bookings.create(
      admin,
      {
        ...input,
        profile_id: undefined,
        snapshot_id: undefined,
        writeoff_min: 0,
        guest: { name: 'Гость', phone: '+79990000000' },
      },
      'guest-conflict',
    );
    const paid = await bookings.action(
      admin,
      guest.booking.id,
      'mark-paid',
      { revision: 1 },
      'guest-cash',
    );
    expect(paid.booking.status).toBe('awaiting_resolution');
    expect(bookingNeedsAction(paid.booking)).toBe(true);
    await expect(
      bookings.action(
        admin,
        guest.booking.id,
        'resolve-attention',
        { revision: 2, reason: 'Просто скрыть' },
        'hide-conflict',
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'conflict_unresolved' } },
    });
    expect((await bookings.conflicts(1, input.segments)).length).toBe(1);
  });
  it('applies a quota change against spent hours and journals it once', async () => {
    await bookings.create(resident, input, 'quota-booking');
    await store
      .canonical('profiles')
      .updateOne(
        { profileId: 'prf_test' },
        { $set: { 'memberPolicy.residentHoursMonthlyQuotaMin': 900 } },
      );
    const a = await hours.read(resident, 'prf_test');
    expect(a.account?.balance_min).toBe(870);
    await hours.read(resident, 'prf_test');
    expect(
      await store
        .collection('hours_ledger')
        .countDocuments({ type: 'policy_change' }),
    ).toBe(1);
  });
  it('imports a legacy guest snapshot repeatably without creating a user', async () => {
    await store
      .collection('settings')
      .updateOne({ key: 'ownership' }, { $set: { mode: 'paused' } });
    const migration = new OperationsMigration(store, secret);
    const bundle: any = {
      environment: 'local',
      created_at: '2026-09-22T10:00:00Z',
      owner_mode: 'paused',
      export_id: 'legacy-guest',
      digest: 'legacy',
      attachments: [],
      tables: {
        bookings: [
          {
            id: 1,
            source: 'guest',
            status: 'guest_request',
            payment_method: 'cash',
            room_id: 1,
            date: '2026-10-01',
            start_minute: 600,
            end_minute: 660,
            duration_min: 60,
            legacy_snapshot: {
              type: 'individual',
              name: 'Гость из архива',
              phone: '+79990000000',
            },
          },
        ],
      },
    };
    await migration.import(bundle);
    await migration.import(bundle);
    expect((await migration.verify(bundle)).ok).toBe(true);
    const booking = await bookings.detail(admin, 1);
    expect(booking.booking.requester.name).toBe('Гость из архива');
    expect(await store.canonical('guest_parties').countDocuments()).toBe(1);
    expect(await store.canonical('identities').countDocuments()).toBe(1);
  });
  it('recovers a timed-out payment creation from a provider-verified webhook', async () => {
    const a = await bookings.create(
      resident,
      { ...input, payment_method: 'card_online' },
      'ambiguous-payment',
    );
    jest
      .spyOn(payments, 'paymentConfig')
      .mockResolvedValue({ enabled: true, capture: true });
    const gateway = jest
      .spyOn(payments as any, 'gateway')
      .mockRejectedValueOnce(new Error('timeout'));
    await expect(payments.createPayment(a.booking.id)).rejects.toThrow(
      'timeout',
    );
    expect(await store.collection('payment_intents').countDocuments()).toBe(1);
    gateway.mockResolvedValue({
      id: 'recovered-payment',
      status: 'succeeded',
      amount: { value: '1000.00', currency: 'RUB' },
      metadata: {
        booking_id: String(a.booking.id),
        pass_operation: a.booking.pass_operation_ref,
      },
    });
    await payments.checkPayment('recovered-payment');
    await payments.checkPayment('recovered-payment');
    expect(
      (await bookings.detail(resident, a.booking.id)).booking.payment_status,
    ).toBe('paid');
    expect(await store.collection('payments').countDocuments()).toBe(1);
    expect(
      await store.collection('hours_ledger').countDocuments({ type: 'debit' }),
    ).toBe(1);
  });
  it('never re-creates an uncertain provider payment beyond its idempotency window', async () => {
    const a = await bookings.create(
      resident,
      { ...input, payment_method: 'card_online' },
      'expired-payment-key',
    );
    jest
      .spyOn(payments, 'paymentConfig')
      .mockResolvedValue({ enabled: true, capture: true });
    const gateway = jest
      .spyOn(payments as any, 'gateway')
      .mockRejectedValue(new Error('timeout'));
    await expect(payments.createPayment(a.booking.id)).rejects.toThrow(
      'timeout',
    );
    await store
      .collection('payment_intents')
      .updateOne(
        {},
        { $set: { first_requested_at: new Date(Date.now() - 25 * 3600000) } },
      );
    gateway.mockClear();
    await expect(payments.createPayment(a.booking.id)).rejects.toMatchObject({
      response: { error: { code: 'payment_reconciliation_required' } },
    });
    expect(gateway).not.toHaveBeenCalled();
    expect(
      (await bookings.detail(resident, a.booking.id)).booking
        .requires_attention,
    ).toBe(true);
  });
  it('preserves prior hour debits on transfer and charges only added hours on extension', async () => {
    const a = await bookings.create(resident, input, 'change-hours-create');
    const paid = await bookings.action(
      admin,
      a.booking.id,
      'mark-paid',
      { revision: 1 },
      'change-hours-paid',
    );
    const confirmed = await bookings.action(
      admin,
      a.booking.id,
      'confirm',
      { revision: paid.booking.revision },
      'change-hours-confirm',
    );
    const moved = await bookings.change(
      resident,
      a.booking.id,
      'transfer',
      {
        revision: confirmed.booking.revision,
        payment_method: 'cash',
        writeoff_min: 0,
        segments: [{ date: '2099-10-21', start_minute: 600, end_minute: 660 }],
      },
      'change-hours-transfer',
    );
    expect(moved.booking.hours_debited_min).toBe(30);
    expect(moved.booking.payment_status).toBe('paid');
    expect(
      await store.collection('hours_ledger').countDocuments({ type: 'credit' }),
    ).toBe(0);
    const extended = await bookings.change(
      resident,
      a.booking.id,
      'extend',
      {
        revision: moved.booking.revision,
        end_minute: 690,
        payment_method: 'balance',
        writeoff_min: 30,
      },
      'change-hours-extend',
    );
    expect(extended.booking.hours_debited_min).toBe(60);
    expect(extended.booking.total_amount_minor).toBe(100000);
    expect(extended.booking.payment_status).toBe('paid');
    expect(
      (await store.collection('hours_accounts').findOne({}))?.balance_min,
    ).toBe(540);
  });
  it('keeps financial conflicts visible even after cancellation and handles short months', () => {
    expect(
      bookingNeedsAction({ status: 'cancelled', requires_attention: true }),
    ).toBe(true);
    expect(
      bookingNeedsAction({
        status: 'hold',
        payment_method: 'card_online',
        payment_status: 'unpaid',
      }),
    ).toBe(false);
    expect(monthlyPeriod('2028-02-29', 31)).toEqual({
      start: '2028-02-29',
      end: '2028-03-30',
      next: '2028-03-31',
    });
  });
});
