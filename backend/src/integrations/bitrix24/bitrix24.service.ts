import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { GridFSBucket, ObjectId } from 'mongodb';
import { createHash, randomUUID } from 'crypto';
import { OperationsStore } from '../../operations/operations.store';
import {
  OperationsActor,
  sqlNow,
  integer,
  fail,
} from '../../operations/operations.rules';
import { validateAttachment } from '../../operations/operations.support';
import { Bitrix24Customers } from './bitrix24.customers';
import {
  Bitrix24Client,
  Bitrix24Error,
  CrmComment,
  ServiceFunnel,
} from './bitrix24.client';
import {
  bitrixErrorLabel,
  commentMarker,
  commentText,
  crmPlainText,
  crmTicketStatus,
} from './bitrix24.rules';

const SYSTEM: OperationsActor = {
  kind: 'system',
  ref: 'system:bitrix24',
  name: 'Bitrix24',
};
@Injectable()
export class Bitrix24Service implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(Bitrix24Service.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(
    readonly store: OperationsStore,
    readonly client: Bitrix24Client,
  ) {}
  async onModuleInit() {
    await this.store
      .collection('bitrix_state')
      .updateOne(
        { _id: 'worker' },
        { $setOnInsert: { _id: 'worker' } },
        { upsert: true },
      );
    this.timer = setInterval(() => {
      void this.tick();
    }, 5000);
    this.timer.unref();
    void this.tick();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private bucket() {
    return new GridFSBucket(this.store.connection.db!, {
      bucketName: 'mstyle_ops_files',
    });
  }
  async health(check = false) {
    const state = await this.store
      .collection('bitrix_state')
      .findOne({ _id: 'health' });
    if (check && this.client.enabled()) {
      try {
        const funnel = await this.client.funnel(true);
        const capabilities = await this.client.capabilities().catch(() => null);
        await this.store.collection('bitrix_state').updateOne(
          { _id: 'health' },
          {
            $set: {
              checked_at: sqlNow(),
              error_code: '',
              capabilities,
              funnel: {
                id: funnel.id,
                name: funnel.name,
                stages: funnel.stages,
              },
            },
          },
          { upsert: true },
        );
        return this.health();
      } catch (error) {
        const code = this.errorCode(error);
        await this.store
          .collection('bitrix_state')
          .updateOne(
            { _id: 'health' },
            { $set: { checked_at: sqlNow(), error_code: code } },
            { upsert: true },
          );
        return this.health();
      }
    }
    return {
      enabled: this.client.enabled(),
      configured: this.client.configured(),
      capabilities: state?.capabilities || null,
      ready: this.client.enabled() && !!state?.funnel && !state?.error_code,
      checkedAt: state?.checked_at || null,
      lastSyncAt: state?.last_sync_at || null,
      funnel: state?.funnel || null,
      error: bitrixErrorLabel(state?.error_code),
      pollIntervalSec: 60,
    };
  }
  private errorCode(error: unknown) {
    return error instanceof Bitrix24Error ? error.code : 'sync_failed';
  }
  async tick() {
    if (this.running || !this.client.enabled()) return;
    this.running = true;
    const lease = randomUUID();
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    try {
      if ((await this.store.ownership())?.mode !== 'pass') return;
      const state = this.store.collection('bitrix_state');
      const claimed = await state.findOneAndUpdate(
        {
          _id: 'worker',
          $or: [
            { lease_until: { $exists: false } },
            { lease_until: { $lte: new Date() } },
          ],
        },
        { $set: { lease, lease_until: new Date(Date.now() + 180000) } },
      );
      if (!claimed) return;
      heartbeat = setInterval(() => {
        void state
          .updateOne(
            { _id: 'worker', lease },
            { $set: { lease_until: new Date(Date.now() + 180000) } },
          )
          .catch(() => undefined);
      }, 45000);
      heartbeat.unref();
      const funnel = await this.client.funnel();
      await state.updateOne(
        { _id: 'health' },
        {
          $set: {
            checked_at: sqlNow(),
            error_code: '',
            funnel: { id: funnel.id, name: funnel.name, stages: funnel.stages },
          },
        },
        { upsert: true },
      );
      const now = new Date();
      const job = await this.store.collection('outbox').findOneAndUpdate(
        {
          type: 'bitrix.message',
          $or: [
            { state: 'pending', retry_at: { $lte: now } },
            { state: 'running', lease_until: { $lte: now } },
          ],
        },
        {
          $set: {
            state: 'running',
            lease,
            lease_until: new Date(Date.now() + 180000),
          },
        },
        { sort: { created_at: 1, _id: 1 }, returnDocument: 'after' },
      );
      if (job) {
        try {
          await this.sendTicket(job.payload.ticket_id, funnel);
          await this.store.collection('outbox').updateOne(
            { _id: job._id, lease },
            {
              $set: { state: 'done', completed_at: sqlNow() },
              $unset: { lease: '', lease_until: '' },
            },
          );
        } catch (error) {
          const code = this.errorCode(error);
          const attempt = (job.attempts || 0) + 1;
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
          await this.recordTicketError(
            job.payload.ticket_id,
            code,
            'delivery_error_code',
          );
        }
      }
      const tickets = await this.store
        .collection('tickets')
        .find({
          'bitrix.deal_id': { $exists: true },
          $or: [
            { 'bitrix.next_poll_at': { $exists: false } },
            { 'bitrix.next_poll_at': { $lte: now } },
          ],
        })
        .sort({ 'bitrix.next_poll_at': 1, id: 1 })
        .limit(5)
        .toArray();
      for (const ticket of tickets) {
        try {
          await this.syncTicket(ticket, funnel);
        } catch (error) {
          await this.recordTicketError(ticket.id, this.errorCode(error));
        } finally {
          await this.store
            .collection('tickets')
            .updateOne(
              { id: ticket.id },
              { $set: { 'bitrix.next_poll_at': new Date(Date.now() + 60000) } },
            );
        }
      }
      await state.updateOne(
        { _id: 'health' },
        { $set: { last_sync_at: sqlNow() } },
      );
    } catch (error) {
      const code = this.errorCode(error);
      await this.store
        .collection('bitrix_state')
        .updateOne(
          { _id: 'health' },
          { $set: { checked_at: sqlNow(), error_code: code } },
          { upsert: true },
        )
        .catch(() => undefined);
      this.logger.warn(`Bitrix24 synchronization unavailable (${code}).`);
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      await this.store
        .collection('bitrix_state')
        .updateOne(
          { _id: 'worker', lease },
          { $unset: { lease: '', lease_until: '' } },
        )
        .catch(() => undefined);
      this.running = false;
    }
  }
  private async recordTicketError(
    id: number,
    code: string,
    field = 'error_code',
  ) {
    await this.store
      .collection('tickets')
      .updateOne({ id }, { $set: { ['bitrix.' + field]: code } });
  }
  private async assertOwnership() {
    if ((await this.store.ownership())?.mode !== 'pass')
      throw new Bitrix24Error('operations_paused');
  }
  async assignmentSettings() {
    const settings = await this.store
      .collection('bitrix_state')
      .findOne({ _id: 'assignment-settings' });
    return {
      userId: settings?.user_id || null,
      name: settings?.user_name || '',
    };
  }
  async saveAssignmentSettings(input: any) {
    const id = input.userId == null ? null : integer(input.userId, 'userId', 1);
    const user = id
      ? (await this.client.staff(id)).find((user) => user.id === id)
      : null;
    if (id && !user)
      fail(
        'validation_error',
        'Выберите действующего сотрудника Bitrix24.',
        400,
      );
    await this.assertOwnership();
    await this.store
      .collection('bitrix_state')
      .updateOne(
        { _id: 'assignment-settings' },
        { $set: { user_id: id, user_name: user?.name || '' } },
        { upsert: true },
      );
    return this.assignmentSettings();
  }
  async companies(search = '', start = 0) {
    const result = await this.client.call<any[]>('crm.company.list', {
      filter: search.trim() ? { '%TITLE': search.trim().slice(0, 100) } : {},
      select: ['ID', 'TITLE'],
      order: { TITLE: 'ASC', ID: 'ASC' },
      start,
    });
    return {
      items: result.result.map((company) => ({
        id: Number(company.ID),
        name: company.TITLE,
      })),
      next: result.next ?? null,
    };
  }
  async tenantCompany(profileId: string) {
    const state = await this.store
      .collection('bitrix_state')
      .findOne({ _id: `tenant-company:${profileId}` });
    return {
      company: state?.company_id
        ? { id: state.company_id, name: state.company_name }
        : null,
    };
  }
  async linkTenantCompany(profileId: string, input: any) {
    const id =
      input.companyId == null ? null : integer(input.companyId, 'companyId', 1);
    let name = '';
    if (id) {
      const { result } = await this.client.call<any>('crm.company.get', { id });
      if (Number(result?.ID) !== id)
        fail('validation_error', 'Компания не найдена в Bitrix24.', 400);
      name = result.TITLE || '';
    }
    await this.assertOwnership();
    await this.store.transaction(async (session) => {
      await this.store.assertWritable(session);
      await this.store
        .collection('bitrix_state')
        .updateOne(
          { _id: `tenant-company:${profileId}` },
          { $set: { company_id: id, company_name: name } },
          { upsert: true, session },
        );
      const profiles = await this.store
        .canonical('profiles')
        .find(
          { $or: [{ profileId }, { resourceOwnerProfileId: profileId }] },
          { session },
        )
        .toArray();
      const profileIds = profiles.map((profile) => profile.profileId);
      const members = await this.store
        .canonical('memberships')
        .find({ profileId: { $in: profileIds } }, { session })
        .toArray();
      await this.store.collection('tickets').updateMany(
        {
          'bitrix.managed': true,
          $or: [
            { profile_id: { $in: profileIds } },
            {
              owner_subject: { $in: members.map((member) => member.subject) },
            },
          ],
        },
        {
          $unset: { 'bitrix.customer_version': '' },
          $set: { 'bitrix.next_poll_at': new Date() },
        },
        { session },
      );
    });
    return this.tenantCompany(profileId);
  }

  private async syncAssignment(ticket: any, deal: any) {
    const row = await this.store
      .collection('tickets')
      .findOne({ id: ticket.id });
    const assignment = row?.bitrix;
    if (
      assignment?.assignment_revision >
      (assignment.assignment_synced_revision || 0)
    ) {
      await this.assertOwnership();
      const { result } = await this.client.call<boolean>('crm.deal.update', {
        id: Number(deal.ID),
        fields: { ASSIGNED_BY_ID: assignment.assignment_user_id },
      });
      if (result !== true) throw new Bitrix24Error('invalid_response');
      await this.store.collection('tickets').updateOne(
        {
          id: ticket.id,
          'bitrix.assignment_revision': assignment.assignment_revision,
        },
        {
          $set: {
            'bitrix.assignment_synced_revision': assignment.assignment_revision,
          },
        },
      );
      deal.ASSIGNED_BY_ID = assignment.assignment_user_id;
    }
    // Notifications are sent only for a new Pass assignment, never during legacy backfill.
    if (
      assignment?.assignment_revision &&
      assignment.assignment_revision >
        (assignment.assignment_notified_revision || 0)
    ) {
      await this.assertOwnership();
      const title = (
        await new Bitrix24Customers(this.store, this.client).describe(row)
      ).title;
      const url = this.client.dealUrl(Number(deal.ID));
      let result: number;
      try {
        ({ result } = await this.client.call<number>('im.notify.system.add', {
          USER_ID: assignment.assignment_user_id,
          MESSAGE: `Вам назначена сервисная заявка: [URL=${url}]${title.replace(/[[\]]/g, '')}[/URL]`,
          MESSAGE_OUT: `Вам назначена сервисная заявка: ${title}. ${url}`,
          CLIENT_ID: this.client.originator(),
          TAG: `${this.client.originator()}:ticket:${ticket.id}:assignment:${assignment.assignment_revision}`,
          SUB_TAG: `${this.client.originator()}:ticket:${ticket.id}`,
        }));
      } catch (error) {
        if (
          error instanceof Bitrix24Error &&
          [
            'insufficient_scope',
            'ACCESS_DENIED',
            'ERROR_METHOD_NOT_FOUND',
          ].includes(error.code)
        )
          throw new Bitrix24Error('notification_permission_denied');
        throw error;
      }
      if (!Number.isSafeInteger(Number(result)) || Number(result) <= 0)
        throw new Bitrix24Error('notification_failed');
      await this.store.collection('tickets').updateOne(
        {
          id: ticket.id,
          'bitrix.assignment_revision': assignment.assignment_revision,
        },
        {
          $set: {
            'bitrix.assignment_notified_revision':
              assignment.assignment_revision,
          },
        },
      );
    }
    return {
      id: Number(deal.ASSIGNED_BY_ID) || null,
      name: Number(deal.ASSIGNED_BY_ID)
        ? await this.client.author(String(deal.ASSIGNED_BY_ID))
        : '',
    };
  }
  private async ensureDeal(ticket: any, funnel: ServiceFunnel) {
    if (ticket.bitrix?.deal_id) return Number(ticket.bitrix.deal_id);
    const originator = this.client.originator();
    const deals = await this.client.list<any>('crm.deal.list', {
      filter: { ORIGINATOR_ID: originator, ORIGIN_ID: String(ticket.id) },
      select: ['ID', 'CATEGORY_ID', 'ORIGINATOR_ID', 'ORIGIN_ID'],
    });
    if (deals.length > 1) throw new Bitrix24Error('duplicate_deals');
    let id = Number(deals[0]?.ID || 0);
    if (id && Number(deals[0].CATEGORY_ID) !== funnel.id)
      throw new Bitrix24Error('deal_mismatch');
    if (!id) {
      // Reconcile an interrupted/ambiguous creation; never create a second card blindly.
      if (['sending', 'uncertain'].includes(ticket.bitrix?.create_state))
        throw new Bitrix24Error('delivery_uncertain');
      const { title, description } = await new Bitrix24Customers(
        this.store,
        this.client,
      ).describe(ticket);
      const assignment = ticket.bitrix?.assignment_user_id
        ? {
            userId: ticket.bitrix.assignment_user_id,
            name: ticket.bitrix.assignment_name || '',
          }
        : { userId: null, name: '' };
      await this.assertOwnership();
      await this.store.collection('tickets').updateOne(
        { id: ticket.id },
        {
          $set: {
            'bitrix.create_state': 'sending',
            ...(assignment.userId && !ticket.bitrix?.assignment_revision
              ? {
                  'bitrix.assignment_user_id': assignment.userId,
                  'bitrix.assignment_name': assignment.name,
                  'bitrix.assignment_revision': 1,
                }
              : {}),
          },
        },
      );
      try {
        await this.assertOwnership();
        const response = await this.client.call<number>('crm.deal.add', {
          fields: {
            TITLE: title,
            CATEGORY_ID: funnel.id,
            STAGE_ID: funnel.initialStage,
            ORIGINATOR_ID: originator,
            ORIGIN_ID: String(ticket.id),
            COMMENTS: description,
            ...(assignment.userId ? { ASSIGNED_BY_ID: assignment.userId } : {}),
            ...(ticket.service_order?.totalAmountMinor != null
              ? {
                  OPPORTUNITY: ticket.service_order.totalAmountMinor / 100,
                  CURRENCY_ID: 'RUB',
                }
              : {}),
          },
        });
        id = Number(response.result);
        if (!Number.isInteger(id) || id <= 0)
          throw new Bitrix24Error('invalid_response', true);
      } catch (error) {
        await this.store.collection('tickets').updateOne(
          { id: ticket.id },
          {
            $set: {
              'bitrix.create_state':
                error instanceof Bitrix24Error && !error.uncertain
                  ? 'pending'
                  : 'uncertain',
            },
          },
        );
        throw error;
      }
    }
    await this.store.collection('tickets').updateOne(
      { id: ticket.id },
      {
        $set: {
          'bitrix.managed': true,
          'bitrix.deal_id': id,
          'bitrix.category_id': funnel.id,
          'bitrix.url': this.client.dealUrl(id),
          'bitrix.create_state': 'linked',
        },
      },
    );
    return id;
  }
  async sendTicket(id: number, funnel: ServiceFunnel) {
    const ticket = await this.store.collection('tickets').findOne({ id });
    if (!ticket) return;
    const dealId = await this.ensureDeal(ticket, funnel);
    const comments = await this.client.comments(dealId);
    const messages = await this.store
      .collection('messages')
      .find({
        request_id: id,
        'bitrix.direction': { $ne: 'in' },
        'bitrix.sent': { $ne: true },
      })
      .sort({ id: 1 })
      .toArray();
    for (const message of messages) {
      const marker = commentMarker(this.client.originator(), message.id);
      const matches = comments.filter((comment) =>
        comment.COMMENT?.includes(marker),
      );
      if (matches.length > 1) throw new Bitrix24Error('delivery_uncertain');
      let commentId = Number(matches[0]?.ID || 0);
      if (!commentId) {
        if (['sending', 'uncertain'].includes(message.bitrix?.state))
          throw new Bitrix24Error('delivery_uncertain');
        await this.assertOwnership();
        const files: [string, string][] = [];
        for (const attachment of message.attachments || []) {
          const file = await this.store
            .collection('attachments')
            .findOne({ id: attachment.attachment_id, request_id: id });
          if (!file) throw new Bitrix24Error('attachment_missing');
          const chunks: Buffer[] = [];
          for await (const chunk of this.bucket().openDownloadStream(
            new ObjectId(file.grid_id),
          ))
            chunks.push(chunk as Buffer);
          files.push([
            file.original_name,
            Buffer.concat(chunks).toString('base64'),
          ]);
        }
        await this.store
          .collection('messages')
          .updateOne(
            { id: message.id },
            { $set: { 'bitrix.state': 'sending' } },
          );
        try {
          const response = await this.client.call<number>(
            'crm.timeline.comment.add',
            {
              fields: {
                ENTITY_TYPE: 'deal',
                ENTITY_ID: dealId,
                COMMENT: commentText(message, this.client.originator()),
                ...(files.length ? { FILES: files } : {}),
              },
            },
          );
          commentId = Number(response.result);
          if (!Number.isInteger(commentId) || commentId <= 0)
            throw new Bitrix24Error('invalid_response', true);
        } catch (error) {
          await this.store.collection('messages').updateOne(
            { id: message.id },
            {
              $set: {
                'bitrix.state':
                  error instanceof Bitrix24Error && !error.uncertain
                    ? 'pending'
                    : 'uncertain',
              },
            },
          );
          throw error;
        }
      }
      await this.store.collection('messages').updateOne(
        { id: message.id },
        {
          $set: {
            'bitrix.sent': true,
            'bitrix.state': 'sent',
            'bitrix.comment_id': commentId,
            'bitrix.direction': 'out',
          },
        },
      );
    }
    await this.store
      .collection('tickets')
      .updateOne({ id }, { $set: { 'bitrix.delivery_error_code': '' } });
    await this.syncTicket(
      { ...ticket, bitrix: { ...ticket.bitrix, deal_id: dealId } },
      funnel,
    );
  }
  async syncTicket(ticket: any, funnel: ServiceFunnel) {
    const dealId = Number(ticket.bitrix.deal_id);
    const { result: deal } = await this.client.call<any>('crm.deal.get', {
      id: dealId,
    });
    if (
      Number(deal.CATEGORY_ID) !== funnel.id ||
      deal.ORIGINATOR_ID !== this.client.originator() ||
      String(deal.ORIGIN_ID) !== String(ticket.id)
    )
      throw new Bitrix24Error('deal_mismatch');
    let customerError = '';
    if (ticket.bitrix?.customer_version !== 1) {
      try {
        await new Bitrix24Customers(this.store, this.client).sync(ticket, deal);
      } catch (error) {
        customerError = this.errorCode(error);
      }
    }
    let assignmentError = '';
    let assignee: { id: number | null; name: string } | null = null;
    try {
      assignee = await this.syncAssignment(ticket, deal);
    } catch (error) {
      assignmentError = this.errorCode(error);
    }
    const comments = await this.client.comments(dealId);
    const incoming = comments.filter(
      (comment) =>
        comment.ENTITY_TYPE === 'deal' && Number(comment.ENTITY_ID) === dealId,
    );
    for (const comment of incoming) {
      const sourceKey = `${this.client.originator()}:crm-comment:${comment.ID}`;
      // Linked Pass comments are already in the conversation; don't echo them back.
      const outgoing = await this.store.collection('messages').findOne({
        request_id: ticket.id,
        'bitrix.comment_id': Number(comment.ID),
        'bitrix.direction': 'out',
      });
      if (outgoing) continue;
      const ownMarker = new RegExp(
        `\\[PASS:${this.client.originator()}:(\\d+)\\]`,
      ).exec(comment.COMMENT || '');
      if (ownMarker) {
        const original = await this.store.collection('messages').findOne({
          id: Number(ownMarker[1]),
          request_id: ticket.id,
          'bitrix.direction': { $ne: 'in' },
        });
        if (original) {
          await this.store.collection('messages').updateOne(
            { id: original.id },
            {
              $set: {
                'bitrix.sent': true,
                'bitrix.state': 'sent',
                'bitrix.comment_id': Number(comment.ID),
                'bitrix.direction': 'out',
              },
            },
          );
          continue;
        }
      }
      const plain = crmPlainText(comment.COMMENT);
      // Explicitly marked internal notes never enter the tenant conversation.
      const internal = /^\[(?:внутреннее|internal)\]/i.test(plain);
      const hash = createHash('sha256')
        .update(
          JSON.stringify({
            text: plain,
            files: Object.values(comment.FILES || {}).map((file: any) => [
              file.id,
              file.name,
              file.size,
              file.date,
            ]),
          }),
        )
        .digest('hex');
      const existing = await this.store
        .collection('messages')
        .findOne({ source_key: sourceKey });
      if (internal) {
        if (existing && !existing.deleted)
          await this.updateImportedMessage(
            existing,
            'Комментарий скрыт в CRM',
            [],
            true,
          );
        continue;
      }
      if (
        existing?.bitrix?.hash === hash &&
        !existing.bitrix?.files_pending &&
        !existing.deleted
      )
        continue;
      const files = await this.receiveFiles(ticket.id, comment);
      const text =
        (
          plain +
          files.errors
            .map((name) => `\nВложение «${name}» пока недоступно.`)
            .join('')
        ).trim() || 'Вложение';
      const author = await this.client.author(String(comment.AUTHOR_ID));
      await this.store.transaction(async (session) => {
        await this.store.assertWritable(session);
        const current = await this.store
          .collection('messages')
          .findOne({ source_key: sourceKey }, { session });
        if (current) {
          await this.store.collection('messages').updateOne(
            { id: current.id },
            {
              $set: {
                message_text: text,
                attachments: files.attachments,
                deleted: false,
                edited_at: sqlNow(),
                'bitrix.hash': hash,
                'bitrix.files_pending': files.errors.length > 0,
              },
            },
            { session },
          );
          await this.store
            .collection('tickets')
            .updateOne(
              { id: ticket.id },
              { $inc: { revision: 1 }, $set: { updated_at: sqlNow() } },
              { session },
            );
          await this.refreshPreview(ticket.id, current.id, text, session);
        } else {
          const row = await this.store
            .collection('tickets')
            .findOne({ id: ticket.id }, { session });
          const id = await this.store.nextId('messages', session);
          const created = new Date(comment.CREATED);
          await this.store.collection('messages').insertOne(
            {
              id,
              request_id: ticket.id,
              source_key: sourceKey,
              author_type: 'support',
              author_ref: 'bitrix:user:' + comment.AUTHOR_ID,
              author_label: author,
              author_role: 'Служба сервиса',
              message_text: text,
              attachments: files.attachments,
              created_at: Number.isFinite(created.getTime())
                ? sqlNow(created)
                : sqlNow(),
              bitrix: {
                direction: 'in',
                comment_id: Number(comment.ID),
                hash,
                files_pending: files.errors.length > 0,
              },
            },
            { session },
          );
          const seq = (row!.message_seq || 0) + 1;
          await this.store.collection('tickets').updateOne(
            { id: ticket.id },
            {
              $set: {
                message_seq: seq,
                last_support_seq: seq,
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
            ticket.id,
            'support.crm_reply',
            SYSTEM,
            { comment_id: Number(comment.ID) },
            session,
          );
        }
      });
    }
    const present = new Set(incoming.map((comment) => Number(comment.ID)));
    const imported = await this.store
      .collection('messages')
      .find({
        request_id: ticket.id,
        'bitrix.direction': 'in',
        deleted: { $ne: true },
      })
      .toArray();
    for (const message of imported)
      if (!present.has(message.bitrix.comment_id))
        await this.updateImportedMessage(
          message,
          'Комментарий удалён в CRM',
          [],
          true,
        );
    const status = crmTicketStatus(deal, funnel.stages);
    const stageName =
      funnel.stages.find((stage) => stage.id === String(deal.STAGE_ID))?.name ||
      String(deal.STAGE_ID);
    await this.store.transaction(async (session) => {
      await this.store.assertWritable(session);
      const row = await this.store
        .collection('tickets')
        .findOne({ id: ticket.id }, { session });
      await this.store.collection('tickets').updateOne(
        { id: ticket.id },
        {
          $set: {
            status,
            'bitrix.stage_id': String(deal.STAGE_ID),
            'bitrix.stage_name': stageName,
            'bitrix.last_synced_at': sqlNow(),
            'bitrix.error_code': '',
            'bitrix.customer_error_code': customerError,
            'bitrix.assignment_error_code': assignmentError,
            ...(assignee ? { 'bitrix.assignee': assignee } : {}),
            ...(row!.status !== status ? { updated_at: sqlNow() } : {}),
          },
          ...(row!.status !== status ? { $inc: { revision: 1 } } : {}),
        },
        { session },
      );
      if (row!.status !== status)
        await this.store.event(
          'ticket',
          ticket.id,
          'support.crm_status_changed',
          SYSTEM,
          { from: row!.status, to: status, stage_id: deal.STAGE_ID },
          session,
        );
    });
  }
  private async updateImportedMessage(
    message: any,
    text: string,
    attachments: any[],
    deleted: boolean,
  ) {
    await this.store.transaction(async (session) => {
      await this.store.assertWritable(session);
      await this.store.collection('messages').updateOne(
        { id: message.id },
        {
          $set: {
            message_text: text,
            attachments,
            deleted,
            edited_at: sqlNow(),
          },
        },
        { session },
      );
      await this.store
        .collection('tickets')
        .updateOne(
          { id: message.request_id },
          { $inc: { revision: 1 }, $set: { updated_at: sqlNow() } },
          { session },
        );
      await this.refreshPreview(message.request_id, message.id, text, session);
    });
  }
  private async refreshPreview(
    ticketId: number,
    messageId: number,
    text: string,
    session: import('mongodb').ClientSession,
  ) {
    const latest = await this.store
      .collection('messages')
      .findOne({ request_id: ticketId }, { session, sort: { id: -1 } });
    if (latest?.id === messageId)
      await this.store
        .collection('tickets')
        .updateOne(
          { id: ticketId },
          { $set: { last_message_preview: text.slice(0, 160) } },
          { session },
        );
  }
  private async receiveFiles(ticketId: number, comment: CrmComment) {
    const attachments: any[] = [],
      errors: string[] = [];
    for (const file of Object.values(comment.FILES || {}).slice(0, 10)) {
      const name = String(file.name || 'Вложение').replace(/[\\/]/g, '_');
      const key = `${this.client.originator()}:crm-file:${comment.ID}:${file.id}:${file.date || ''}`;
      try {
        const existing = await this.store
          .collection('attachments')
          .findOne({ source_key: key });
        if (existing) {
          attachments.push({
            attachment_id: existing.id,
            original_name: existing.original_name,
            mime_type: existing.mime_type,
            size: existing.size,
          });
          continue;
        }
        const url = new URL(file.urlDownload, this.client.webhook().origin);
        if (
          url.origin !== this.client.webhook().origin ||
          url.protocol !== 'https:' ||
          Number(file.size) > 10485760
        )
          throw new Error();
        const response = await fetch(url, {
          redirect: 'error',
          signal: AbortSignal.timeout(20000),
        });
        if (
          !response.ok ||
          !response.body ||
          Number(response.headers.get('content-length')) > 10485760
        )
          throw new Error();
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of response.body as any) {
          size += chunk.length;
          if (size > 10485760) throw new Error();
          chunks.push(Buffer.from(chunk));
        }
        const bytes = Buffer.concat(chunks);
        const mime = validateAttachment(name, bytes);
        const stream = this.bucket().openUploadStream(name);
        await new Promise<void>((resolve, reject) => {
          stream.on('finish', resolve);
          stream.on('error', reject);
          stream.end(bytes);
        });
        let committed = false;
        try {
          const attachment = await this.store.transaction(async (session) => {
            await this.store.assertWritable(session);
            const prior = await this.store
              .collection('attachments')
              .findOne({ source_key: key }, { session });
            if (prior) return prior;
            const record = {
              id: await this.store.nextId('attachments', session),
              source_key: key,
              request_id: ticketId,
              grid_id: stream.id,
              actor_ref: SYSTEM.ref,
              original_name: name,
              mime_type: mime,
              size: bytes.length,
              sha256: createHash('sha256').update(bytes).digest('hex'),
              created_at: sqlNow(),
            };
            await this.store
              .collection('attachments')
              .insertOne(record, { session });
            return record;
          });
          committed = String(attachment.grid_id) === String(stream.id);
          attachments.push({
            attachment_id: attachment.id,
            original_name: attachment.original_name,
            mime_type: attachment.mime_type,
            size: attachment.size,
          });
        } finally {
          if (!committed)
            await this.bucket()
              .delete(stream.id)
              .catch(() => undefined);
        }
      } catch {
        errors.push(name);
      }
    }
    return { attachments, errors };
  }
}
