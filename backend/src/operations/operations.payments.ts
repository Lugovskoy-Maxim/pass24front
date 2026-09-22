import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ClientSession } from 'mongodb';
import { randomUUID, timingSafeEqual } from 'crypto';
import { OperationsStore } from './operations.store';
import { OperationsBookings } from './operations.bookings';
import { OperationsCatalog } from './operations.catalog';
import { MstyleV2Config } from '../integrations/mstyle-v2/mstyle-v2.config';
import {
  decryptJson,
  encryptJson,
} from '../integrations/mstyle-v2/mstyle-v2.crypto';
import {
  checkVersion,
  fail,
  OperationsActor,
  paymentPolicy,
  parseMoscow,
  requirePermission,
  sqlNow,
  textValue,
} from './operations.rules';
import { MailService } from '../mail/mail.service';

const SYSTEM: OperationsActor = { ref: 'system:operations', kind: 'system' };
@Injectable()
export class OperationsPayments implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(
    readonly store: OperationsStore,
    readonly bookings: OperationsBookings,
    private readonly catalog: OperationsCatalog,
    private readonly config: MstyleV2Config,
    private readonly mail: MailService,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick().catch(() => undefined);
    }, 10000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async finishCreate(actor: OperationsActor, result: any) {
    const id = result.booking.id;
    if (result.booking.status === 'hold') await this.createPayment(id);
    if (
      result.booking.payment_method === 'invoice' &&
      !result.booking.invoice_id &&
      result.booking.total_amount_minor > 0 &&
      result.booking.status !== 'guest_request'
    )
      await this.invoice(SYSTEM, id, {}, 'invoice-create:' + id);
    const fresh = await this.bookings.detail(actor, id);
    return {
      ...fresh,
      payment: {
        ...result.payment,
        pending: fresh.booking.status === 'hold' && !fresh.booking.payment_url,
        confirmation_url: fresh.booking.payment_url || null,
        gateway: fresh.booking.payment_url
          ? {
              provider: 'yookassa',
              confirmation_url: fresh.booking.payment_url,
              payment_token: result.payment?.payment_token,
              booking_id: id,
            }
          : undefined,
      },
    };
  }
  async finishChange(actor: OperationsActor, result: any) {
    if (
      result.booking.payment_method === 'invoice' &&
      result.booking.payment_status !== 'paid'
    ) {
      await this.invoice(
        SYSTEM,
        result.booking.id,
        {},
        'invoice-change:' + result.booking.id + ':' + result.booking.revision,
      );
    }
    return this.bookings.detail(actor, result.booking.id);
  }
  async publicStatus(id: number, token: string) {
    let row = await this.store.collection('bookings').findOne({ id });
    const expected = Buffer.from(row?.payment_token || '');
    const actual = Buffer.from(String(token || ''));
    if (
      !expected.length ||
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    )
      fail('payment_token_invalid', 'Некорректный токен платежа.', 403);
    if (
      row.provider_payment_id &&
      row.payment_status !== 'paid' &&
      (await this.store.ownership())?.mode === 'pass'
    ) {
      await this.checkPayment(row.provider_payment_id);
      row = await this.store.collection('bookings').findOne({ id });
    }
    const state =
      row.payment_status === 'paid'
        ? 'paid'
        : row.status === 'cancelled'
          ? 'canceled'
          : 'pending';
    // The bearer permits payment status only; no contact, snapshot or ledger data.
    const booking = Object.fromEntries(
      [
        'id',
        'number',
        'room',
        'date',
        'start_minute',
        'end_minute',
        'duration_min',
        'segments',
        'status',
        'payment_status',
        'payment_method',
        'total_amount_minor',
        'base_amount_minor',
        'services_amount_minor',
        'discount_minor',
        'currency',
        'expires_at',
      ].map((k) => [k, row[k]]),
    );
    return {
      state,
      booking,
      payment: {
        provider: 'yookassa',
        provider_payment_id: row.provider_payment_id || '',
        status:
          state === 'paid'
            ? 'succeeded'
            : state === 'canceled'
              ? 'canceled'
              : 'pending',
        state,
      },
    };
  }
  async paymentConfig() {
    const row = await this.store
      .collection('settings')
      .findOne({ key: 'payment' });
    if (!row?.encrypted)
      fail('payment_unavailable', 'Платёжный сервис не настроен.', 503);
    return decryptJson<any>(this.config.piiSecret(), row.encrypted);
  }
  private async gateway(
    path: string,
    method: 'GET' | 'POST',
    body?: any,
    key?: string,
  ) {
    const cfg = await this.paymentConfig();
    if (!cfg.enabled || !cfg.shop_id || !cfg.secret_key)
      fail('payment_unavailable', 'Онлайн-оплата временно недоступна.', 503);
    const response = await fetch('https://api.yookassa.ru/v3/' + path, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(25000),
      headers: {
        Authorization:
          'Basic ' +
          Buffer.from(cfg.shop_id + ':' + cfg.secret_key).toString('base64'),
        'Content-Type': 'application/json',
        ...(key ? { 'Idempotence-Key': key } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok)
      fail('payment_unavailable', 'Не удалось выполнить операцию оплаты.', 503);
    return response.json() as Promise<any>;
  }
  async outstanding(booking: any, session?: ClientSession) {
    const payments = await this.store
      .collection('payments')
      .find({ booking_id: booking.id, status: 'paid' }, { session })
      .toArray();
    return Math.max(
      0,
      booking.total_amount_minor -
        payments.reduce((n, p) => n + Number(p.amount_minor || 0), 0),
    );
  }
  async createPayment(id: number) {
    const row = await this.store.collection('bookings').findOne({ id });
    if (!row || row.status !== 'hold' || row.payment_status === 'paid') return;
    const cfg = await this.paymentConfig();
    const contact = await this.invoiceContact(row);
    const remaining = await this.outstanding(row);
    if (!remaining) return;
    const amount = { value: (remaining / 100).toFixed(2), currency: 'RUB' };
    const returnUrl = new URL(
      String(cfg.return_url || 'https://mstyle.ru/account/bookings/'),
    );
    returnUrl.searchParams.set('tf_yookassa_return', '1');
    returnUrl.searchParams.set('booking_id', String(id));
    returnUrl.searchParams.set('payment_token', row.payment_token);
    const payload: any = {
      amount,
      capture: cfg.capture !== false,
      confirmation: { type: 'redirect', return_url: returnUrl.toString() },
      description: `Бронирование ${row.number}`,
      metadata: {
        booking_id: String(id),
        pass_operation: row.pass_operation_ref,
      },
      payment_method_data: {
        type: row.payment_method === 'qr_code' ? 'sbp' : 'bank_card',
      },
    };
    if (cfg.receipt_enabled) {
      if (!contact.email && !contact.phone)
        fail('contact_required', 'Для чека нужен подтверждённый контакт.');
      payload.receipt = {
        customer: {
          ...(contact.email
            ? { email: contact.email }
            : { phone: contact.phone }),
        },
        ...(cfg.receipt_tax_system_code
          ? { tax_system_code: Number(cfg.receipt_tax_system_code) }
          : {}),
        items: [
          {
            description: `Бронирование ${row.number}`,
            quantity: '1.00',
            amount,
            vat_code: Number(cfg.receipt_vat_code || 1),
            payment_subject: cfg.receipt_payment_subject || 'service',
            payment_mode: cfg.receipt_payment_mode || 'full_payment',
          },
        ],
      };
    }
    await this.store.command(
      SYSTEM,
      'payment-intent:' + id,
      'payment.intent',
      { id },
      async (session) => {
        const fresh = await this.store
          .collection('bookings')
          .findOne({ id }, { session });
        if (!fresh || fresh.status !== 'hold')
          fail('invalid_state', 'Бронь больше не ожидает онлайн-оплаты.');
        await this.store.collection('payment_intents').updateOne(
          { booking_id: id },
          {
            $setOnInsert: {
              booking_id: id,
              amount_minor: remaining,
              operation_ref: row.pass_operation_ref,
              first_requested_at: new Date(),
              encrypted_payload: encryptJson(this.config.piiSecret(), payload),
              provider_key: 'pass-booking-' + id,
            },
          },
          { upsert: true, session },
        );
        return { ok: true };
      },
    );
    const intent = await this.store
      .collection('payment_intents')
      .findOne({ booking_id: id });
    if (intent?.provider_payment_id) {
      await this.checkPayment(intent.provider_payment_id);
      return;
    }
    // YooKassa retains its idempotency key for 24 hours. Never create a second
    // payment after an ambiguous timeout has outlived that window.
    if (
      !intent ||
      Date.now() - new Date(intent.first_requested_at).getTime() >= 23 * 3600000
    ) {
      await this.store.command(
        SYSTEM,
        'payment-uncertain:' + id,
        'payment.uncertain',
        { id },
        async (session) => {
          await this.store.collection('bookings').updateOne(
            { id },
            {
              $set: {
                requires_attention: true,
                attention_reason:
                  'Не удалось определить результат создания платежа. Нужна сверка с ЮKassa.',
              },
              $inc: { revision: 1 },
            },
            { session },
          );
          return { ok: true };
        },
      );
      fail(
        'payment_reconciliation_required',
        'Результат платежа требует проверки администратора.',
      );
    }
    const payment = await this.gateway(
      'payments',
      'POST',
      decryptJson(this.config.piiSecret(), intent.encrypted_payload),
      intent.provider_key,
    );
    await this.attachProviderPayment(id, payment, intent.amount_minor);
    if (payment.status === 'succeeded' || payment.status === 'canceled')
      await this.checkPayment(payment.id);
  }
  private async attachProviderPayment(
    id: number,
    payment: any,
    remaining: number,
  ) {
    if (
      !/^[A-Za-z0-9_-]{8,80}$/.test(payment.id || '') ||
      payment.amount?.currency !== 'RUB' ||
      Math.round(Number(payment.amount?.value) * 100) !== remaining
    )
      fail('payment_mismatch', 'Данные платежа не совпадают.');
    await this.store.command(
      SYSTEM,
      'payment-created:' + payment.id,
      'payment.created',
      { id, paymentId: payment.id },
      async (session) => {
        await this.store.collection('payments').updateOne(
          { provider: 'yookassa', provider_payment_id: payment.id },
          {
            $setOnInsert: {
              id: await this.store.nextId('payments', session),
              booking_id: id,
              provider: 'yookassa',
              provider_payment_id: payment.id,
              status: 'pending',
              amount_minor: remaining,
              currency: 'RUB',
              created_at: sqlNow(),
            },
          },
          { upsert: true, session },
        );
        await this.store
          .collection('payment_intents')
          .updateOne(
            { booking_id: id },
            { $set: { provider_payment_id: payment.id } },
            { session },
          );
        await this.store.collection('bookings').updateOne(
          { id },
          {
            $set: {
              payment_url: payment.confirmation?.confirmation_url || null,
              provider_payment_id: payment.id,
            },
          },
          { session },
        );
        return { ok: true };
      },
    );
  }
  async webhook(payload: any) {
    const id = String(payload?.object?.id || '');
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(id))
      fail('validation_error', 'Некорректный идентификатор платежа.', 400);
    if (!['payment.succeeded', 'payment.canceled'].includes(payload.event))
      return { ok: true, ignored: true };
    // An untrusted webhook is only a hint. Queue it even while cutover is paused;
    // the worker fetches the authenticated provider object before changing money.
    await this.store.transaction(async (session) => {
      await this.store.enqueue(
        'webhook:' + id + ':' + payload.event,
        'payment.check',
        { payment_id: id },
        session,
      );
    });
    return { ok: true };
  }
  async checkPayment(paymentId: string) {
    const payment = await this.gateway(
      'payments/' + encodeURIComponent(paymentId),
      'GET',
    );
    if (!['succeeded', 'canceled'].includes(payment.status)) return;
    let local = await this.store
      .collection('payments')
      .findOne({ provider: 'yookassa', provider_payment_id: paymentId });
    if (!local) {
      const bookingId = Number(payment.metadata?.booking_id);
      const intent = Number.isSafeInteger(bookingId)
        ? await this.store
            .collection('payment_intents')
            .findOne({ booking_id: bookingId })
        : null;
      if (!intent || payment.metadata?.pass_operation !== intent.operation_ref)
        return;
      if (
        intent.provider_payment_id &&
        intent.provider_payment_id !== paymentId
      )
        fail('payment_mismatch', 'Получен другой платёж для этой операции.');
      await this.attachProviderPayment(bookingId, payment, intent.amount_minor);
      local = await this.store
        .collection('payments')
        .findOne({ provider: 'yookassa', provider_payment_id: paymentId });
      if (!local) return;
    }
    const amount = Math.round(Number(payment.amount?.value) * 100);
    if (
      payment.id !== paymentId ||
      payment.amount?.currency !== 'RUB' ||
      amount !== local.amount_minor
    )
      fail('payment_mismatch', 'Данные платежа не совпадают.');
    await this.store.command(
      SYSTEM,
      'payment-result:' + paymentId + ':' + payment.status,
      'payment.result',
      { paymentId, status: payment.status },
      async (session) => {
        const row = await this.store
          .collection('bookings')
          .findOne({ id: local.booking_id }, { session });
        if (!row) fail('booking_not_found', 'Бронирование не найдено.', 404);
        if (payment.status === 'canceled') {
          await this.store
            .collection('payments')
            .updateOne(
              { id: local.id, status: { $ne: 'paid' } },
              { $set: { status: 'cancelled', updated_at: sqlNow() } },
              { session },
            );
          if (row.status === 'hold')
            await this.bookings.cancelInTransaction(
              SYSTEM,
              row,
              'Онлайн-оплата отменена',
              session,
            );
          return { ok: true };
        }
        await this.store.collection('payments').updateOne(
          { id: local.id },
          {
            $set: { status: 'paid', paid_at: sqlNow(), updated_at: sqlNow() },
          },
          { session },
        );
        await this.bookings.lockDays(row.room_id, row.segments, session);
        const conflict =
          row.status === 'cancelled' ||
          (
            await this.bookings.conflicts(
              row.room_id,
              row.segments,
              row.id,
              session,
            )
          ).length > 0;
        const remaining = await this.outstanding(row, session);
        let hoursProblem = false;
        const netHours = await this.bookings.hours.refundable(row, session);
        if (!conflict && !remaining && row.writeoff_min > netHours) {
          const required = row.writeoff_min - netHours;
          const account = await this.bookings.hours.ensure(
            row.resource_profile_id,
            session,
          );
          if (this.bookings.hours.available(account) < required)
            hoursProblem = true;
          else {
            await this.bookings.hours.change(
              row.resource_profile_id,
              -required,
              SYSTEM,
              'Списание после онлайн-оплаты',
              row.id,
              session,
            );
            row.hours_debited_min = row.writeoff_min;
          }
        }
        await this.store.collection('bookings').updateOne(
          { id: row.id },
          {
            $set: {
              payment_status: remaining ? 'unpaid' : 'paid',
              paid_at: remaining ? row.paid_at : sqlNow(),
              expires_at: null,
              hours_debited_min: row.hours_debited_min || 0,
              status:
                row.status === 'cancelled'
                  ? 'cancelled'
                  : conflict
                    ? 'awaiting_resolution'
                    : remaining
                      ? 'awaiting_payment'
                      : row.status === 'confirmed'
                        ? 'confirmed'
                        : 'awaiting_confirmation',
              requires_attention: conflict || hoursProblem,
              attention_reason: conflict
                ? 'Оплата получена после отмены или занятия времени другой бронью.'
                : hoursProblem
                  ? 'Оплата получена; недостаточно часов для отложенного списания.'
                  : '',
              updated_at: sqlNow(),
            },
            $inc: { revision: 1 },
          },
          { session },
        );
        if (!remaining && row.invoice_id)
          await this.store
            .collection('invoices')
            .updateOne(
              { id: row.invoice_id },
              { $set: { status: 'paid', paid_at: sqlNow() } },
              { session },
            );
        await this.store.event(
          'booking',
          row.id,
          'payment.received',
          SYSTEM,
          {
            payment_id: local.id,
            amount_minor: amount,
            requires_attention: conflict || hoursProblem,
          },
          session,
        );
        return { ok: true };
      },
    );
  }
  async invoice(actor: OperationsActor, id: number, input: any, key: string) {
    if (actor.kind !== 'system') requirePermission(actor, 'bookings.finance');
    let invoiceParty:
      | ReturnType<OperationsBookings['identities']['party']>
      | undefined;
    return this.store.command(
      actor,
      key,
      'invoice.create:' + id,
      input,
      async (session) => {
        const booking = await this.store
          .collection('bookings')
          .findOne({ id }, { session });
        if (!booking || booking.status === 'cancelled')
          fail('invalid_state', 'Нельзя выставить счёт для этой брони.');
        if (actor.kind !== 'system') {
          await this.bookings.identities.assertBooking(actor, booking, session);
          if (input.revision != null) checkVersion(booking, input.revision);
        }
        if (booking.profile_id) {
          const profile = await this.store
            .canonical('profiles')
            .findOne({ profileId: booking.profile_id }, { session });
          if (!profile?.privateDataComplete)
            fail(
              'profile_data_required',
              'Для счёта необходимо заполнить данные резидента.',
            );
        }
        const settings = await this.store
          .collection('settings')
          .findOne({ key: 'invoices' }, { session });
        const issuers = settings?.issuers || [];
        const preferred = booking.profile_id
          ? await this.store
              .collection('profile_policies')
              .findOne({ profile_id: booking.profile_id }, { session })
          : null;
        const issuer =
          issuers.find(
            (x: any) =>
              x.id ===
              Number(
                input.issuer_id ||
                  booking.invoice_issuer_id ||
                  preferred?.preferred_invoice_issuer_id ||
                  settings?.default_issuer_id,
              ),
          ) || issuers[0];
        if (!issuer)
          fail('invoice_issuer_required', 'Не настроен получатель платежа.');
        let invoiceId = booking.invoice_id;
        const prior = invoiceId
          ? await this.store
              .collection('invoices')
              .findOne({ id: invoiceId }, { session })
          : null;
        if (
          !booking?.profile_id &&
          booking?.requisites_complete === false &&
          !input.invoice_party &&
          !prior?.snapshot_id
        )
          fail(
            'profile_data_required',
            'Для счёта нужно заполнить реквизиты заказчика.',
          );
        const outstanding = await this.outstanding(booking, session);
        if (prior && prior.amount_minor !== outstanding && outstanding > 0)
          invoiceId = null;
        invoiceId ||= await this.store.nextId('invoices', session);
        let row = await this.store
          .collection('invoices')
          .findOne({ id: invoiceId }, { session });
        if (!row) {
          const frozen = booking.profile_id
            ? await (invoiceParty ||= this.bookings.identities.party(
                {
                  ...actor,
                  kind: 'admin',
                  permissions: ['admin.panel', 'bookings.manage'],
                },
                { profile_id: booking.profile_id, payment_method: 'invoice' },
              ))
            : input.invoice_party
              ? await this.bookings.identities.guestInvoiceSnapshot(
                  actor,
                  booking,
                  input.invoice_party,
                  session,
                )
              : null;
          const due = input.due_at
            ? textValue(input.due_at, 30)
            : paymentPolicy(
                'invoice',
                sqlNow(),
                booking.date,
                booking.start_minute,
                settings?.rules,
              ).due_at;
          row = {
            id: invoiceId,
            booking_id: id,
            booking_render: {
              id: booking.id,
              number: booking.number,
              room: booking.room,
              date: booking.date,
              start_minute: booking.start_minute,
              end_minute: booking.end_minute,
              segments: booking.segments,
            },
            snapshot_id:
              frozen?.pass_snapshot_id ||
              prior?.snapshot_id ||
              booking.pass_snapshot_id,
            profile_type:
              frozen?.profile_type ||
              prior?.profile_type ||
              booking.profile_type,
            legal_form:
              frozen?.legal_form || prior?.legal_form || booking.legal_form,
            invoice_no: String(invoiceId).padStart(5, '0'),
            issuer,
            status: 'issued',
            revision: 1,
            amount_minor: await this.outstanding(booking, session),
            currency: 'RUB',
            due_at: due,
            issued_at: sqlNow(),
            created_at: sqlNow(),
            updated_at: sqlNow(),
          };
          await this.store.collection('invoices').insertOne(row, { session });
          await this.store.collection('bookings').updateOne(
            { id },
            {
              $set: { invoice_id: invoiceId, invoice_issuer_id: issuer.id },
              $inc: { revision: 1 },
            },
            { session },
          );
        }
        await this.store.event(
          'booking',
          id,
          'invoice.issued',
          actor,
          { invoice_id: invoiceId },
          session,
        );
        const publicRow = { ...row };
        delete publicRow._id;
        return { invoice: publicRow };
      },
    );
  }
  async invoicePdf(actor: OperationsActor, id: number, invoiceId?: number) {
    const row = await this.store.collection('bookings').findOne({ id });
    await this.bookings.identities.assertBooking(actor, row);
    const invoice = await this.store
      .collection('invoices')
      .findOne({ id: invoiceId || row.invoice_id, booking_id: id });
    if (!invoice) fail('invoice_not_found', 'Счёт ещё не выставлен.', 404);
    const snapshot = await this.store
      .canonical('snapshots')
      .findOne({ snapshotId: invoice.snapshot_id || row.pass_snapshot_id });
    if (!snapshot) fail('snapshot_invalid', 'Не найдены реквизиты счёта.');
    const party = decryptJson<any>(
      this.config.piiSecret(),
      snapshot.payloadEnc,
    );
    const bytes = await this.catalog.siteRequest('render-invoice', {
      booking: invoice.booking_render || (await this.bookings.present(row)),
      invoice,
      party: {
        ...party,
        profileType: invoice.profile_type || row.profile_type,
        legalForm: invoice.legal_form || row.legal_form,
      },
    });
    return { bytes, name: `Счёт-${invoice.invoice_no}.pdf` };
  }
  private async invoiceContact(booking: any, invoiceId = booking.invoice_id) {
    const invoice = await this.store
      .collection('invoices')
      .findOne({ id: invoiceId, booking_id: booking.id });
    if (invoice?.snapshot_id) {
      const snapshot = await this.store
        .canonical('snapshots')
        .findOne({ snapshotId: invoice.snapshot_id });
      if (snapshot) return this.bookings.identities.contact(snapshot);
    }
    return this.bookings.identities.requester(booking);
  }
  async sendInvoice(
    actor: OperationsActor,
    id: number,
    input: any,
    key: string,
  ) {
    requirePermission(actor, 'bookings.finance');
    return this.store.command(
      actor,
      key,
      'invoice.send:' + id,
      input,
      async (session) => {
        const row = await this.store
          .collection('bookings')
          .findOne({ id }, { session });
        if (!row?.invoice_id)
          fail('invoice_not_found', 'Сначала выставьте счёт.', 404);
        await this.bookings.identities.assertBooking(actor, row, session);
        if (input.revision != null) checkVersion(row, input.revision);
        const contact = await this.invoiceContact(row);
        if (!contact.email)
          fail(
            'email_required',
            'У заказчика не указан email для отправки счёта.',
          );
        await this.store.enqueue(
          'invoice-send:' + id + ':' + key,
          'invoice.send',
          {
            booking_id: id,
            invoice_id: row.invoice_id,
            recipient: contact.email,
          },
          session,
        );
        return { queued: true };
      },
    );
  }
  async tick() {
    if (this.running || (await this.store.ownership())?.mode !== 'pass') return;
    this.running = true;
    try {
      const lease = randomUUID();
      const now = new Date();
      const job = await this.store.collection('outbox').findOneAndUpdate(
        {
          $or: [
            { state: 'pending', retry_at: { $lte: now } },
            { state: 'running', lease_until: { $lt: now } },
          ],
        },
        {
          $set: {
            state: 'running',
            lease,
            lease_until: new Date(Date.now() + 120000),
          },
        },
        { sort: { retry_at: 1 }, returnDocument: 'after' },
      );
      if (job) {
        try {
          if (job.type === 'payment.create')
            await this.createPayment(job.payload.booking_id);
          else if (job.type === 'payment.check')
            await this.checkPayment(job.payload.payment_id);
          else if (job.type === 'invoice.create')
            await this.invoice(SYSTEM, job.payload.booking_id, {}, job.key);
          else if (job.type === 'invoice.send') {
            const row = await this.store
              .collection('bookings')
              .findOne({ id: job.payload.booking_id });
            const contact = await this.invoiceContact(row);
            const pdf = await this.invoicePdf(
              SYSTEM,
              row.id,
              job.payload.invoice_id,
            );
            await this.mail.sendBookingInvoice({
              to: job.payload.recipient || contact.email,
              number: row.number,
              filename: pdf.name,
              content: pdf.bytes,
              messageId: job.key,
            });
          } else fail('unknown_job', 'Неизвестная фоновая операция.', 400);
          await this.store.collection('outbox').updateOne(
            { _id: job._id, lease },
            {
              $set: { state: 'done', completed_at: sqlNow() },
              $unset: { lease: '', lease_until: '' },
            },
          );
        } catch (e) {
          const attempt = (job.attempts || 0) + 1;
          const code =
            (e as any)?.getResponse?.()?.error?.code || 'upstream_unavailable';
          await this.store.collection('outbox').updateOne(
            { _id: job._id, lease },
            {
              $set: {
                state: 'pending',
                attempts: attempt,
                last_error_code: code,
                retry_at: new Date(
                  Date.now() +
                    Math.min(3600000, 10000 * 2 ** Math.min(attempt, 8)),
                ),
              },
              $unset: { lease: '', lease_until: '' },
            },
          );
        }
      }
      const expired = await this.store
        .collection('bookings')
        .find({ status: 'hold', expires_at: { $lte: sqlNow() } })
        .limit(20)
        .toArray();
      for (const row of expired) {
        if (row.provider_payment_id)
          await this.checkPayment(row.provider_payment_id);
        await this.store.command(
          SYSTEM,
          'expire:' + row.id,
          'booking.expire',
          { id: row.id },
          async (session) => {
            const fresh = await this.store
              .collection('bookings')
              .findOne({ id: row.id }, { session });
            if (
              fresh?.status === 'hold' &&
              parseMoscow(fresh.expires_at) <= Date.now()
            )
              await this.bookings.cancelInTransaction(
                SYSTEM,
                fresh,
                'Истёк срок онлайн-оплаты',
                session,
              );
            return { ok: true };
          },
        );
      }
      const overdue = await this.store
        .collection('bookings')
        .find({
          status: { $nin: ['cancelled', 'blocked'] },
          payment_status: { $ne: 'paid' },
          'payment_policy.kind': { $in: ['invoice', 'postpay'] },
        })
        .limit(200)
        .toArray();
      for (const row of overdue) {
        const policy = row.payment_policy;
        const state =
          policy.kind === 'invoice'
            ? parseMoscow(policy.due_at || '') <= Date.now()
              ? 'overdue'
              : 'active'
            : parseMoscow(policy.postpay_due_at || '') <= Date.now()
              ? 'overdue'
              : parseMoscow(policy.postpay_warn_at || '') <= Date.now()
                ? 'warning'
                : 'active';
        if (state === policy.overdue_state) continue;
        await this.store.command(
          SYSTEM,
          'policy:' + row.id + ':' + row.revision + ':' + state,
          'payment.policy',
          {},
          async (session) => {
            const fresh = await this.store
              .collection('bookings')
              .findOne({ id: row.id }, { session });
            if (
              !fresh ||
              fresh.status === 'cancelled' ||
              fresh.payment_status === 'paid'
            )
              return { skipped: true };
            await this.store.collection('bookings').updateOne(
              { id: row.id },
              {
                $set: {
                  'payment_policy.overdue_state': state,
                  ...(policy.kind === 'postpay'
                    ? {
                        payment_status:
                          state === 'overdue'
                            ? 'overdue'
                            : state === 'warning'
                              ? 'postpay_warning'
                              : 'postpay',
                      }
                    : {}),
                },
                $inc: { revision: 1 },
              },
              { session },
            );
            if (
              state === 'overdue' &&
              policy.kind === 'postpay' &&
              row.profile_id
            )
              await this.store.collection('profile_policies').updateOne(
                { profile_id: row.profile_id },
                {
                  $set: { prepay_required: true, reason: 'postpay_overdue' },
                },
                { upsert: true, session },
              );
            await this.store.event(
              'booking',
              row.id,
              'payment.' + state,
              SYSTEM,
              {},
              session,
            );
            return { ok: true };
          },
        );
      }
      const dueAccounts = await this.store
        .collection('hours_accounts')
        .find({})
        .toArray();
      for (const account of dueAccounts) {
        const profile = await this.store
          .canonical('profiles')
          .findOne({ profileId: account.resource_profile_id });
        if (
          !profile ||
          profile.status !== 'active' ||
          (profile.resourceOwnerProfileId &&
            profile.resourceOwnerProfileId !== profile.profileId)
        )
          continue;
        const policy = profile.memberPolicy || {};
        if (
          account.next_renewal_date > sqlNow().slice(0, 10) &&
          account.monthly_quota_min ===
            (policy.residentHoursMonthlyQuotaMin || 0) &&
          account.reset_day === (policy.residentHoursMonthlyResetDay || 1)
        )
          continue;
        await this.store.command(
          SYSTEM,
          'renew:' +
            account.resource_profile_id +
            ':' +
            account.revision +
            ':' +
            sqlNow().slice(0, 10),
          'hours.renew',
          {},
          async (session) => {
            await this.bookings.hours.ensure(
              account.resource_profile_id,
              session,
            );
            return { ok: true };
          },
        );
      }
    } finally {
      this.running = false;
    }
  }
}
