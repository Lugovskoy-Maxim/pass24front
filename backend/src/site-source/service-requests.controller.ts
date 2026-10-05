import {
  Body,
  Controller,
  Get,
  Headers,
  Header,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { OperationsIdentity } from '../operations/operations.identity';
import { OperationsSupport } from '../operations/operations.support';
import { OperationsExceptionFilter } from '../operations/operations.controller';
import {
  fail,
  integer,
  OperationsActor,
  requirePermission,
} from '../operations/operations.rules';
import {
  CreateServiceRequestDto,
  TicketMessageDto,
  UpdateServiceRequestStatusDto,
} from './site-source.dto';

/** Compatibility shape for the existing Pass client; all writes use Mongo services. */
@Controller('service-requests')
@UseGuards(AuthGuard('jwt'))
@UseFilters(OperationsExceptionFilter)
export class ServiceRequestsController {
  constructor(
    private readonly identity: OperationsIdentity,
    private readonly support: OperationsSupport,
  ) {}
  private async actor(user: any): Promise<OperationsActor> {
    if (
      user.permissions?.includes('support.manage') &&
      user.permissions?.includes('admin.panel')
    )
      return this.identity.nativeActor(user);
    if (
      !user.permissions?.some((p: string) =>
        ['requests.view_own', 'requests.create', 'passes.view_own'].includes(p),
      )
    )
      fail('forbidden', 'Нет доступа.', 403);
    const person = await this.identity.store
      .canonical('identities')
      .findOne({ userId: String(user.userId), identityStatus: 'active' });
    if (!person) fail('forbidden', 'Профиль пользователя недоступен.', 403);
    return {
      kind: 'resident',
      ref: 'resident:' + person.subject,
      subject: person.subject,
      name: person.displayName,
    };
  }
  private ticket(row: any) {
    return {
      id: String(row.id),
      status: row.status,
      title: row.subject,
      topic: row.topic_key,
      created: row.created_at,
      created_at: row.created_at,
      requester: row.requester_name,
      requester_name: row.requester_name,
      office: row.office || null,
      office_id: row.office_id || null,
      office_ids: row.office_ids || [],
      office_label: row.office_label || null,
      office_category: row.office_category || null,
      service_order: row.service_order || null,
      raw: { ...row },
    };
  }
  @Get()
  async list(@Req() req: any) {
    const result = await this.support.list(await this.actor(req.user), {
      per_page: 100,
    });
    return {
      stub: false,
      fields: [],
      items: result.items.map((row) => this.ticket(row)),
      total: result.total,
      topics: result.topics,
    };
  }
  @Get('attachments/:id')
  @Header('Cache-Control', 'no-store')
  async download(
    @Req() req: any,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const file = await this.support.download(
      await this.actor(req.user),
      integer(id, 'id', 1),
    );
    response
      .set({
        'Content-Type': file.mime,
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      })
      .send(file.bytes);
  }
  @Get(':id')
  async get(@Param('id') id: string, @Req() req: any) {
    const result = await this.support.detail(
      await this.actor(req.user),
      integer(id, 'id', 1),
    );
    return {
      stub: false,
      ticket: this.ticket(result.ticket),
      messages: result.messages.map((row) => ({
        ...row,
        body: row.message_text,
        text: row.message_text,
      })),
    };
  }
  @Post()
  async create(
    @Req() req: any,
    @Body() dto: CreateServiceRequestDto,
    @Headers('idempotency-key') key: string,
  ) {
    const actor = await this.actor(req.user);
    if (
      actor.kind !== 'resident' ||
      !req.user.permissions?.some((p: string) =>
        ['requests.create', 'passes.view_own'].includes(p),
      )
    )
      fail('forbidden', 'Создание обращений недоступно.', 403);
    const result = await this.support.create(
      actor,
      {
        topic_key: dto.topic,
        subject: dto.subject,
        message_text: dto.body,
        office_id: dto.officeId,
        service_id: dto.serviceId,
        quantity: dto.quantity,
      },
      key || randomUUID(),
    );
    return {
      stored: true,
      message: 'Обращение создано',
      ticket: this.ticket(result.ticket),
    };
  }
  @Post(':id/messages')
  async reply(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: TicketMessageDto,
    @Headers('idempotency-key') key: string,
  ) {
    const result = await this.support.reply(
      await this.actor(req.user),
      integer(id, 'id', 1),
      { message_text: dto.body },
      key || randomUUID(),
    );
    return {
      stored: true,
      message: 'Ответ отправлен',
      ticket: this.ticket(result.ticket),
    };
  }
  @Patch(':id/status')
  async status(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateServiceRequestStatusDto,
    @Headers('idempotency-key') key: string,
  ) {
    const actor = await this.actor(req.user);
    requirePermission(actor, 'support.manage');
    const detail = await this.support.detail(actor, integer(id, 'id', 1));
    const status =
      (
        {
          resolved: 'completed',
          closed: 'completed',
          open: 'in_progress',
        } as Record<string, string>
      )[dto.status] || dto.status;
    const result = await this.support.status(
      actor,
      integer(id, 'id', 1),
      { status, revision: detail.ticket.revision },
      key || randomUUID(),
    );
    return {
      stored: true,
      message: 'Статус изменён',
      ticket: this.ticket(result.ticket),
    };
  }
}
