import { createHash } from 'crypto';
import { readFile, realpath } from 'fs/promises';
import { dirname, resolve, sep } from 'path';
import { GridFSBucket } from 'mongodb';
import { OperationsStore } from './operations.store';
import {
  decryptJson,
  encryptJson,
  hmacHex,
} from '../integrations/mstyle-v2/mstyle-v2.crypto';
import { snapshotQuery } from '../integrations/mstyle-v2/mstyle-v2.ids';
import { fail, fingerprint, monthlyPeriod } from './operations.rules';

const parsed = (s: any, fallback: any = {}) => {
  try {
    return typeof s === 'string' ? JSON.parse(s) : s || fallback;
  } catch {
    return fallback;
  }
};
const n = (v: any) => Number(v || 0);
const legacyId = (prefix: string, key: string) =>
  prefix +
  '_0' +
  createHash('sha256').update(key).digest('hex').slice(0, 25).toUpperCase();
const unique = (rows: any[], field: string) => {
  const values = [...new Set(rows.map((r) => r[field]).filter(Boolean))];
  return values.length === 1 ? values[0] : null;
};
export class OperationsMigration {
  constructor(
    readonly store: OperationsStore,
    private readonly secret: string,
  ) {}
  async load(path: string) {
    const bytes = await readFile(path);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const expected = (
      await readFile(resolve(dirname(path), 'manifest.sha256'), 'utf8')
    ).trim();
    if (hash !== expected)
      fail('export_checksum', 'Контрольная сумма экспорта не совпадает.');
    const bundle = JSON.parse(bytes.toString('utf8'));
    if (
      bundle.schema !== 'mstyle-operations-export-v1' ||
      !bundle.export_id ||
      !bundle.tables
    )
      fail('export_invalid', 'Неизвестный формат экспорта.');
    const root = await realpath(dirname(path));
    for (const file of bundle.attachments || []) {
      const target = await realpath(resolve(root, file.path));
      if (!target.startsWith(root + sep))
        fail('export_path', 'Файл находится за пределами экспорта.');
      const content = await readFile(target);
      if (
        content.length !== file.size ||
        createHash('sha256').update(content).digest('hex') !== file.sha256
      )
        fail(
          'file_checksum',
          'Не совпадает контрольная сумма вложения ' + file.id,
        );
      file.absolute_path = target;
    }
    return { ...bundle, digest: hash };
  }
  async prepare(bundle: any) {
    const snapshots: any[] = [];
    const guests: any[] = [];
    const t = bundle.tables;
    const issues: Array<{ entity: string; id: any; reason: string }> = [];
    const rows: Record<string, any[]> = {
      bookings: [],
      tickets: [],
      messages: [],
      payments: [],
      invoices: [],
      events: [],
      hours_accounts: [],
      hours_ledger: [],
    };
    const source = (entity: string, id: any) =>
      `mstyle:${bundle.environment}:${entity}:${id}`;
    const decorate = (entity: string, row: any) => ({
      ...row,
      source_key: source(entity, row.id ?? row.resource_profile_id),
      source_export_id: bundle.export_id,
      source_digest: fingerprint(row),
    });
    const principals = t.pass_principals || [];
    const links = t.pass_profile_links || [];
    const subject = (principalId: any, userId?: any) =>
      unique(
        principals.filter((p: any) =>
          principalId
            ? n(p.id) === n(principalId)
            : userId && n(p.legacy_user_id) === n(userId),
        ),
        'pass_subject',
      );
    const profileId = (legacyId: any) =>
      legacyId
        ? unique(
            links.filter((l: any) => n(l.legacy_profile_id) === n(legacyId)),
            'pass_profile_id',
          )
        : null;
    for (const raw of t.bookings || []) {
      const id = n(raw.id);
      const operation = (t.pass_operation_links || []).find(
        (r: any) => n(r.booking_id) === id,
      );
      const meta = parsed(raw.meta_json);
      const profile =
        raw.pass_party_type === 'resident_profile'
          ? raw.pass_party_id
          : profileId(raw.client_profile_id);
      const resource =
        operation?.resource_profile_id || (profile ? profile : null);
      let snapshot = raw.pass_snapshot_id
        ? await this.store
            .canonical('snapshots')
            .findOne(snapshotQuery(raw.pass_snapshot_id))
        : null;
      if (raw.pass_snapshot_id && !snapshot)
        issues.push({ entity: 'booking', id, reason: 'snapshot_missing' });
      const legacyProfile = (t.client_profiles || []).find(
        (r: any) => n(r.id) === n(raw.client_profile_id),
      );
      const isGuest =
        raw.pass_party_type === 'guest_party' ||
        (!profile &&
          !n(raw.pass_principal_id) &&
          !n(raw.client_id) &&
          (legacyProfile?.origin === 'guest' || raw.source === 'guest'));
      const partyId =
        raw.pass_party_id ||
        profile ||
        (isGuest ? legacyId('gst', source('guest', id)) : null);
      if (!profile && !isGuest && raw.status !== 'blocked')
        issues.push({ entity: 'booking', id, reason: 'party_unresolved' });
      if (
        !snapshot &&
        !raw.pass_snapshot_id &&
        partyId &&
        raw.status !== 'blocked'
      ) {
        const legacy = raw.legacy_snapshot || {};
        const summary = parsed(raw.client_summary_json);
        const contacts = {
          displayName: legacy.name || raw.client_name || summary.name || '',
          phone: legacy.phone || raw.client_phone || summary.phone || '',
          email: legacy.email || raw.client_email || summary.email || '',
        };
        snapshot = {
          snapshotId: legacyId('snp', source('snapshot', id)),
          partyType: isGuest ? 'guest_party' : 'resident_profile',
          partyId,
        };
        snapshots.push({
          ...snapshot,
          payload: { contacts, values: {}, legacySnapshot: legacy },
          createdAtIso: raw.created_at || bundle.created_at,
          source_key: source('snapshot', id),
        });
        if (isGuest && !raw.pass_party_id)
          guests.push({
            guestPartyId: partyId,
            status: 'booked',
            purpose: 'mstyle_booking',
            displayName: contacts.displayName,
            revision: 1,
            source_key: source('guest', id),
            created_at: raw.created_at,
          });
      }
      const segments = (t.booking_segments || [])
        .filter((s: any) => n(s.booking_id) === id)
        .map((s: any) => ({
          id: n(s.id),
          date: s.date,
          start_minute: n(s.start_minute),
          end_minute: n(s.end_minute),
          duration_min: n(s.duration_min),
        }));
      if (!segments.length)
        segments.push({
          date: raw.date,
          start_minute: n(raw.start_minute),
          end_minute: n(raw.end_minute),
          duration_min: n(raw.duration_min),
        });
      const serviceRows = (t.booking_services || []).filter(
        (s: any) => n(s.booking_id) === id,
      );
      const services = serviceRows.length
        ? serviceRows.map((s: any) => ({
            ...s,
            service_id: n(s.service_id),
            quantity: n(s.quantity),
            price_minor: n(s.price_minor),
            total_amount_minor: n(s.quantity) * n(s.price_minor),
          }))
        : meta.services || [];
      const room = bundle.catalog?.rooms?.find(
        (r: any) => r.id === n(raw.room_id),
      ) || {
        id: n(raw.room_id),
        title: 'Архивное помещение #' + raw.room_id,
        type: meta.room_type || 'office',
        business_center: {},
      };
      const ledger = (t.balance_transactions || []).filter(
        (r: any) => n(r.booking_id) === id,
      );
      const debited = Math.max(
        0,
        ledger.reduce(
          (sum: number, l: any) =>
            sum +
            (l.type === 'debit'
              ? n(l.amount_min)
              : l.type === 'credit'
                ? -n(l.amount_min)
                : 0),
          0,
        ),
      );
      const booking: any = {
        id,
        number: raw.number,
        room_id: n(raw.room_id),
        room,
        segments,
        services,
        date: raw.date,
        start_minute: n(raw.start_minute),
        end_minute: n(raw.end_minute),
        duration_min: n(raw.duration_min),
        status: raw.status,
        payment_status: raw.payment_status,
        payment_method: raw.payment_method,
        currency: raw.currency,
        source: raw.source,
        owner_subject: subject(raw.pass_principal_id, raw.client_id),
        profile_id: profile,
        resource_profile_id: resource,
        pass_party_id: partyId,
        pass_party_type:
          raw.pass_party_type ||
          (profile ? 'resident_profile' : isGuest ? 'guest_party' : null),
        profile_type:
          operation?.profile_type ||
          raw.legacy_snapshot?.type ||
          legacyProfile?.type ||
          'individual',
        legal_form:
          operation?.legal_form || raw.legacy_snapshot?.legal_form || null,
        pass_snapshot_id: snapshot?.snapshotId || null,
        pass_operation_ref: raw.pass_operation_ref,
        client_profile_id: n(raw.client_profile_id) || null,
        pass_principal_id: n(raw.pass_principal_id) || null,
        invoice_id: n(raw.invoice_id) || null,
        invoice_issuer_id: n(raw.invoice_issuer_id) || null,
        expires_at: raw.expires_at,
        paid_at: raw.paid_at,
        created_at: raw.created_at,
        updated_at: raw.updated_at,
        comment_client: raw.comment_client || '',
        comment_admin: raw.comment_admin || '',
        revision: 1,
        hours_debited_min: debited,
        writeoff_min: n(
          meta.payment_request?.writeoff_min ||
            meta.balance_writeoff?.amount_min ||
            debited,
        ),
        booking_mode: meta.booking_mode || 'slots',
        day_office: meta.day_office || null,
        payment_policy: meta.payment_policy || null,
        payment_token:
          meta.online_payment?.token ||
          meta.mock_payment?.token ||
          meta.payment_token ||
          '',
        provider_payment_id: meta.online_payment?.provider_payment_id || '',
        payment_url: meta.online_payment?.confirmation_url || null,
        attendees: meta.attendees || [],
        requires_attention: false,
        legacy_requester: snapshot
          ? undefined
          : {
              name:
                raw.client_name || parsed(raw.client_summary_json).name || '',
              phone: raw.client_phone || '',
              email: raw.client_email || '',
            },
      };
      for (const key of [
        'base_amount_minor',
        'services_amount_minor',
        'discount_minor',
        'total_amount_minor',
      ])
        booking[key] = n(raw[key]);
      const attendeeRows = (t.pass_booking_attendees || []).filter(
        (a: any) => n(a.booking_id) === id,
      );
      if (attendeeRows.length) {
        booking.attendees = [];
        for (const a of attendeeRows) {
          const snapId = a.pass_snapshot_id || a.snapshot_id;
          const snap = snapId
            ? await this.store
                .canonical('snapshots')
                .findOne(snapshotQuery(snapId))
            : null;
          if (!snap) {
            issues.push({
              entity: 'attendee',
              id: a.id,
              reason: 'snapshot_missing',
            });
            continue;
          }
          const contact =
            decryptJson<any>(this.secret, snap.payloadEnc).contacts || {};
          booking.attendees.push({
            guest_party_id: a.guest_party_id || a.pass_guest_party_id,
            snapshot_id: snap.snapshotId,
            name: contact.displayName || '',
            phone: contact.phone || '',
            email: contact.email || '',
          });
        }
      }
      rows.bookings.push(decorate('bookings', booking));
    }
    for (const raw of t.service_requests || []) {
      const messages = (t.service_request_messages || [])
        .filter((m: any) => n(m.request_id) === n(raw.id))
        .sort((a: any, b: any) => n(a.id) - n(b.id));
      let lastCustomer = 0,
        lastSupport = 0,
        customerRead = 0,
        supportRead = 0;
      messages.forEach((m: any, i: number) => {
        if (m.author_type === 'support') lastSupport = i + 1;
        else lastCustomer = i + 1;
        if (
          raw.customer_last_read_at &&
          m.created_at <= raw.customer_last_read_at
        )
          customerRead = i + 1;
        if (
          raw.support_last_read_at &&
          m.created_at <= raw.support_last_read_at
        )
          supportRead = i + 1;
      });
      const owner = subject(raw.pass_principal_id, raw.user_id);
      if (!owner)
        issues.push({
          entity: 'ticket',
          id: n(raw.id),
          reason: 'author_unresolved',
        });
      rows.tickets.push(
        decorate('tickets', {
          ...raw,
          id: n(raw.id),
          booking_id: n(raw.booking_id) || null,
          owner_subject: owner,
          profile_id: profileId(raw.client_profile_id),
          requester_name:
            messages.find((m: any) => m.author_type === 'customer')
              ?.author_label || 'Архивный пользователь',
          revision: 1,
          message_seq: messages.length,
          last_customer_seq: lastCustomer,
          last_support_seq: lastSupport,
          customer_read_seq: customerRead,
          support_read_seq: supportRead,
        }),
      );
    }
    for (const raw of t.service_request_messages || [])
      rows.messages.push(
        decorate('messages', {
          id: n(raw.id),
          request_id: n(raw.request_id),
          author_type: raw.author_type,
          author_label: raw.author_label,
          author_role: raw.author_role,
          message_text: raw.message_text,
          attachments: parsed(raw.attachments_json, []).map((a: any) => ({
            ...a,
            attachment_id: n(a.attachment_id),
          })),
          created_at: raw.created_at,
        }),
      );
    for (const raw of t.payments || []) {
      const gateway = parsed(raw.raw_response);
      rows.payments.push(
        decorate('payments', {
          id: n(raw.id),
          booking_id: n(raw.booking_id),
          invoice_id: n(raw.invoice_id) || null,
          provider: raw.provider,
          provider_payment_id: raw.provider_payment_id,
          amount_minor: n(raw.amount_minor),
          currency: raw.currency,
          status: ['succeeded', 'paid'].includes(raw.status)
            ? 'paid'
            : raw.status,
          paid_at: raw.paid_at,
          created_at: raw.created_at,
          updated_at: raw.updated_at,
        }),
      );
      const booking = rows.bookings.find((b) => b.id === n(raw.booking_id));
      if (booking && raw.provider === 'yookassa') {
        booking.provider_payment_id = raw.provider_payment_id;
        booking.payment_url ||= gateway.confirmation?.confirmation_url || null;
      }
    }
    for (const raw of t.invoices || [])
      rows.invoices.push(
        decorate('invoices', {
          id: n(raw.id),
          booking_id: n(raw.booking_id),
          invoice_no: raw.invoice_no,
          amount_minor: n(raw.amount_minor),
          currency: raw.currency,
          status: raw.status,
          issuer: parsed(raw.issuer_snapshot_json),
          revision: 1,
          snapshot_id:
            rows.bookings.find((b) => b.id === n(raw.booking_id))
              ?.pass_snapshot_id || null,
          profile_type: rows.bookings.find((b) => b.id === n(raw.booking_id))
            ?.profile_type,
          legal_form: rows.bookings.find((b) => b.id === n(raw.booking_id))
            ?.legal_form,
          issued_at: raw.issued_at,
          due_at: raw.due_at,
          paid_at: raw.paid_at,
          created_at: raw.created_at,
          updated_at: raw.updated_at,
        }),
      );
    for (const raw of t.booking_events || [])
      rows.events.push(
        decorate('events', {
          id: n(raw.id),
          entity: 'booking',
          entity_id: n(raw.booking_id),
          action: raw.event_type,
          actor_ref:
            'legacy:' + (raw.actor_user_id || raw.created_by || 'system'),
          actor_label: raw.actor_label || 'История Mstyle',
          details: parsed(raw.payload_json),
          created_at: raw.created_at,
        }),
      );
    for (const raw of t.pass_resident_hour_accounts || []) {
      const id = raw.resource_profile_id;
      if (!(await this.store.canonical('profiles').findOne({ profileId: id })))
        issues.push({
          entity: 'hours',
          id,
          reason: 'resource_profile_missing',
        });
      const period = monthlyPeriod(
        raw.resident_hours_accrual_date ||
          (bundle.created_at || '1970-01-01').slice(0, 10),
        n(raw.applied_monthly_reset_day) || 1,
      );
      rows.hours_accounts.push(
        decorate('hours_accounts', {
          resource_profile_id: id,
          balance_min: n(raw.balance_min),
          revision: 1,
          accrual_date: raw.resident_hours_accrual_date || null,
          expires_date: raw.resident_hours_expires_date || null,
          monthly_quota_min: n(raw.applied_monthly_quota_min),
          reset_day: n(raw.applied_monthly_reset_day) || 1,
          next_renewal_date: period.next,
          created_at: raw.created_at,
          updated_at: raw.updated_at,
        }),
      );
    }
    for (const raw of t.balance_transactions || []) {
      const booking = rows.bookings.find((b) => b.id === n(raw.booking_id));
      const principal = principals.find((p: any) =>
        raw.principal_id
          ? n(p.id) === n(raw.principal_id)
          : n(p.legacy_user_id) === n(raw.user_id),
      );
      const possible = (t.pass_resident_hour_accounts || []).filter(
        (a: any) =>
          principal && n(a.migrated_from_principal_id) === n(principal.id),
      );
      const resource =
        booking?.resource_profile_id || unique(possible, 'resource_profile_id');
      if (!resource)
        issues.push({
          entity: 'hours_ledger',
          id: n(raw.id),
          reason: 'resource_owner_unresolved',
        });
      rows.hours_ledger.push(
        decorate('hours_ledger', {
          id: n(raw.id),
          resource_profile_id: resource || null,
          booking_id: n(raw.booking_id) || null,
          type: raw.type,
          amount_min: n(raw.amount_min),
          balance_after_min: n(raw.balance_after_min),
          balance_before_min:
            n(raw.balance_after_min) +
            (raw.type === 'debit' ? n(raw.amount_min) : -n(raw.amount_min)),
          actor_ref: 'legacy:' + (raw.created_by || 'system'),
          subject: subject(raw.principal_id, raw.user_id),
          comment: raw.comment || '',
          created_at: raw.created_at,
        }),
      );
    }
    for (const booking of rows.bookings) {
      if (
        booking.payment_status === 'paid' &&
        booking.total_amount_minor > 0 &&
        rows.payments
          .filter((p) => p.booking_id === booking.id && p.status === 'paid')
          .reduce((sum, p) => sum + p.amount_minor, 0) <
          booking.total_amount_minor
      )
        issues.push({
          entity: 'booking',
          id: booking.id,
          reason: 'paid_total_without_payment_history',
        });
      if (
        booking.invoice_id &&
        !rows.invoices.some((i) => i.id === booking.invoice_id)
      )
        issues.push({
          entity: 'booking',
          id: booking.id,
          reason: 'invoice_missing',
        });
    }
    for (const message of rows.messages) {
      if (!rows.tickets.some((t) => t.id === message.request_id))
        issues.push({
          entity: 'message',
          id: message.id,
          reason: 'ticket_missing',
        });
      for (const attachment of message.attachments)
        if (
          !(bundle.attachments || []).some(
            (f: any) =>
              f.id === attachment.attachment_id &&
              f.request_id === message.request_id,
          )
        )
          issues.push({
            entity: 'message',
            id: message.id,
            reason: 'attachment_missing_or_foreign',
          });
    }
    for (const account of rows.hours_accounts)
      if (!Number.isSafeInteger(account.balance_min) || account.balance_min < 0)
        issues.push({
          entity: 'hours',
          id: account.resource_profile_id,
          reason: 'invalid_balance',
        });
    // Any ambiguous relation is retained and reported, never inferred from contacts.
    for (const [name, items] of Object.entries(rows)) {
      const ids = items.map((r) => r.id ?? r.resource_profile_id);
      if (new Set(ids).size !== ids.length)
        fail('duplicate_source_id', 'Повторяющиеся идентификаторы: ' + name);
    }
    const totals = {
      bookings: rows.bookings.reduce((s, r) => s + r.total_amount_minor, 0),
      payments: rows.payments
        .filter((r) => r.status === 'paid')
        .reduce((s, r) => s + r.amount_minor, 0),
      invoices: rows.invoices.reduce((s, r) => s + r.amount_minor, 0),
      hours: rows.hours_accounts.reduce((s, r) => s + r.balance_min, 0),
    };
    return {
      rows,
      snapshots,
      guests,
      issues,
      totals,
      counts: Object.fromEntries(
        Object.entries(rows).map(([key, value]) => [key, value.length]),
      ),
    };
  }
  async import(bundle: any) {
    const state = await this.store.ownership();
    if (state?.mode === 'pass' || state?.ever_opened)
      fail(
        'import_after_cutover',
        'Повторный импорт запрещён после открытия записи в Pass.',
      );
    const prepared = await this.prepare(bundle);
    if (this.secret.length < 32)
      fail('secret_required', 'Не настроено шифрование архива.');
    await this.store.onModuleInit();
    const lock = await this.store.collection('settings').findOneAndUpdate(
      {
        key: 'ownership',
        mode: { $ne: 'pass' },
        ever_opened: { $ne: true },
        migration_lock: { $exists: false },
      },
      { $set: { migration_lock: bundle.export_id } },
      { returnDocument: 'after' },
    );
    if (!lock)
      fail(
        'migration_locked',
        'Выполняется другой импорт или запись уже открыта.',
      );
    try {
      for (const guest of prepared.guests) {
        const existing = await this.store
          .canonical('guest_parties')
          .findOne({ guestPartyId: guest.guestPartyId });
        if (existing && existing.source_key !== guest.source_key)
          fail('id_collision', 'ID исторического гостя занят.');
        await this.store
          .canonical('guest_parties')
          .replaceOne({ guestPartyId: guest.guestPartyId }, guest, {
            upsert: true,
          });
      }
      for (const frozen of prepared.snapshots) {
        const { payload, ...metadata } = frozen;
        const existing = await this.store
          .canonical('snapshots')
          .findOne({ snapshotId: frozen.snapshotId });
        if (existing && existing.source_key !== frozen.source_key)
          fail('id_collision', 'ID исторического снимка занят.');
        await this.store.canonical('snapshots').replaceOne(
          { snapshotId: frozen.snapshotId },
          {
            ...metadata,
            snapshotRevision: 1,
            eventIds: [],
            sourceRevisions: {},
            payloadEnc: encryptJson(this.secret, payload),
            contentDigest: {
              algorithm: 'HMAC-SHA-256',
              keyVersion: 1,
              value: hmacHex(this.secret, JSON.stringify(payload)),
            },
          },
          { upsert: true },
        );
      }
      for (const [name, rows] of Object.entries(prepared.rows)) {
        for (const row of rows) {
          const idQuery =
            name === 'hours_accounts'
              ? { resource_profile_id: row.resource_profile_id }
              : { id: row.id };
          const existing = await this.store.collection(name).findOne(idQuery);
          if (existing && existing.source_key !== row.source_key)
            fail(
              'id_collision',
              'Числовой ID уже занят: ' +
                name +
                ':' +
                (row.id || row.resource_profile_id),
            );
          await this.store
            .collection(name)
            .replaceOne({ source_key: row.source_key }, row, { upsert: true });
        }
        await this.store.collection(name).deleteMany({
          source_key: { $regex: '^mstyle:' + bundle.environment + ':' },
          source_export_id: { $ne: bundle.export_id },
        });
        const max = Math.max(0, ...rows.map((r) => r.id || 0));
        if (max)
          await this.store
            .collection('counters')
            .updateOne(
              { _id: name },
              { $max: { value: max } },
              { upsert: true },
            );
      }
      // Preserve every original column encrypted, including old document snapshots.
      for (const [table, items] of Object.entries(bundle.tables) as Array<
        [string, any[]]
      >)
        for (const row of items) {
          const key = `${bundle.environment}:${table}:${row.id}`;
          await this.store.collection('legacy_archive').replaceOne(
            { key },
            {
              key,
              digest: fingerprint(row),
              encrypted: encryptJson(this.secret, row),
              export_id: bundle.export_id,
            },
            { upsert: true },
          );
        }
      const bucket = new GridFSBucket(this.store.connection.db!, {
        bucketName: 'mstyle_ops_files',
      });
      for (const file of bundle.attachments || []) {
        const existing = await this.store
          .collection('attachments')
          .findOne({ id: file.id });
        if (
          existing?.sha256 === file.sha256 &&
          existing?.source_key ===
            `mstyle:${bundle.environment}:attachments:${file.id}`
        ) {
          await this.store.collection('attachments').updateOne(
            { id: file.id },
            {
              $set: {
                request_id: file.request_id,
                original_name: file.original_name,
                mime_type: file.mime_type,
              },
            },
          );
          continue;
        }
        if (
          existing &&
          existing.source_key !==
            `mstyle:${bundle.environment}:attachments:${file.id}`
        )
          fail('id_collision', 'ID вложения занят.');
        const stream = bucket.openUploadStream(String(file.id));
        const bytes = await readFile(file.absolute_path);
        await new Promise<void>((resolve, reject) => {
          stream.on('finish', resolve);
          stream.on('error', reject);
          stream.end(bytes);
        });
        await this.store.collection('attachments').replaceOne(
          { id: file.id },
          {
            id: file.id,
            source_key: `mstyle:${bundle.environment}:attachments:${file.id}`,
            grid_id: stream.id,
            request_id: file.request_id,
            original_name: file.original_name,
            mime_type: file.mime_type,
            size: file.size,
            sha256: file.sha256,
          },
          { upsert: true },
        );
        if (existing?.grid_id) await bucket.delete(existing.grid_id);
      }
      const maxFile = Math.max(
        0,
        ...(bundle.attachments || []).map((f: any) => f.id),
      );
      await this.store
        .collection('counters')
        .updateOne(
          { _id: 'attachments' },
          { $max: { value: maxFile } },
          { upsert: true },
        );
      await this.store.collection('settings').updateOne(
        { key: 'payment' },
        {
          $set: {
            encrypted: encryptJson(this.secret, bundle.payment_settings || {}),
          },
        },
        { upsert: true },
      );
      for (const profileId of new Set(
        (bundle.tables.pass_profile_links || []).map(
          (r: any) => r.pass_profile_id,
        ),
      )) {
        const links = (bundle.tables.pass_profile_links || [])
          .filter((r: any) => r.pass_profile_id === profileId)
          .sort(
            (a: any, b: any) => n(b.profile_revision) - n(a.profile_revision),
          );
        const row = links[0];
        await this.store.collection('profile_policies').updateOne(
          { profile_id: profileId },
          {
            $set: {
              prepay_required: !!n(row.prepay_required),
              reason: row.prepay_required_reason || '',
              preferred_invoice_issuer_id:
                n(row.preferred_invoice_issuer_id) || null,
            },
          },
          { upsert: true },
        );
      }
      const issuers = (bundle.tables.invoice_issuers || []).map((r: any) => ({
        ...r,
        id: n(r.id),
      }));
      await this.store.collection('settings').updateOne(
        { key: 'invoices' },
        {
          $set: {
            issuers,
            rules: bundle.catalog?.invoice_settings || {},
            default_issuer_id: issuers.find((r: any) => n(r.is_default))?.id,
          },
        },
        { upsert: true },
      );
      await this.store.collection('settings').updateOne(
        { key: 'migration' },
        {
          $set: {
            export_id: bundle.export_id,
            digest: bundle.digest,
            verified: false,
            counts: prepared.counts,
            totals: prepared.totals,
            issues: prepared.issues,
          },
        },
        { upsert: true },
      );
      return {
        counts: prepared.counts,
        totals: prepared.totals,
        issues: prepared.issues,
      };
    } finally {
      await this.store
        .collection('settings')
        .updateOne(
          { key: 'ownership', migration_lock: bundle.export_id },
          { $unset: { migration_lock: '' } },
        );
    }
  }
  async verify(bundle: any) {
    const expected = await this.prepare(bundle);
    const differences: string[] = [];
    for (const [name, rows] of Object.entries(expected.rows)) {
      const actual = await this.store
        .collection(name)
        .find({ source_export_id: bundle.export_id })
        .toArray();
      if (actual.length !== rows.length) differences.push(name + ':count');
      for (const row of rows) {
        const saved = actual.find((r) => r.source_key === row.source_key);
        if (!saved) {
          differences.push(row.source_key + ':missing');
          continue;
        }
        for (const key of Object.keys(row))
          if (fingerprint(saved[key] ?? null) !== fingerprint(row[key] ?? null))
            differences.push(row.source_key + ':' + key);
      }
    }
    for (const [table, items] of Object.entries(bundle.tables) as Array<
      [string, any[]]
    >) {
      for (const raw of items) {
        const key = `${bundle.environment}:${table}:${raw.id}`;
        const saved = await this.store
          .collection('legacy_archive')
          .findOne({ key });
        if (
          !saved ||
          fingerprint(decryptJson(this.secret, saved.encrypted)) !==
            fingerprint(raw)
        )
          differences.push('archive:' + key);
      }
    }
    for (const frozen of expected.snapshots) {
      const saved = await this.store
        .canonical('snapshots')
        .findOne({ snapshotId: frozen.snapshotId });
      if (
        !saved ||
        fingerprint(decryptJson(this.secret, saved.payloadEnc)) !==
          fingerprint(frozen.payload)
      )
        differences.push('snapshot:' + frozen.snapshotId);
    }
    const bucket = new GridFSBucket(this.store.connection.db!, {
      bucketName: 'mstyle_ops_files',
    });
    for (const file of bundle.attachments || []) {
      const saved = await this.store
        .collection('attachments')
        .findOne({ id: file.id });
      if (!saved) {
        differences.push('attachment:' + file.id);
        continue;
      }
      const hash = createHash('sha256');
      let size = 0;
      for await (const part of bucket.openDownloadStream(saved.grid_id)) {
        hash.update(part);
        size += part.length;
      }
      if (
        hash.digest('hex') !== file.sha256 ||
        size !== file.size ||
        saved.request_id !== file.request_id
      )
        differences.push('attachment:' + file.id + ':checksum_or_link');
    }
    return {
      ok: differences.length === 0 && expected.issues.length === 0,
      differences,
      issues: expected.issues,
      counts: expected.counts,
      totals: expected.totals,
    };
  }
}
