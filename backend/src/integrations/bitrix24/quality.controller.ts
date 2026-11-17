import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  Get,
  Header,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequireAllPermissions } from '../../auth/permissions.decorator';
import { OperationsStore } from '../../operations/operations.store';
import {
  DEFAULT_OFFICE_CATEGORIES,
  normalizeOfficeCategory,
} from '../../office-services/office-services.rules';
import { buildWeeklyQualityReport, qualityWeekBounds } from './quality-report';
import { Bitrix24Client } from './bitrix24.client';
import { SmsService } from '../../sms/sms.service';
import { MailService } from '../../mail/mail.service';
import { isEmail } from 'class-validator';

interface QualityTicket {
  _id: string;
  title: string;
  stageName?: string;
  source?: string;
  creatorName?: string;
  createdAt: Date;
  closedAt?: Date | null;
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

const ratingStage = /^\s*(Можно закрывать|Сделка успешна)\s*$/i;

function qualitySearch(value: string) {
  if (typeof value !== 'string' || value.length > 100)
    throw new BadRequestException('Неверный поисковый запрос');
  const term = value.trim().replace(/^№\s*/, '');
  if (!term) return {};
  const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return {
    $and: [
      {
        $or: [
          ...(/^\d+$/.test(term) ? [{ _id: term }] : []),
          { officeId: pattern },
          { officeId: { $in: ['', null] }, autoOfficeId: pattern },
        ],
      },
    ],
  };
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return (
    '"' +
    (/^[\s\uFEFF]*[=+@-]|^[\t\r\n]/u.test(text) ? "'" : '') +
    text.replace(/"/g, '""') +
    '"'
  );
}

@Controller('admin/quality')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@RequireAllPermissions('admin.panel', 'support.manage')
export class QualityAdminController {
  constructor(
    private readonly store: OperationsStore,
    @Optional() private readonly bitrix?: Bitrix24Client,
    @Optional() private readonly sms?: SmsService,
    @Optional() private readonly mail?: MailService,
  ) {}

  @Post(':id/email')
  async sendEmail(
    @Param('id') id: string,
    @Body('email') email: unknown,
    @Body('subject') subject: unknown,
    @Body('text') text: unknown,
  ) {
    if (
      typeof email !== 'string' ||
      email.length > 254 ||
      !isEmail(email.trim()) ||
      typeof subject !== 'string' ||
      !subject.trim() ||
      subject.length > 160 ||
      /[\r\n]/.test(subject) ||
      typeof text !== 'string' ||
      !text.trim() ||
      text.length > 4000
    ) {
      throw new BadRequestException('Укажите адрес, тему и текст письма');
    }
    const ticket = await this.store
      .collection<QualityTicket>('quality_tickets')
      .findOne({ _id: id }, { projection: { stageName: 1 } });
    if (!ticket) throw new NotFoundException();
    if (!ratingStage.test(ticket.stageName ?? ''))
      throw new ConflictException(
        'На текущей стадии отправка письма недоступна',
      );
    if (!this.mail?.isConfigured())
      throw new BadRequestException('Почтовый сервер не настроен');
    await this.mail.sendServiceRequestEmail(
      email.trim(),
      subject.trim(),
      text.trim(),
    );
    return { accepted: true };
  }

  @Post(':id/sms')
  async sendSms(
    @Param('id') id: string,
    @Body('phone') phone: unknown,
    @Body('text') text: unknown,
  ) {
    if (
      typeof phone !== 'string' ||
      phone.length > 30 ||
      typeof text !== 'string' ||
      !text.trim() ||
      text.trim().length > 160
    ) {
      throw new BadRequestException('Укажите телефон и текст до 160 символов');
    }
    const ticket = await this.store
      .collection<QualityTicket>('quality_tickets')
      .findOne({ _id: id }, { projection: { stageName: 1 } });
    if (!ticket) throw new NotFoundException();
    if (!ratingStage.test(ticket.stageName ?? ''))
      throw new ConflictException('На текущей стадии отправка СМС недоступна');
    if (!this.sms?.textEnabled())
      throw new BadRequestException('Обычные СМС не настроены');
    await this.sms.sendText(phone.trim(), text.trim());
    return { accepted: true };
  }

  @Get('offices')
  @Header('Cache-Control', 'no-store')
  async offices() {
    const db = this.store.connection.db!;
    const [offices, properties] = await Promise.all([
      db
        .collection('offices')
        .find({}, { projection: { number: 1, property: 1 } })
        .toArray(),
      db
        .collection('properties')
        .find({}, { projection: { name: 1 } })
        .toArray(),
    ]);
    const names = new Map(
      properties.map(({ _id, name }) => [
        String(_id),
        String(name ?? '').replace(/^БЦ\s+/i, ''),
      ]),
    );
    return [
      ...new Set(
        offices.flatMap(({ number, property }) =>
          typeof number === 'string' && number
            ? [
                [names.get(String(property)), number]
                  .filter(Boolean)
                  .join(' · '),
              ]
            : [],
        ),
      ),
    ].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
  }

  @Get('export')
  @Header('Cache-Control', 'no-store')
  exportCsv(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('officeId') officeId?: string,
    @Query('importantOnly') importantOnly?: string,
    @Query('hideOpen') hideOpen?: string,
    @Query('q') q = '',
  ) {
    const parseDay = (value: string) => {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return NaN;
      const date = new Date(value + 'T00:00:00Z');
      return Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
        ? date.getTime() - 10800000
        : NaN;
    };
    const start = parseDay(from);
    const end = parseDay(to);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end < start ||
      (officeId !== undefined && typeof officeId !== 'string')
    ) {
      throw new BadRequestException(
        'Укажите корректный период создания заявок',
      );
    }
    const cursor = this.store
      .collection<QualityTicket>('quality_tickets')
      .find({
        createdAt: { $gte: new Date(start), $lt: new Date(end + 86400000) },
        ...(officeId
          ? {
              $or: [
                { officeId },
                { officeId: { $in: ['', null] }, autoOfficeId: officeId },
              ],
            }
          : {}),
        ...(importantOnly === 'true' ? { important: true } : {}),
        ...(hideOpen === 'true' ? { stageName: ratingStage } : {}),
        ...qualitySearch(q),
      })
      .sort({ createdAt: -1, _id: -1 });
    const format = new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Europe/Moscow',
      dateStyle: 'short',
      timeStyle: 'short',
    });
    async function* rows() {
      try {
        yield '\uFEFF' +
          [
            'Номер',
            'Тема',
            'Источник',
            'Создана (МСК)',
            'Закрыта (МСК)',
            'Статус',
            'Автор',
            'Офис',
            'Последний запрос (МСК)',
            'Состояние запроса',
            'Последняя оценка',
            'Комментарий',
            'Дата оценки (МСК)',
            'Важная',
            'Исключена из отчёта',
          ]
            .map(csvCell)
            .join(';') +
          '\r\n';
        for await (const ticket of cursor) {
          const latest = ticket.requests?.at(-1);
          let answer:
            | NonNullable<QualityTicket['requests'][number]['answer']>
            | undefined;
          for (const item of ticket.requests ?? []) {
            if (
              item.answer &&
              (!answer || item.answer.receivedAt >= answer.receivedAt)
            )
              answer = item.answer;
          }
          yield [
            ticket._id,
            ticket.title,
            ticket.source,
            format.format(ticket.createdAt),
            ticket.closedAt && format.format(ticket.closedAt),
            ticket.stageName,
            ticket.creatorName,
            ticket.officeId || ticket.autoOfficeId,
            latest && format.format(latest.createdAt),
            latest && (latest.answer ? 'Получен ответ' : 'Ожидает ответа'),
            answer?.score,
            answer?.comment,
            answer && format.format(answer.receivedAt),
            ticket.important ? 'Да' : 'Нет',
            ticket.excluded ? 'Да' : 'Нет',
          ]
            .map(csvCell)
            .join(';') + '\r\n';
        }
      } finally {
        await cursor.close();
      }
    }
    return new StreamableFile(Readable.from(rows()), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="quality-${from}-${to}.csv"`,
    });
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(
    @Query('week') week?: string,
    @Query('officeId') officeId?: string,
    @Query('importantOnly') importantOnly?: string,
    @Query('page') pageParam = '1',
    @Query('pageSize') sizeParam = '25',
    @Query('hideOpen') hideOpen = 'false',
    @Query('q') q = '',
  ) {
    if (
      (week !== undefined && typeof week !== 'string') ||
      (officeId !== undefined && typeof officeId !== 'string') ||
      !['true', 'false'].includes(hideOpen) ||
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
    const tableFilter = {
      ...filter,
      ...(hideOpen === 'true' ? { stageName: ratingStage } : {}),
      ...qualitySearch(q),
    };
    const total = await collection.countDocuments(tableFilter);
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, pages);
    const rows = await collection
      .find(tableFilter)
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
    const crmOrigin = this.bitrix?.configured()
      ? this.bitrix.webhook().origin
      : '';
    const tickets = rows.map((row) => ({
      ...row,
      officeId: row.officeId || row.autoOfficeId || '',
      ratingAvailable: ratingStage.test(row.stageName ?? ''),
      crmUrl:
        crmOrigin && /^\d+$/.test(row._id)
          ? crmOrigin + '/crm/deal/details/' + row._id + '/'
          : null,
      chatAvailable:
        !!row.passTicketId && dealByTicket.get(row.passTicketId) === row._id,
    }));
    const labels = [
      ...new Set(tickets.map(({ officeId }) => officeId).filter(Boolean)),
    ];
    const officeCategories = new Map<string, { name: string; color: string }>();
    if (labels.length) {
      const db = this.store.connection.db!;
      const officeNumbers = labels.map((label) => label.split(' · ').at(-1)!);
      const offices = await db
        .collection('offices')
        .find(
          { number: { $in: officeNumbers } },
          { projection: { number: 1, property: 1, officeFormat: 1 } },
        )
        .toArray();
      const [properties, categories] = await Promise.all([
        db
          .collection('properties')
          .find(
            {
              _id: {
                $in: offices.flatMap(({ property }) =>
                  property ? [property] : [],
                ),
              },
            },
            { projection: { name: 1 } },
          )
          .toArray(),
        db
          .collection('office_categories')
          .find({}, { projection: { code: 1, name: 1, color: 1 } })
          .toArray(),
      ]);
      const propertyNames = new Map(
        properties.map(({ _id, name }) => [
          String(_id),
          String(name ?? '').replace(/^БЦ\s+/i, ''),
        ]),
      );
      const byCode = new Map(
        [
          ...DEFAULT_OFFICE_CATEGORIES,
          ...categories.map(({ code, name, color }) => ({ code, name, color })),
        ].map((category) => [category.code, category]),
      );
      for (const label of labels) {
        const matches = offices.filter(
          ({ number, property }) =>
            number === label ||
            `${propertyNames.get(String(property))} · ${number}` === label,
        );
        if (matches.length !== 1) continue;
        const format = matches[0].officeFormat;
        const code = normalizeOfficeCategory(format);
        if (!code) continue;
        const category = byCode.get(code);
        officeCategories.set(label, {
          name: category?.name || code,
          color: category?.color || '#64748b',
        });
      }
    }
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
      tickets: tickets.map((ticket) => ({
        ...ticket,
        officeCategory: officeCategories.get(ticket.officeId) ?? null,
      })),
      smsAvailable: this.sms?.textEnabled() ?? false,
      emailAvailable: this.mail?.isConfigured() ?? false,
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
    const current = await tickets.findOne(
      { _id: id },
      { projection: { stageName: 1, passTicketId: 1 } },
    );
    if (!current) throw new NotFoundException();
    if (!ratingStage.test(current.stageName ?? '')) {
      throw new ConflictException('На текущей стадии запрос оценки недоступен');
    }
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
      token: randomBytes(16).toString('base64url'),
      createdAt: new Date(),
      ...(chat === true ? { chat: true, chatAt: new Date() } : {}),
    };
    const ticket =
      (await tickets.findOneAndUpdate(
        {
          _id: id,
          stageName: current.stageName,
          ...linked,
          ...(repeat === true ? {} : { 'requests.0': { $exists: false } }),
        },
        { $push: { requests: request } },
        { returnDocument: 'after' },
      )) ??
      (await tickets.findOne({
        _id: id,
        stageName: current.stageName,
        ...linked,
      }));
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
    if (ticket.requests[0].answer) return { closed: true };
    return { title: ticket.title, closed: false };
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
