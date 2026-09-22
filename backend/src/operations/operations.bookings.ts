import { Injectable } from '@nestjs/common';
import { ClientSession } from 'mongodb';
import { randomUUID } from 'crypto';
import { OperationsStore } from './operations.store';
import { OperationsIdentity } from './operations.identity';
import { OperationsHours } from './operations.hours';
import { OperationsCatalog } from './operations.catalog';
import { MstyleV2Config } from '../integrations/mstyle-v2/mstyle-v2.config';
import { Ids } from '../integrations/mstyle-v2/mstyle-v2.ids';
import {
  blocksAvailability,
  bookingNeedsAction,
  BOOKING_STATUSES,
  checkVersion,
  dateValue,
  fail,
  integer,
  OperationsActor,
  paymentPolicy,
  parseMoscow,
  requirePermission,
  Segment,
  sqlNow,
  textValue,
} from './operations.rules';

const METHODS = [
  'cash',
  'invoice',
  'postpay',
  'card_online',
  'qr_code',
  'balance',
];
@Injectable()
export class OperationsBookings {
  constructor(
    readonly store: OperationsStore,
    readonly identities: OperationsIdentity,
    readonly hours: OperationsHours,
    readonly catalog: OperationsCatalog,
    private readonly config: MstyleV2Config,
  ) {}

