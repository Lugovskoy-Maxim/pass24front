import { Injectable } from '@nestjs/common';
import { ClientSession } from 'mongodb';
import { OperationsStore } from './operations.store';
import { OperationsIdentity } from './operations.identity';
import {
  checkVersion,
  fail,
  integer,
  monthlyPeriod,
  OperationsActor,
  requirePermission,
  sqlNow,
  textValue,
} from './operations.rules';

@Injectable()
export class OperationsHours {
  constructor(
    readonly store: OperationsStore,
    private readonly identities: OperationsIdentity,
  ) {}
  async ensure(resourceId: string, session: ClientSession, now = new Date()) {
    const today = sqlNow(now).slice(0, 10);
    const profile = await this.store
      .canonical('profiles')
      .findOne({ profileId: resourceId }, { session });
    if (!profile)
      fail('profile_unavailable', 'Не найден профиль-владелец часов.');
    const ownsResources =
      !profile.resourceOwnerProfileId ||
      profile.resourceOwnerProfileId === resourceId;
    const quota = ownsResources
      ? Math.max(0, profile.memberPolicy?.residentHoursMonthlyQuotaMin || 0)
      : 0;
    const resetDay = Math.min(
      31,
      Math.max(1, profile.memberPolicy?.residentHoursMonthlyResetDay || 1),
    );
    const period = monthlyPeriod(today, resetDay);
    let account = await this.store
      .collection('hours_accounts')
      .findOne({ resource_profile_id: resourceId }, { session });
    if (!account) {
      account = {
        resource_profile_id: resourceId,
        balance_min: quota,
        monthly_quota_min: quota,
        reset_day: resetDay,
        accrual_date: period.start,
        expires_date: period.end,
        next_renewal_date: period.next,
        revision: 1,
        created_at: sqlNow(now),
        updated_at: sqlNow(now),
      };
      await this.store
        .collection('hours_accounts')
        .insertOne(account, { session });
      await this.ledger(
        account,
        'renewal',
        quota,
        0,
        { ref: 'system:hours', kind: 'system' },
        'Начисление месячной квоты',
        null,
        session,
      );
    } else if (
      ownsResources &&
      profile.status === 'active' &&
      account.next_renewal_date &&
      account.next_renewal_date <= today
    ) {
      const before = account.balance_min;
      const updates = {
        balance_min: quota,
        monthly_quota_min: quota,
        reset_day: resetDay,
        accrual_date: period.start,
        expires_date: period.end,
        next_renewal_date: period.next,
        updated_at: sqlNow(now),
        revision: account.revision + 1,
      };
      await this.store
        .collection('hours_accounts')
        .updateOne(
          { resource_profile_id: resourceId },
          { $set: updates },
          { session },
        );
      account = { ...account, ...updates };
      await this.ledger(
        account,
        'renewal',
        quota,
        before,
        { ref: 'system:hours', kind: 'system' },
        'Обновление месячной квоты без переноса остатка',
        null,
        session,
      );
    }
    if (
      ownsResources &&
      profile.status === 'active' &&
      (account.monthly_quota_min !== quota || account.reset_day !== resetDay)
    ) {
      const before = account.balance_min;
      const since = account.accrual_date || period.start;
      const movements = await this.store
        .collection('hours_ledger')
        .find(
          {
            resource_profile_id: resourceId,
            booking_id: { $ne: null },
            created_at: { $gte: since + ' 00:00:00', $lte: sqlNow(now) },
          },
          { session },
        )
        .toArray();
      const spent = Math.max(
        0,
        movements.reduce(
          (sum, row) =>
            sum +
            (row.type === 'debit'
              ? row.amount_min
              : row.type === 'credit'
                ? -row.amount_min
                : 0),
          0,
        ),
      );
      const balance =
        account.monthly_quota_min !== quota
          ? Math.max(0, quota - spent)
          : before;
      const updates = {
        balance_min: balance,
        monthly_quota_min: quota,
        reset_day: resetDay,
        accrual_date: since,
        expires_date: period.end,
        next_renewal_date: period.next,
        updated_at: sqlNow(now),
        revision: account.revision + 1,
      };
      await this.store
        .collection('hours_accounts')
        .updateOne(
          { resource_profile_id: resourceId },
          { $set: updates },
          { session },
        );
      account = { ...account, ...updates };
      await this.ledger(
        account,
        'policy_change',
        Math.abs(balance - before),
        before,
        { ref: 'system:hours', kind: 'system' },
        'Изменение месячной квоты или дня обновления',
        null,
        session,
      );
    }
    return account;
  }
  available(account: any, now = new Date()) {
    const today = sqlNow(now).slice(0, 10);
    if (
      (account.accrual_date && account.accrual_date > today) ||
      (account.expires_date && account.expires_date < today)
    )
      return 0;
    return Math.max(0, account.balance_min || 0);
  }
  async read(actor: OperationsActor, profileId: string) {
    const resource = await this.identities.hoursResource(actor, profileId);
    // Renew lazily during normal service, but keep paused/migration reads read-only.
    if ((await this.store.ownership())?.mode === 'pass')
      await this.store.transaction(async (session) => {
        await this.store.assertWritable(session);
        await this.ensure(resource.profileId, session);
      });
    const account = await this.store
      .collection('hours_accounts')
      .findOne(
        { resource_profile_id: resource.profileId },
        { projection: { _id: 0 } },
      );
    const history = await this.store
      .collection('hours_ledger')
      .find(
        { resource_profile_id: resource.profileId },
        { projection: { _id: 0 } },
      )
      .sort({ id: -1 })
      .limit(100)
      .toArray();
    return {
      account: account
        ? { ...account, available_balance_min: this.available(account) }
        : null,
      history,
    };
  }
  private async ledger(
    account: any,
    type: string,
    amount: number,
    before: number,
    actor: OperationsActor,
    reason: string,
    bookingId: number | null,
    session: ClientSession,
  ) {
    await this.store.collection('hours_ledger').insertOne(
      {
        id: await this.store.nextId('hours_ledger', session),
        resource_profile_id: account.resource_profile_id,
        booking_id: bookingId,
        type,
        amount_min: amount,
        balance_before_min: before,
        balance_after_min: account.balance_min,
        actor_ref: actor.ref,
        subject: actor.subject || null,
        comment: reason,
        period_start: account.accrual_date,
        period_end: account.expires_date,
        created_at: sqlNow(),
      },
      { session },
    );
  }
  async change(
    resourceId: string,
    delta: number,
    actor: OperationsActor,
    reason: string,
    bookingId: number | null,
    session: ClientSession,
    type?: string,
  ) {
    const account = await this.ensure(resourceId, session);
    const before = account.balance_min;
    if (delta < 0 && this.available(account) < -delta)
      fail(
        'insufficient_balance',
        'Недостаточно доступных резидентских часов.',
        409,
        { balance_min: this.available(account) },
      );
    if (!Number.isSafeInteger(before + delta) || before + delta < 0)
      fail('invalid_balance', 'Некорректное изменение баланса.');
    account.balance_min = before + delta;
    await this.store.collection('hours_accounts').updateOne(
      { resource_profile_id: resourceId },
      {
        $set: { balance_min: account.balance_min, updated_at: sqlNow() },
        $inc: { revision: 1 },
      },
      { session },
    );
    await this.ledger(
      account,
      type || (delta < 0 ? 'debit' : 'credit'),
      Math.abs(delta),
      before,
      actor,
      reason,
      bookingId,
      session,
    );
    return {
      balance_before_min: before,
      balance_after_min: account.balance_min,
      amount_min: Math.abs(delta),
    };
  }
  async adjust(
    actor: OperationsActor,
    resourceId: string,
    input: any,
    key: string,
  ) {
    requirePermission(actor, 'resident_hours.adjust');
    const amount = integer(input.amount_min, 'amount_min', 1);
    if (!['debit', 'credit'].includes(input.type))
      fail('validation_error', 'Выберите списание или возврат.', 400);
    const reason = textValue(input.reason, 1000, true);
    return this.store.command(
      actor,
      key,
      'hours.adjust:' + resourceId,
      input,
      async (session) => {
        const account = await this.ensure(resourceId, session);
        checkVersion(account, input.revision);
        const bookingId = input.booking_id
          ? integer(input.booking_id, 'booking_id', 1)
          : null;
        if (bookingId) {
          const booking = await this.store
            .collection('bookings')
            .findOne({ id: bookingId }, { session });
          if (!booking || booking.resource_profile_id !== resourceId)
            fail(
              'invalid_booking',
              'Бронирование не относится к этому балансу.',
              400,
            );
          if (
            input.type === 'credit' &&
            (await this.refundable(booking, session)) < amount
          )
            fail(
              'refund_exceeds_debit',
              'Возврат превышает невозвращённое списание по брони.',
            );
        }
        const result = await this.change(
          resourceId,
          input.type === 'debit' ? -amount : amount,
          actor,
          reason,
          bookingId,
          session,
        );
        if (bookingId) {
          const booking = await this.store
            .collection('bookings')
            .findOne({ id: bookingId }, { session });
          await this.store.collection('bookings').updateOne(
            { id: bookingId },
            {
              $set: {
                hours_debited_min: await this.refundable(booking, session),
                updated_at: sqlNow(),
              },
              $inc: { revision: 1 },
            },
            { session },
          );
        }
        await this.store.event(
          'hours_account',
          resourceId,
          'hours.adjusted',
          actor,
          { ...result, type: input.type, reason, booking_id: bookingId },
          session,
        );
        return result;
      },
    );
  }
  async refundable(booking: any, session: ClientSession) {
    const rows = await this.store
      .collection('hours_ledger')
      .find(
        {
          booking_id: booking.id,
          resource_profile_id: booking.resource_profile_id,
        },
        { session },
      )
      .toArray();
    return Math.max(
      0,
      rows.reduce(
        (n, row) =>
          n +
          (row.type === 'debit'
            ? row.amount_min
            : row.type === 'credit'
              ? -row.amount_min
              : 0),
        0,
      ),
    );
  }
  async refund(
    booking: any,
    actor: OperationsActor,
    reason: string,
    session: ClientSession,
  ) {
    if (!booking.resource_profile_id) return 0;
    const amount = await this.refundable(booking, session);
    if (amount)
      await this.change(
        booking.resource_profile_id,
        amount,
        actor,
        reason,
        booking.id,
        session,
      );
    return amount;
  }
}
