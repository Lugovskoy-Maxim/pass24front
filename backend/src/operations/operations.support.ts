import { Injectable } from '@nestjs/common';
import { GridFSBucket, ObjectId, ClientSession } from 'mongodb';
import { OperationsStore } from './operations.store';
import { OperationsIdentity } from './operations.identity';
import {
  checkVersion,
  fail,
  integer,
  OperationsActor,
  requirePermission,
  sqlNow,
  SUPPORT_STATUSES,
  SUPPORT_TOPICS,
  supportNeedsAction,
  textValue,
} from './operations.rules';
import { createHash, randomUUID } from 'crypto';

const EXTENSIONS: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpe: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  heic: 'image/heic',
  hiec: 'image/heic',
  pages: 'application/vnd.apple.pages',
  numbers: 'application/vnd.apple.numbers',
};
export function validateAttachment(name: string, bytes: Buffer) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (!EXTENSIONS[ext] || !bytes.length || bytes.length > 10 * 1024 * 1024)
    fail(
      'validation_error',
      'Недопустимый формат или размер файла (максимум 10 МБ).',
      400,
    );
  const hex = bytes.subarray(0, 16).toString('hex');
  const zip = hex.startsWith('504b0304') || hex.startsWith('504b0506');
  const valid =
    ext === 'pdf'
      ? bytes.subarray(0, 5).toString() === '%PDF-'
      : ['jpg', 'jpeg', 'jpe'].includes(ext)
        ? hex.startsWith('ffd8ff')
        : ext === 'png'
          ? hex.startsWith('89504e470d0a1a0a')
          : ext === 'webp'
            ? bytes.subarray(0, 4).toString() === 'RIFF' &&
              bytes.subarray(8, 12).toString() === 'WEBP'
            : ['doc', 'xls'].includes(ext)
              ? hex.startsWith('d0cf11e0a1b11ae1')
              : ['docx', 'xlsx', 'zip', 'pages', 'numbers'].includes(ext)
                ? zip
                : ext === 'rar'
                  ? hex.startsWith('526172211a07')
                  : ['heic', 'hiec'].includes(ext)
                    ? bytes.subarray(4, 8).toString() === 'ftyp'
                    : !bytes.includes(0) &&
                      !bytes.toString('utf8').includes('\ufffd');
  if (!valid)
    fail(
      'validation_error',
      'Содержимое файла не соответствует расширению.',
      400,
    );
  return EXTENSIONS[ext];
}
@Injectable()
export class OperationsSupport {
  constructor(
    readonly store: OperationsStore,
    private readonly identities: OperationsIdentity,
  ) {}
  private bucket() {
    return new GridFSBucket(this.store.connection.db!, {
      bucketName: 'mstyle_ops_files',
    });
  }
  async assertAccess(actor: OperationsActor, row: any) {
    if (!row) fail('not_found', 'Обращение не найдено.', 404);
    if (actor.kind === 'admin') {
      requirePermission(actor, 'support.manage');
      return;
    }
    if (
      actor.kind !== 'resident' ||
      !actor.subject ||
      row.owner_subject !== actor.subject
    )
      fail('not_found', 'Обращение не найдено.', 404);
  }
  async list(actor: OperationsActor, query: any = {}) {
    const filter: any = {};
    if (actor.kind === 'admin') requirePermission(actor, 'support.manage');
    else if (actor.kind === 'resident' && actor.subject)
      filter.owner_subject = actor.subject;
    else fail('unauthorized', 'Необходима авторизация.', 401);
    if (query.status) filter.status = textValue(query.status, 32);
    if (query.topic) filter.topic_key = textValue(query.topic, 64);
    if (query.booking_id)
      filter.booking_id = integer(query.booking_id, 'booking_id', 1);
    const page = integer(query.page || 1, 'page', 1);
    const perPage = integer(query.per_page || 20, 'per_page', 1, 100);
    let items = await this.store
      .collection('tickets')
      .find(filter, { projection: { _id: 0 } })
      .sort({ last_message_at: -1, id: -1 })
      .toArray();
    if (query.needs_action === '1' || query.needs_action === true)
      items = items.filter(supportNeedsAction);
    if (query.search) {
      const term = textValue(query.search, 200).toLocaleLowerCase('ru');
      items = items.filter((row) =>
        [row.id, row.subject, row.requester_name]
          .join(' ')
          .toLocaleLowerCase('ru')
          .includes(term),
      );
    }
    const total = items.length;
    const unread = items.filter(
      (row) => (row.last_support_seq || 0) > (row.customer_read_seq || 0),
    ).length;
    return {
      items: items
        .slice((page - 1) * perPage, page * perPage)
        .map((row) => this.present(row)),
      total,
      page,
      per_page: perPage,
      nav_unread_count: unread,
      topics: SUPPORT_TOPICS,
      statuses: SUPPORT_STATUSES,
    };
  }
  present(row: any) {
    const safe = { ...row };
    delete safe._id;
    return {
      ...safe,
      needs_action: supportNeedsAction(row),
      status_label: SUPPORT_STATUSES[row.status],
      unread_for_customer:
        (row.last_support_seq || 0) > (row.customer_read_seq || 0),
      unread_for_support:
        (row.last_customer_seq || 0) > (row.support_read_seq || 0),
    };
  }
  async detail(actor: OperationsActor, id: number, session?: ClientSession) {
    const row = await this.store
      .collection('tickets')
      .findOne({ id }, { session });
    await this.assertAccess(actor, row);
    const messages = await this.store
      .collection('messages')
      .find({ request_id: id }, { session, projection: { _id: 0 } })
      .sort({ id: 1 })
      .toArray();
    return {
      ticket: this.present(row),
      messages,
      can_reply: !['completed', 'cancelled'].includes(row.status),
    };
  }
  async upload(actor: OperationsActor, input: any, key: string = randomUUID()) {
    if (actor.kind === 'admin') requirePermission(actor, 'support.manage');
    else if (actor.kind !== 'resident')
      fail('forbidden', 'Необходима авторизация.', 403);

    const name = textValue(input.name, 255, true).replace(
      // eslint-disable-next-line no-control-regex -- sanitize private attachment filenames
      /[\\/\x00-\x1f]/g,
      '_',
    );
    if (
      typeof input.base64 !== 'string' ||
      input.base64.length > 14 * 1024 * 1024 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64)
    )
      fail('validation_error', 'Некорректный файл.', 400);
    const bytes = Buffer.from(input.base64, 'base64');
    const mime = validateAttachment(name, bytes);
    const digest = createHash('sha256').update(bytes).digest('hex');
    // GridFS cannot join the Mongo transaction. Only the winning command publishes
    // the file; a retry discards its temporary blob and returns the original receipt.
    if ((await this.store.ownership())?.mode !== 'pass')
      fail('maintenance', 'Приём изменений временно приостановлен.', 503);
    const stream = this.bucket().openUploadStream(name, {
      metadata: { pending: true, actor: actor.ref },
    });
    let published = false;
    try {
      await new Promise<void>((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
        stream.end(bytes);
      });
      const result = await this.store.command(
        actor,
        key,
        'support.upload',
        { name, digest },
        async (session) => {
          const id = await this.store.nextId('attachments', session);
          await this.store.collection('attachments').insertOne(
            {
              id,
              grid_id: stream.id,
              actor_ref: actor.ref,
              request_id: null,
              original_name: name,
              mime_type: mime,
              size: bytes.length,
              sha256: digest,
              created_at: sqlNow(),
            },
            { session },
          );
          return {
            attachment_id: id,
            original_name: name,
            mime_type: mime,
            size: bytes.length,
          };
        },
      );
      const saved = await this.store
        .collection('attachments')
        .findOne({ id: result.attachment_id });
      published = String(saved?.grid_id) === String(stream.id);
      return result;
    } finally {
      if (!published)
        await this.bucket()
          .delete(stream.id)
          .catch(() => undefined);
    }
  }

  private async bindAttachments(
    actor: OperationsActor,
    ids: unknown,
    requestId: number,
    session: ClientSession,
  ) {
    if (ids == null) return [];
    if (!Array.isArray(ids) || ids.length > 1)
      fail('validation_error', 'К сообщению можно приложить один файл.', 400);
    const files: any[] = [];
    for (const raw of ids) {
      const id = integer(raw, 'attachment_id', 1);
      const file = await this.store
        .collection('attachments')
        .findOneAndUpdate(
          { id, actor_ref: actor.ref, request_id: null },
          { $set: { request_id: requestId } },
          { session, returnDocument: 'after' },
        );
      if (!file) fail('attachment_unavailable', 'Вложение недоступно.', 404);
      files.push({
        attachment_id: id,
        original_name: file.original_name,
        mime_type: file.mime_type,
        size: file.size,
      });
    }
    return files;
  }
  async create(actor: OperationsActor, input: any, key: string) {
    if (actor.kind !== 'resident' || !actor.subject)
      fail('forbidden', 'Обращение создаёт авторизованный пользователь.', 403);
    const topic = textValue(input.topic_key, 64, true);
    if (!SUPPORT_TOPICS[topic])
      fail('validation_error', 'Выберите тему обращения.', 400);
    const message = textValue(input.message_text, 20000, true);
    return this.store.command(
      actor,
      key,
      'support.create',
      input,
      async (session) => {
        const profileId =
          input.profile_id ||
          (await this.identities.profileIds(actor, session))[0] ||
          null;
        if (profileId) await this.identities.profile(actor, profileId, session);
        const bookingId = input.booking_id
          ? integer(input.booking_id, 'booking_id', 1)
          : null;
        if (bookingId)
          await this.identities.assertBooking(
            actor,
            await this.store
              .collection('bookings')
              .findOne({ id: bookingId }, { session }),
            session,
          );
        const identity = await this.store
          .canonical('identities')
          .findOne({ subject: actor.subject }, { session });
        const id = await this.store.nextId('tickets', session);
        const now = sqlNow();
        await this.store.collection('tickets').insertOne(
          {
            id,
            owner_subject: actor.subject,
            profile_id: profileId,
            requester_name: identity?.displayName || 'Резидент',
            booking_id: bookingId,
            topic_key: topic,
            topic_label: SUPPORT_TOPICS[topic],
            subject: textValue(input.subject || SUPPORT_TOPICS[topic], 191),
            status: 'new',
            revision: 1,
            created_at: now,
            updated_at: now,
            last_message_at: now,
            last_customer_seq: 1,
            last_support_seq: 0,
            customer_read_seq: 1,
            support_read_seq: 0,
            message_seq: 1,
            last_message_preview: message.slice(0, 160),
          },
          { session },
        );
        await this.message(actor, id, message, input.attachment_ids, session);
        await this.store.event(
          'ticket',
          id,
          'support.created',
          actor,
          {},
          session,
        );
        return this.detail(actor, id, session);
      },
    );
  }
  private async message(
    actor: OperationsActor,
    requestId: number,
    message: string,
    files: unknown,
    session: ClientSession,
  ) {
    await this.store.collection('messages').insertOne(
      {
        id: await this.store.nextId('messages', session),
        request_id: requestId,
        author_type: actor.kind === 'admin' ? 'support' : 'customer',
        author_ref: actor.ref,
        author_label:
          actor.name ||
          (actor.kind === 'admin' ? 'Служба сервиса' : 'Резидент'),
        author_role: actor.kind === 'admin' ? 'Служба сервиса' : 'Резидент',
        message_text: message,
        attachments: await this.bindAttachments(
          actor,
          files,
          requestId,
          session,
        ),
        created_at: sqlNow(),
      },
      { session },
    );
  }
  async reply(actor: OperationsActor, id: number, input: any, key: string) {
    const text = textValue(input.message_text, 20000, true);
    return this.store.command(
      actor,
      key,
      'support.reply:' + id,
      input,
      async (session) => {
        const row = await this.store
          .collection('tickets')
          .findOne({ id }, { session });
        await this.assertAccess(actor, row);
        if (['completed', 'cancelled'].includes(row.status))
          fail('ticket_closed', 'Обращение закрыто.');
        if (input.revision != null) checkVersion(row, input.revision);
        await this.message(actor, id, text, input.attachment_ids, session);
        const seq = row.message_seq + 1;
        const admin = actor.kind === 'admin';
        await this.store.collection('tickets').updateOne(
          { id },
          {
            $set: {
              status:
                admin && row.status === 'new' ? 'in_progress' : row.status,
              [admin ? 'last_support_seq' : 'last_customer_seq']: seq,
              [admin ? 'support_read_seq' : 'customer_read_seq']: seq,
              message_seq: seq,
              last_message_preview: text.slice(0, 160),
              last_message_at: sqlNow(),
              updated_at: sqlNow(),
            },
            $inc: { revision: 1 },
          },
          { session },
        );
        await this.store.event(
          'ticket',
          id,
          'support.replied',
          actor,
          {},
          session,
        );
        return this.detail(actor, id, session);
      },
    );
  }
  async status(actor: OperationsActor, id: number, input: any, key: string) {
    requirePermission(actor, 'support.manage');
    if (!SUPPORT_STATUSES[input.status])
      fail('validation_error', 'Некорректный статус.', 400);
    return this.store.command(
      actor,
      key,
      'support.status:' + id,
      input,
      async (session) => {
        const row = await this.store
          .collection('tickets')
          .findOne({ id }, { session });
        await this.assertAccess(actor, row);
        checkVersion(row, input.revision);
        await this.store.collection('tickets').updateOne(
          { id },
          {
            $set: { status: input.status, updated_at: sqlNow() },
            $inc: { revision: 1 },
          },
          { session },
        );
        await this.store.event(
          'ticket',
          id,
          'support.status_changed',
          actor,
          { from: row.status, to: input.status },
          session,
        );
        return this.detail(actor, id, session);
      },
    );
  }
  async read(actor: OperationsActor, id: number, input: any, key: string) {
    return this.store.command(
      actor,
      key,
      'support.read:' + id,
      input,
      async (session) => {
        const row = await this.store
          .collection('tickets')
          .findOne({ id }, { session });
        await this.assertAccess(actor, row);
        // Reading does not change the last sender or action-required state.
        const seq = Math.min(
          row.message_seq,
          integer(input.seen_seq ?? row.message_seq, 'seen_seq', 0),
        );
        await this.store.collection('tickets').updateOne(
          { id },
          {
            $max: {
              [actor.kind === 'admin'
                ? 'support_read_seq'
                : 'customer_read_seq']: seq,
            },
          },
          { session },
        );
        return this.detail(actor, id, session);
      },
    );
  }
  async download(actor: OperationsActor, id: number) {
    const file = await this.store.collection('attachments').findOne({ id });
    if (!file?.request_id) fail('not_found', 'Файл не найден.', 404);
    await this.assertAccess(
      actor,
      await this.store.collection('tickets').findOne({ id: file.request_id }),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of this.bucket().openDownloadStream(
      new ObjectId(file.grid_id),
    ))
      chunks.push(chunk as Buffer);
    return {
      name: file.original_name,
      mime: file.mime_type,
      bytes: Buffer.concat(chunks),
    };
  }
}