  private async attendees(
    raw: unknown,
    parentId: string,
    session: ClientSession,
  ) {
    if (raw == null) return [];
    if (!Array.isArray(raw) || raw.length > 50)
      fail('validation_error', 'Некорректный список участников.', 400);
    const items: any[] = [];
    for (const item of raw) {
      const guest = await this.store
        .canonical('guest_parties')
        .findOne({ guestPartyId: item.guest_party_id }, { session });
      const snapshot = await this.identities.snapshot(
        item.snapshot?.snapshotId || item.snapshot_id,
        'guest_party',
        item.guest_party_id,
      );
      const parent = String(guest?.declaration?.parentSnapshotId || '').replace(
        /^(rps|gps)_/,
        'snp_',
      );
      if (parent !== parentId.replace(/^(rps|gps)_/, 'snp_'))
        fail('attendee_invalid', 'Участник не относится к заявке.', 403);
      const contact = this.identities.contact(snapshot);
      items.push({
        ...contact,
        guest_party_id: guest!.guestPartyId,
        snapshot_id: snapshot.snapshotId,
      });
    }
    return items;
  }
  async paidAmount(id: number, session?: ClientSession) {
    return (
      await this.store
        .collection('payments')
        .find({ booking_id: id, status: 'paid' }, { session })
        .toArray()
    ).reduce((n, p) => n + Number(p.amount_minor || 0), 0);
  }
  async list(actor: OperationsActor, query: any = {}) {
    const filter: any = {};
    if (actor.kind === 'admin') requirePermission(actor, 'bookings.manage');
    else if (actor.kind === 'resident')
      filter.$or = [
        { owner_subject: actor.subject },
        { profile_id: { $in: await this.identities.profileIds(actor) } },
      ];
    else if (actor.kind === 'guest') {
      filter.pass_party_type = 'guest_party';
      filter.pass_party_id = actor.guestPartyId;
    } else fail('forbidden', 'Нет доступа.', 403);
    if (query.room_id) filter.room_id = integer(query.room_id, 'room_id', 1);
    if (query.date) filter['segments.date'] = dateValue(query.date);
    if (query.status) filter.status = textValue(query.status, 32);
    if (query.payment_status)
      filter.payment_status = textValue(query.payment_status, 32);
    if (query.payment_method)
      filter.payment_method = textValue(query.payment_method, 32);
    if (query.party_type)
      filter.pass_party_type = textValue(query.party_type, 32);
    if (query.bc)
      filter['room.business_center.id'] = integer(query.bc, 'bc', 1);
    if (query.room_type) filter['room.type'] = textValue(query.room_type, 32);
    let rows = await this.store
      .collection('bookings')
      .find(filter)
      .sort({ created_at: -1, id: -1 })
      .toArray();
    if (query.tab === 'pending' || query.needs_action === '1')
      rows = rows.filter(bookingNeedsAction);
    if (query.tab === 'conflicts')
      rows = rows.filter((row) => row.requires_attention);
    if (query.tab === 'history')
      rows = rows.filter((row) =>
        ['confirmed', 'paid', 'cancelled'].includes(row.status),
      );
    const search = textValue(query.search, 200).toLocaleLowerCase('ru');
    const presented: any[] = [];
    for (const row of rows) {
      const item = await this.present(row);
      if (
        !search ||
        [row.number, item.requester.name, item.requester.phone, row.room?.title]
          .join(' ')
          .toLocaleLowerCase('ru')
          .includes(search)
      )
        presented.push(item);
    }
    const page = integer(query.page || 1, 'page', 1);
    const perPage = integer(query.per_page || 20, 'per_page', 1, 100);
    return {
      items: presented.slice((page - 1) * perPage, page * perPage),
      total: presented.length,
      page,
      per_page: perPage,
      statuses: BOOKING_STATUSES,
    };
  }
  async present(row: any, session?: ClientSession) {
    const publicRow = { ...row };
    delete publicRow._id;
    delete publicRow.payment_token;
    return {
      ...publicRow,
      needs_action: bookingNeedsAction(row),
      status_label: BOOKING_STATUSES[row.status] || row.status,
      requester: await this.identities.requester(row, session),
      guest: row.pass_party_type === 'guest_party',
    };
  }
  async detail(actor: OperationsActor, id: number, session?: ClientSession) {
    const row = await this.store
      .collection('bookings')
      .findOne({ id }, { session });
    await this.identities.assertBooking(actor, row, session);
    const payments = await this.store
      .collection('payments')
      .find({ booking_id: id }, { session, projection: { _id: 0 } })
      .sort({ id: 1 })
      .toArray();
    const invoice = row.invoice_id
      ? await this.store
          .collection('invoices')
          .findOne({ id: row.invoice_id }, { session, projection: { _id: 0 } })
      : null;
    const history = await this.store
      .collection('events')
      .find(
        { entity: 'booking', entity_id: id },
        { session, projection: { _id: 0 } },
      )
      .sort({ id: 1 })
      .toArray();
    const account = row.resource_profile_id
      ? await this.store
          .collection('hours_accounts')
          .findOne(
            { resource_profile_id: row.resource_profile_id },
            { session, projection: { _id: 0 } },
          )
      : null;
    return {
      booking: await this.present(row, session),
      payments,
      invoice,
      history,
      hours_account: account,
      refundable_hours_min: await this.hours.refundable(row, session!),
    };
  }
  async lockDays(roomId: number, segments: Segment[], session: ClientSession) {
    for (const date of [...new Set(segments.map((s) => s.date))].sort()) {
      await this.store
        .collection('room_days')
        .updateOne(
          { room_id: roomId, date },
          { $inc: { revision: 1 } },
          { upsert: true, session },
        );
    }
  }
  async conflicts(
    roomId: number,
    segments: Segment[],
    exceptId = 0,
    session?: ClientSession,
  ) {
    const rows = await this.store
      .collection('bookings')
      .find(
        {
          room_id: roomId,
          id: { $ne: exceptId },
          'segments.date': { $in: segments.map((s) => s.date) },
        },
        { session },
      )
      .toArray();
    return rows.filter(
      (row) =>
        blocksAvailability(row) &&
        row.segments.some((busy: Segment) =>
          segments.some(
            (s) =>
              s.date === busy.date &&
              s.start_minute < busy.end_minute &&
              s.end_minute > busy.start_minute,
          ),
        ),
    );
  }
  async assertAvailable(
    roomId: number,
    segments: Segment[],
    exceptId: number,
    session: ClientSession,
  ) {
    await this.lockDays(roomId, segments, session);
    if ((await this.conflicts(roomId, segments, exceptId, session)).length)
      fail(
        'slot_conflict',
        'Выбранное время уже занято. Обновите доступные интервалы.',
      );
  }
  async availability(roomId: number, date: string) {
    dateValue(date);
    const catalog = await this.catalog.get();
    const room = catalog.rooms.find((r: any) => r.id === roomId);
    if (!room) fail('room_not_found', 'Помещение не найдено.', 404);
    const rows = await this.store
      .collection('bookings')
      .find({ room_id: roomId, 'segments.date': date })
      .toArray();
    const ranges = rows
      .filter((row) => blocksAvailability(row))
      .flatMap((row) =>
        row.segments
          .filter((s: Segment) => s.date === date)
          .map((s: Segment) => ({
            ...s,
            slot_state:
              row.status === 'blocked'
                ? 'blocked'
                : row.status === 'hold'
                  ? 'hold'
                  : row.payment_status === 'paid'
                    ? 'paid'
                    : 'reserved',
            hold_until: row.expires_at || null,
          })),
      );
    const slots: any[] = [];
    const cfg = room.config;
    for (
      let start = cfg.work_start_minute;
      start < cfg.work_end_minute;
      start += cfg.slot_step_min
    ) {
      const end = Math.min(start + cfg.slot_step_min, cfg.work_end_minute);
      const range = ranges.find(
        (r) => start < r.end_minute && end > r.start_minute,
      );
      slots.push({
        start_minute: start,
        end_minute: end,
        state: range?.slot_state || 'free',
        hold_until: range?.hold_until || null,
      });
    }
    return {
      room_id: roomId,
      date,
      room,
      slots,
      busy_ranges: ranges,
      catalog_version: catalog.version,
    };
  }
  async quote(actor: OperationsActor, input: any) {
    const quote = this.catalog.quote(await this.catalog.get(), input);
    if (input.profile_id) {
      const { resource } = await this.identities.profile(
        actor,
        input.profile_id,
      );
      const account = await this.store
        .collection('hours_accounts')
        .findOne({ resource_profile_id: resource.profileId });
      return {
        ...quote,
        available_balance_min: account ? this.hours.available(account) : 0,
      };
    }
    return quote;
  }
  private initialPayment(method: string, amount: number, guest: boolean) {
    if (guest)
      return {
        status: 'guest_request',
        payment_status: 'unpaid',
        payment_method: ['cash', 'invoice'].includes(method)
          ? method
          : 'invoice',
        expires_at: null,
      };
    if (amount === 0)
      return {
        status: 'awaiting_confirmation',
        payment_status: 'paid',
        payment_method: method,
        expires_at: null,
      };
    if (['card_online', 'qr_code'].includes(method))
      return {
        status: 'hold',
        payment_status: 'unpaid',
        payment_method: method,
        expires_at: sqlNow(new Date(Date.now() + 15 * 60000)),
      };
    return {
      status: 'awaiting_payment',
      payment_status: method === 'postpay' ? 'postpay' : 'unpaid',
      payment_method: method,
      expires_at: null,
    };
  }
  async create(actor: OperationsActor, input: any, key: string) {
    if (actor.kind === 'admin') requirePermission(actor, 'bookings.manage');
    const receipt = await this.store.receipt(
      actor,
      key,
      'booking.create',
      input,
    );
    if (receipt) return receipt.result;
    if (
      ['postpay', 'cash', 'invoice'].includes(input.payment_method) &&
      input.profile_id
    ) {
      const policy = await this.store
        .collection('profile_policies')
        .findOne({ profile_id: input.profile_id });
      if (policy?.prepay_required)
        fail('prepay_required', 'Для этого профиля требуется предоплата.');
    }
    if (!METHODS.includes(input.payment_method))
      fail('validation_error', 'Выберите способ оплаты.', 400);
    const catalog = await this.catalog.get();
    const quote = this.catalog.quote(catalog, input);
    if (
      quote.segments.some(
        (s) =>
          parseMoscow(
            s.date +
              ' ' +
              String(Math.floor(s.start_minute / 60)).padStart(2, '0') +
              ':' +
              String(s.start_minute % 60).padStart(2, '0') +
              ':00',
          ) <= Date.now(),
      )
    )
      fail(
        'slot_in_past',
        'Нельзя оформить бронирование на прошедшее время.',
        400,
      );
    if (
      input.pricing_fingerprint &&
      input.pricing_fingerprint !== quote.pricing_fingerprint
    )
      fail('price_changed', 'Стоимость изменилась. Обновите расчёт.');
    let partyPromise: ReturnType<OperationsIdentity['party']> | undefined;
    return this.store.command(
      actor,
      key,
      'booking.create',
      input,
      async (session) => {
        const { requester, ...party } =
          actor.kind === 'admin' && input.guest && !input.guest_party_id
            ? await this.identities.declaredGuest(actor, input.guest, session)
            : await (partyPromise ||= this.identities.party(actor, input));
        void requester; // Contacts are read from the immutable snapshot.
        if (quote.writeoff_min && !party.resource_profile_id)
          fail(
            'insufficient_balance',
            'Резидентские часы доступны только резидентам.',
            400,
          );
        const id = await this.store.nextId('bookings', session);
        const payment = this.initialPayment(
          input.payment_method,
          quote.total_amount_minor,
          party.pass_party_type === 'guest_party',
        );
        if (payment.status !== 'guest_request')
          await this.assertAvailable(quote.room_id, quote.segments, 0, session);
        const operationRef = {
          sourceSystem: 'mstyle',
          environment: this.config.environment(),
          operationType: 'booking',
          operationId: 'pass-' + id,
        };
        await this.store.canonical('snapshot_bindings').insertOne(
          {
            bindingId: Ids.binding(),
            snapshotId: party.pass_snapshot_id,
            operationRef,
            bindingRevision: 1,
            status: 'bound',
            boundAt: new Date().toISOString(),
          },
          { session },
        );
        const now = sqlNow();
        const row = {
          id,
          number: 'B-' + String(id).padStart(5, '0'),
          ...quote,
          ...party,
          ...payment,
          client_profile_id: input.client_profile_id || null,
          pass_principal_id: input.pass_principal_id || null,
          pass_operation_ref: operationRef.operationId,
          operation_ref: operationRef,
          source: actor.kind === 'admin' ? 'admin' : 'site',
          comment_client: textValue(input.comment_client, 5000),
          comment_admin: '',
          attendees: await this.attendees(
            input.attendees,
            party.pass_snapshot_id,
            session,
          ),
          payment_policy: paymentPolicy(
            payment.payment_method,
            now,
            quote.date,
            quote.start_minute,
            catalog.invoice_settings,
          ),
          invoice_id: null,
          revision: 1,
          created_at: now,
          updated_at: now,
          paid_at: payment.payment_status === 'paid' ? now : null,
          hours_debited_min: 0,
          payment_token: randomUUID(),
          requires_attention: false,
          meta_json: '{}',
        };
        const guests = [
          ...row.attendees.map((a) => ({
            id: a.guest_party_id,
            snapshotId: a.snapshot_id,
            participant: true,
          })),
          ...(party.pass_party_type === 'guest_party'
            ? [
                {
                  id: party.pass_party_id,
                  snapshotId: party.pass_snapshot_id,
                  participant: false,
                },
              ]
            : []),
        ];
        for (const guest of guests) {
          const current = await this.store
            .canonical('guest_parties')
            .findOne({ guestPartyId: guest.id }, { session });
          if (current?.operationLink)
            fail('guest_already_booked', 'Гость уже привязан к другой заявке.');
          const operationLink = {
            schemaVersion: '2.0',
            id: Ids.operationLink(),
            operationRef,
            snapshotId: guest.snapshotId,
            ...(guest.participant
              ? {
                  participantRole: 'participant',
                  parentSnapshotId: party.pass_snapshot_id,
                }
              : {}),
            revision: 1,
            createdAt: new Date().toISOString(),
            eventIds: [],
          };
          await this.store.canonical('guest_parties').updateOne(
            { guestPartyId: guest.id },
            {
              $set: { status: 'booked', operationLink },
              $inc: { revision: 1 },
            },
            { session },
          );
        }
        const deferredHours = payment.status === 'hold';
        if (quote.writeoff_min && !deferredHours) {
          await this.hours.change(
            party.resource_profile_id!,
            -quote.writeoff_min,
            actor,
            'Списание при оформлении бронирования',
            id,
            session,
          );
          row.hours_debited_min = quote.writeoff_min;
        } else if (quote.writeoff_min) {
          const account = await this.hours.ensure(
            party.resource_profile_id!,
            session,
          );
          if (this.hours.available(account) < quote.writeoff_min)
            fail('insufficient_balance', 'Недостаточно резидентских часов.');
        }
        await this.store.collection('bookings').insertOne(row, { session });
        if (payment.status === 'hold')
          await this.store.enqueue(
            'payment-create:' + id,
            'payment.create',
            { booking_id: id },
            session,
          );
        if (
          payment.payment_method === 'invoice' &&
          payment.status !== 'guest_request' &&
          quote.total_amount_minor > 0
        )
          await this.store.enqueue(
            'invoice-create:' + id,
            'invoice.create',
            { booking_id: id },
            session,
          );
        await this.store.event(
          'booking',
          id,
          'booking.created',
          actor,
          {
            status: row.status,
            amount_minor: row.total_amount_minor,
            hours_min: row.hours_debited_min,
          },
          session,
        );
        return {
          booking: await this.present(row, session),
          payment: {
            flow:
              row.status === 'hold'
                ? 'payment_gateway'
                : row.payment_status === 'paid'
                  ? 'success'
                  : 'manual_confirmation',
            pending: row.status === 'hold',
            booking_id: id,
            payment_token: row.payment_token,
          },
        };
      },
    );
  }
  async action(
    actor: OperationsActor,
    id: number,
    action: string,
    input: any,
    key: string,
  ) {
    requirePermission(
      actor,
      action === 'mark-paid' ? 'bookings.finance' : 'bookings.manage',
    );
    return this.store.command(
      actor,
      key,
      'booking.' + action + ':' + id,
      input,
      async (session) => {
        const row = await this.store
          .collection('bookings')
          .findOne({ id }, { session });
        await this.identities.assertBooking(actor, row, session);
        checkVersion(row, input.revision);
        if (
          row.status === 'cancelled' &&
          !['cancel', 'resolve-attention', 'comment'].includes(action)
        )
          fail('invalid_state', 'Бронирование отменено.');
        if (action === 'cancel')
          return this.cancelInTransaction(
            actor,
            row,
            textValue(input.reason, 1000, true),
            session,
          );
        if (action === 'confirm') {
          if (row.payment_method !== 'postpay' && row.payment_status !== 'paid')
            fail('payment_required', 'Сначала отметьте оплату.');
          if (row.writeoff_min > (await this.hours.refundable(row, session)))
            fail(
              'hours_required',
              'Сначала спишите недостающие резидентские часы.',
            );
          if (row.status === 'blocked')
            fail('invalid_state', 'Блокировку нельзя подтвердить.');
          await this.assertAvailable(row.room_id, row.segments, id, session);
          await this.store.collection('bookings').updateOne(
            { id },
            {
              $set: {
                status: 'confirmed',
                expires_at: null,
                requires_attention: false,
                updated_at: sqlNow(),
              },
              $inc: { revision: 1 },
            },
            { session },
          );
        } else if (action === 'mark-paid') {
          if (!['cash', 'invoice', 'postpay'].includes(row.payment_method))
            fail(
              'invalid_state',
              'Онлайн-оплату подтверждает платёжный провайдер.',
            );
          if (row.payment_status !== 'paid') {
            await this.store.collection('payments').insertOne(
              {
                id: await this.store.nextId('payments', session),
                booking_id: id,
                provider: 'admin_manual',
                payment_method: row.payment_method,
                amount_minor: Math.max(
                  0,
                  row.total_amount_minor - (await this.paidAmount(id, session)),
                ),
                currency: 'RUB',
                status: 'paid',
                paid_at: sqlNow(),
                note: textValue(input.note, 1000),
                actor_ref: actor.ref,
              },
              { session },
            );
            await this.lockDays(row.room_id, row.segments, session);
            const conflict =
              (await this.conflicts(row.room_id, row.segments, id, session))
                .length > 0;
            await this.store.collection('bookings').updateOne(
              { id },
              {
                $set: {
                  payment_status: 'paid',
                  paid_at: sqlNow(),
                  expires_at: null,
                  status: conflict
                    ? 'awaiting_resolution'
                    : row.status === 'confirmed'
                      ? 'confirmed'
                      : 'awaiting_confirmation',
                  requires_attention: conflict,
                  attention_reason: conflict
                    ? 'Оплата принята, но выбранное время уже занято.'
                    : '',
                  updated_at: sqlNow(),
                },
                $inc: { revision: 1 },
              },
              { session },
            );
            if (row.invoice_id)
              await this.store
                .collection('invoices')
                .updateOne(
                  { id: row.invoice_id },
                  { $set: { status: 'paid', paid_at: sqlNow() } },
                  { session },
                );
          }
        } else if (action === 'resolve-attention') {
          requirePermission(actor, 'bookings.finance');
          const reason = textValue(input.reason, 1000, true);
          if (row.status === 'awaiting_resolution')
            fail(
              'conflict_unresolved',
              'Сначала измените время или отмените заявку.',
            );
          if (
            row.status !== 'cancelled' &&
            row.writeoff_min > (await this.hours.refundable(row, session))
          )
            fail('hours_required', 'Сначала исправьте списание часов.');
          await this.store.collection('bookings').updateOne(
            { id },
            {
              $set: {
                requires_attention: false,
                attention_resolution: reason,
                updated_at: sqlNow(),
              },
              $inc: { revision: 1 },
            },
            { session },
          );
        } else if (action === 'comment') {
          await this.store.collection('bookings').updateOne(
            { id },
            {
              $set: {
                comment_admin: textValue(input.comment_admin, 5000),
                updated_at: sqlNow(),
              },
              $inc: { revision: 1 },
            },
            { session },
          );
        } else fail('not_found', 'Действие не найдено.', 404);
        await this.store.event(
          'booking',
          id,
          'booking.' + action,
          actor,
          { previous_status: row.status },
          session,
        );
        return this.detail(actor, id, session);
      },
    );
  }
  async cancelInTransaction(
    actor: OperationsActor,
    row: any,
    reason: string,
    session: ClientSession,
  ) {
    if (row.status === 'cancelled') return this.detail(actor, row.id, session);
    await this.lockDays(row.room_id, row.segments, session);
    const refunded = await this.hours.refund(
      row,
      actor,
      'Отмена бронирования: ' + reason,
      session,
    );
    await this.store.collection('bookings').updateOne(
      { id: row.id },
      {
        $set: {
          status: 'cancelled',
          expires_at: null,
          cancellation_reason: reason,
          hours_debited_min: 0,
          updated_at: sqlNow(),
          requires_attention: (await this.paidAmount(row.id, session)) > 0,
        },
        $inc: { revision: 1 },
      },
      { session },
    );
    await this.store.event(
      'booking',
      row.id,
      'booking.cancelled',
      actor,
      {
        reason,
        hours_refunded_min: refunded,
        monetary_refund_performed: false,
      },
      session,
    );
    return this.detail(actor, row.id, session);
  }
  async customerCancel(
    actor: OperationsActor,
    id: number,
    input: any,
    key: string,
  ) {
    return this.store.command(
      actor,
      key,
      'booking.cancel:' + id,
      input,
      async (session) => {
        const row = await this.store
          .collection('bookings')
          .findOne({ id }, { session });
        await this.identities.assertBooking(actor, row, session);
        if (input.revision != null) checkVersion(row, input.revision);
        if (
          ![
            'hold',
            'guest_request',
            'awaiting_confirmation',
            'awaiting_payment',
            'confirmed',
            'paid',
            'cancelled',
          ].includes(row.status)
        )
          fail('invalid_state', 'Эту бронь нельзя отменить.');
        if (
          actor.kind === 'resident' &&
          row.status !== 'cancelled' &&
          row.segments.every(
            (s: Segment) =>
              parseMoscow(s.date + ' 00:00:00') + s.end_minute * 60000 <=
              Date.now(),
          )
        )
          fail('invalid_state', 'Завершённую бронь нельзя отменить.');
        return this.cancelInTransaction(
          actor,
          row,
          textValue(
            input.reason || input.comment || 'Отмена из личного кабинета',
            1000,
          ),
          session,
        );
      },
    );
  }
  async change(
    actor: OperationsActor,
    id: number,
    kind: 'edit' | 'transfer' | 'extend',
    input: any,
    key: string,
  ) {
    if (actor.kind === 'admin') requirePermission(actor, 'bookings.manage');
    const receipt = await this.store.receipt(
      actor,
      key,
      'booking.' + kind + ':' + id,
      input,
    );
    if (receipt) return receipt.result;
    const original = await this.store.collection('bookings').findOne({ id });
    await this.identities.assertBooking(actor, original);
    const data = {
      ...original,
      ...input,
      profile_id: original.profile_id,
      services: input.services ?? original.services,
    };
    if (kind === 'extend') {
      const segments = original.segments.map((s: any) => ({ ...s }));
      segments[segments.length - 1].end_minute = integer(
        input.end_minute,
        'end_minute',
        segments[segments.length - 1].end_minute + 1,
        1440,
      );
      data.segments = segments;
    }
    if (kind === 'transfer' || kind === 'extend') {
      const duration = data.segments.reduce(
        (sum: number, seg: Segment) => sum + seg.end_minute - seg.start_minute,
        0,
      );
      const extra = Math.max(0, duration - original.duration_min);
      const additional =
        input.payment_method === 'balance'
          ? extra
          : integer(input.writeoff_min || 0, 'writeoff_min', 0, extra);
      data.writeoff_min =
        Math.max(
          0,
          original.hours_debited_min -
            Math.max(0, original.duration_min - duration),
        ) + additional;
      // The cabinet sends hours for the ADDED time, never for the whole booking.
      // Avoid the catalog's full-balance shortcut when only an extension is paid in hours.
      if (data.payment_method === 'balance') data.payment_method = 'cash';
    }
    const catalog = await this.catalog.get();
    const quote = this.catalog.quote(
      catalog,
      kind === 'extend' ? { ...data, services: [] } : data,
    );
    if (kind === 'extend' || kind === 'transfer') {
      // Charge only the positive adjustment, retaining all previously applied prices.
      // A shorter reservation refunds hours; monetary refunds remain a separate decision.
      const extra = Math.max(0, quote.duration_min - original.duration_min);
      const additionalHours = Math.max(
        0,
        quote.writeoff_min - original.hours_debited_min,
      );
      const cfg = quote.room.config;
      const price = (minutes: number) =>
        minutes <= 0
          ? 0
          : cfg.price_unit === 'hour'
            ? Math.round((cfg.price_amount_minor * minutes) / 60)
            : cfg.price_amount_minor;
      const oldQuote =
        kind === 'transfer'
          ? this.catalog.quote(catalog, {
              ...original,
              payment_method: 'cash',
              writeoff_min: 0,
            })
          : null;
      const baseDelta =
        kind === 'extend'
          ? price(extra)
          : Math.max(0, quote.base_amount_minor - oldQuote!.base_amount_minor);
      const paidDelta =
        kind === 'extend'
          ? price(extra - additionalHours)
          : Math.max(0, baseDelta - price(additionalHours));
      const serviceDelta = oldQuote
        ? Math.max(
            0,
            quote.services_amount_minor - oldQuote.services_amount_minor,
          )
        : 0;
      quote.base_amount_minor = original.base_amount_minor + baseDelta;
      quote.services_amount_minor =
        original.services_amount_minor + serviceDelta;
      quote.discount_minor =
        (original.discount_minor || 0) + baseDelta - paidDelta;
      quote.total_amount_minor =
        original.total_amount_minor + paidDelta + serviceDelta;
      if (kind === 'extend') quote.services = original.services;
    }
    if (
      kind !== 'extend' &&
      quote.segments.some(
        (s) =>
          parseMoscow(s.date + ' 00:00:00') + s.start_minute * 60000 <=
          Date.now(),
      )
    )
      fail('slot_in_past', 'Нельзя переносить бронь на прошедшее время.', 400);
    if (
      kind === 'extend' &&
      original.segments.every(
        (s: Segment) =>
          parseMoscow(s.date + ' 00:00:00') + s.end_minute * 60000 <=
          Date.now(),
      )
    )
      fail('invalid_state', 'Завершённую бронь нельзя продлить.');
    if (
      input.pricing_fingerprint &&
      input.pricing_fingerprint !== quote.pricing_fingerprint
    )
      fail('price_changed', 'Стоимость изменилась. Обновите расчёт.');
    return this.store.command(
      actor,
      key,
      'booking.' + kind + ':' + id,
      input,
      async (session) => {
        const row = await this.store
          .collection('bookings')
          .findOne({ id }, { session });
        await this.identities.assertBooking(actor, row, session);
        checkVersion(row, input.revision ?? original.revision);
        if (
          ![
            'confirmed',
            'paid',
            'awaiting_payment',
            'awaiting_confirmation',
            'awaiting_resolution',
          ].includes(row.status)
        )
          fail('invalid_state', 'Бронирование сейчас нельзя изменить.');
        await this.lockDays(row.room_id, row.segments, session);
        await this.assertAvailable(quote.room_id, quote.segments, id, session);
        const hoursDelta =
          quote.writeoff_min - (await this.hours.refundable(row, session));
        if (hoursDelta && !row.resource_profile_id)
          fail('insufficient_balance', 'У гостя нет резидентских часов.');
        if (hoursDelta > 0)
          await this.identities.assertCanSpendHours(
            actor,
            row.profile_id,
            session,
          );
        if (hoursDelta > 0)
          await this.hours.change(
            row.resource_profile_id,
            -hoursDelta,
            actor,
            'Доплата часами при изменении бронирования',
            id,
            session,
          );
        if (hoursDelta < 0) {
          const refund = Math.min(
            -hoursDelta,
            await this.hours.refundable(row, session),
          );
          if (refund)
            await this.hours.change(
              row.resource_profile_id,
              refund,
              actor,
              'Возврат часов при изменении бронирования',
              id,
              session,
            );
        }
        const received = await this.paidAmount(id, session);
        const due = quote.total_amount_minor > received;
        const method = input.payment_method || row.payment_method;
        if (
          ['postpay', 'cash', 'invoice'].includes(method) &&
          (
            await this.store
              .collection('profile_policies')
              .findOne({ profile_id: row.profile_id }, { session })
          )?.prepay_required
        )
          fail('prepay_required', 'Для этого профиля требуется предоплата.');
        if (
          due &&
          method === 'invoice' &&
          !(
            await this.store
              .canonical('profiles')
              .findOne({ profileId: row.profile_id }, { session })
          )?.privateDataComplete
        )
          fail(
            'profile_data_required',
            'Для счёта заполните данные резидента.',
          );
        if (due && method === 'balance')
          fail(
            'insufficient_balance',
            'Часы покрывают только время. Для денежного остатка выберите наличные или счёт.',
          );
        if (!METHODS.includes(method))
          fail('validation_error', 'Выберите способ оплаты.', 400);
        // Changes in the cabinet remain manual requests, matching the previous flow.
        if (due && ['card_online', 'qr_code'].includes(method))
          fail(
            'payment_method_required',
            'Для доплаты при изменении выберите наличные или счёт.',
            400,
          );
        await this.store.collection('bookings').updateOne(
          { id },
          {
            $set: {
              ...quote,
              hours_debited_min: quote.writeoff_min,
              status: !due
                ? row.status === 'awaiting_resolution'
                  ? 'awaiting_confirmation'
                  : row.status
                : 'awaiting_payment',
              payment_status: due
                ? method === 'postpay'
                  ? 'postpay'
                  : 'unpaid'
                : 'paid',
              payment_method: method,
              requires_attention: received > quote.total_amount_minor,
              payment_policy: paymentPolicy(
                method,
                sqlNow(),
                quote.date,
                quote.start_minute,
                (
                  await this.store
                    .collection('settings')
                    .findOne({ key: 'invoices' }, { session })
                )?.rules,
              ),
              comment_client: textValue(
                input.comment_client ?? row.comment_client,
                5000,
              ),
              updated_at: sqlNow(),
            },
            $inc: { revision: 1 },
          },
          { session },
        );
        if (due && method === 'invoice')
          await this.store.enqueue(
            'invoice-change:' + id + ':' + (row.revision + 1),
            'invoice.create',
            { booking_id: id },
            session,
          );
        await this.store.event(
          'booking',
          id,
          'booking.' + kind,
          actor,
          {
            before: {
              room_id: row.room_id,
              segments: row.segments,
              amount_minor: row.total_amount_minor,
            },
            after: {
              room_id: quote.room_id,
              segments: quote.segments,
              amount_minor: quote.total_amount_minor,
            },
          },
          session,
        );
        return this.detail(actor, id, session);
      },
    );
  }
  async repeat(actor: OperationsActor, id: number, input: any, key: string) {
    const original = await this.store.collection('bookings').findOne({ id });
    await this.identities.assertBooking(actor, original);
    // A repeat is a new operation with a fresh snapshot and current resource owner.
    return this.create(
      actor,
      {
        room_id: original.room_id,
        services: original.services,
        profile_id: original.profile_id,
        payment_method: original.payment_method,
        comment_client: original.comment_client,
        ...input,
        snapshot_id: undefined,
      },
      key,
    );
  }
  async block(actor: OperationsActor, input: any, key: string) {
    requirePermission(actor, 'bookings.manage');
    const quote = this.catalog.quote(await this.catalog.get(), {
      ...input,
      payment_method: 'cash',
      services: [],
      writeoff_min: 0,
    });
    return this.store.command(
      actor,
      key,
      'booking.block',
      input,
      async (session) => {
        await this.assertAvailable(quote.room_id, quote.segments, 0, session);
        const id = await this.store.nextId('bookings', session);
        await this.store.collection('bookings').insertOne(
          {
            id,
            number: 'BLOCK-' + id,
            ...quote,
            status: 'blocked',
            payment_status: 'unpaid',
            payment_method: '',
            comment_admin: textValue(input.reason, 1000, true),
            revision: 1,
            created_at: sqlNow(),
            updated_at: sqlNow(),
            legacy_requester: { name: 'Блокировка', phone: '', email: '' },
          },
          { session },
        );
        await this.store.event(
          'booking',
          id,
          'booking.blocked',
          actor,
          {},
          session,
        );
        return this.detail(actor, id, session);
      },
    );
  }
}
