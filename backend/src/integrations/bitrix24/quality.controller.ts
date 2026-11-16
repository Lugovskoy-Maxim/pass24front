import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequireAllPermissions } from '../../auth/permissions.decorator';
import { OperationsStore } from '../../operations/operations.store';
import { buildWeeklyQualityReport, qualityWeekBounds } from './quality-report';

interface QualityTicket {
  _id: string;
  title: string;
  createdAt: Date;
  officeId?: string | null;
  autoOfficeId?: string;
  passTicketId?: string;
  important?: boolean;
  excluded?: boolean;
  requests: {
    token: string;
    createdAt: Date;
    answer?: { score: number; comment: string; receivedAt: Date };
  }[];
}

@Controller('admin/quality')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequireAllPermissions('admin.panel', 'support.manage')
export class QualityAdminController {
  constructor(private readonly store: OperationsStore) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(
    @Query('week') week?: string,
    @Query('officeId') officeId?: string,
    @Query('importantOnly') importantOnly?: string,
    @Query('page') pageParam = '1',
    @Query('pageSize') sizeParam = '25',
  ) {
    if (
      (week !== undefined && typeof week !== 'string') ||
      (officeId !== undefined && typeof officeId !== 'string') ||
      (importantOnly !== undefined &&
        !['true', 'false'].includes(importantOnly))
    ) {
      throw new BadRequestException('Неверный формат фильтров');
    }
    const requestedPage = Number(pageParam);
    const pageSize = Number(sizeParam);
    if (
      typeof pageParam !== 'string' ||
      typeof sizeParam !== 'string' ||
      !Number.isSafeInteger(requestedPage) ||
      requestedPage < 1 ||
      ![25, 50, 100].includes(pageSize)
    ) {
      throw new BadRequestException('Неверные параметры страницы');
    }
    const collection = this.store.collection<QualityTicket>('quality_tickets');
    const filter = {
      ...(officeId
        ? {
            $or: [
              { officeId },
              { officeId: { $in: ['', null] }, autoOfficeId: officeId },
            ],
          }
        : {}),
      ...(importantOnly === 'true' ? { important: true } : {}),
    };
    const total = await collection.countDocuments(filter);
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, pages);
    const rows = await collection
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray();
    const passIds = [
      ...new Set(
        rows.flatMap(({ passTicketId }) => {
          const id = Number(passTicketId);
          return Number.isSafeInteger(id) && id > 0 ? [id] : [];
        }),
      ),
    ];
    const linked = passIds.length
      ? await this.store
          .collection('tickets')
          .find(
            { id: { $in: passIds }, 'bitrix.deal_id': { $exists: true } },
            { projection: { id: 1, 'bitrix.deal_id': 1 } },
          )
          .toArray()
      : [];
    const dealByTicket = new Map(
      linked.map((ticket) => [
        String(ticket.id),
        String(ticket.bitrix.deal_id),
      ]),
    );
    const tickets = rows.map((row) => ({
      ...row,
      officeId: row.officeId || row.autoOfficeId || '',
      chatAvailable:
        !!row.passTicketId && dealByTicket.get(row.passTicketId) === row._id,
    }));
    let report: ReturnType<typeof buildWeeklyQualityReport> | null = null;
    if (week !== undefined) {
      try {
        const [start, end] = qualityWeekBounds(week);
        const range = { $gte: new Date(start), $lt: new Date(end) };
        const reportRows = await collection
          .find(
            {
              $and: [
                filter,
                {
                  $or: [
                    { createdAt: range },
                    { 'requests.createdAt': range },
                    { 'requests.answer.receivedAt': range },
                  ],
                },
              ],
            },
            { projection: { createdAt: 1, excluded: 1, requests: 1 } },
          )
          .toArray();
        report = buildWeeklyQualityReport(
          reportRows.map((ticket) => ({
            createdAt: ticket.createdAt,
            excluded: ticket.excluded,
            requests: ticket.requests ?? [],
          })),
          week,
        );
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        throw new BadRequestException(
          'Укажите понедельник в формате ГГГГ-ММ-ДД',
        );
      }
    }
    const sync = await this.store
      .collection('quality_sync')
      .findOne(
        { _id: 'deals' },
        { projection: { scannedAt: 1, completedAt: 1 } },
      );
    return {
      tickets,
      pagination: { page, pageSize, pages, total },
      report,
      lastSyncedAt: sync?.completedAt ?? sync?.scannedAt ?? null,
    };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body('important') important: unknown,
    @Body('excluded') excluded: unknown,
    @Body('officeId') officeId: unknown,
  ) {
    if (
      (important !== undefined && typeof important !== 'boolean') ||
      (excluded !== undefined && typeof excluded !== 'boolean') ||
      (officeId !== undefined && typeof officeId !== 'string')
    ) {
      throw new BadRequestException('Неверный формат отметок или офиса');
    }
    const ticket = await this.store
      .collection<QualityTicket>('quality_tickets')
      .findOneAndUpdate(
        { _id: id },
        {
          $set: {
            ...(typeof important === 'boolean' ? { important } : {}),
            ...(typeof excluded === 'boolean' ? { excluded } : {}),
            ...(typeof officeId === 'string'
              ? { officeId: officeId.trim() }
              : {}),
          },
        },
        { returnDocument: 'after' },
      );
    if (!ticket) throw new NotFoundException();
    return ticket;
  }

  @Post(':id/requests')
  async create(
    @Param('id') id: string,
    @Body('repeat') repeat: unknown,
    @Body('chat') chat: unknown,
  ) {
    if (
      (repeat !== undefined && typeof repeat !== 'boolean') ||
      (chat !== undefined && typeof chat !== 'boolean')
    ) {
      throw new BadRequestException('Неверный формат запроса оценки');
    }
    const tickets = this.store.collection<QualityTicket>('quality_tickets');
    const linked =
      chat === true ? { passTicketId: { $regex: /^[1-9]\d*$/ } } : {};
    if (chat === true) {
      const ticket = await tickets.findOne({ _id: id, ...linked });
      const linkedTicket =
        ticket &&
        (await this.store.collection('tickets').findOne({
          id: Number(ticket.passTicketId),
          'bitrix.deal_id': Number(id),
        }));
      if (!linkedTicket) throw new NotFoundException('Чат заявки не найден');
    }
    const request = {
      token: randomBytes(32).toString('base64url'),
      createdAt: new Date(),
      ...(chat === true ? { chat: true, chatAt: new Date() } : {}),
    };
    const ticket =
      (await tickets.findOneAndUpdate(
        {
          _id: id,
          ...linked,
          ...(repeat === true ? {} : { 'requests.0': { $exists: false } }),
        },
        { $push: { requests: request } },
        { returnDocument: 'after' },
      )) ?? (await tickets.findOne({ _id: id, ...linked }));
    if (!ticket) throw new NotFoundException();
    const latest = ticket.requests?.at(-1);
    if (!latest) throw new NotFoundException();
    if (chat === true && latest.token !== request.token) {
      await tickets.updateOne(
        {
          _id: id,
          requests: {
            $elemMatch: { token: latest.token, chat: { $ne: true } },
          },
        },
        { $set: { 'requests.$.chat': true, 'requests.$.chatAt': new Date() } },
      );
    }
    return { token: latest.token, createdAt: latest.createdAt };
  }
}

@Controller('quality-rating')
export class QualityRatingController {
  constructor(private readonly store: OperationsStore) {}

  @Get(':token')
  @Header('Cache-Control', 'no-store')
  async get(@Param('token') token: string) {
    const ticket = await this.store
      .collection('quality_tickets')
      .findOne(
        { 'requests.token': token },
        { projection: { title: 1, requests: { $elemMatch: { token } } } },
      );
    if (!ticket) throw new NotFoundException();
    return { title: ticket.title, answer: ticket.requests[0].answer ?? null };
  }

  @Post(':token')
  @Header('Cache-Control', 'no-store')
  async answer(
    @Param('token') token: string,
    @Body('score') score: unknown,
    @Body('comment') comment: unknown,
  ) {
    if (
      typeof score !== 'number' ||
      !Number.isInteger(score) ||
      score < 1 ||
      score > 5
    ) {
      throw new BadRequestException(
        'Оценка должна быть целым числом от 1 до 5',
      );
    }
    if (
      comment !== undefined &&
      (typeof comment !== 'string' || comment.length > 500)
    ) {
      throw new BadRequestException(
        'Комментарий должен содержать не более 500 символов',
      );
    }
    await this.store.collection('quality_tickets').updateOne(
      { requests: { $elemMatch: { token, answer: { $exists: false } } } },
      {
        $set: {
          'requests.$.answer': {
            score,
            comment: typeof comment === 'string' ? comment.trim() : '',
            receivedAt: new Date(),
          },
        },
      },
    );
    return this.get(token);
  }
}
