import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmail } from 'class-validator';
import { randomBytes } from 'node:crypto';
import { MailService } from '../../mail/mail.service';
import { OperationsStore } from '../../operations/operations.store';
import { SmsService } from '../../sms/sms.service';
import { Bitrix24Client, Bitrix24Error } from './bitrix24.client';

interface QualityDeal {
  ID: string;
  TITLE: string;
  DATE_CREATE: string;
  MOVED_TIME?: string;
  CLOSED?: string;
  STAGE_ID: string;
  CREATED_BY_ID: string;
  COMPANY_ID: string;
  CONTACT_ID?: string;
  SOURCE_ID: string;
  ORIGINATOR_ID: string;
  ORIGIN_ID: string;
}

@Injectable()
export class QualitySyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QualitySyncService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly store: OperationsStore,
    private readonly client: Bitrix24Client,
    private readonly config?: ConfigService,
    private readonly mail?: MailService,
    private readonly sms?: SmsService,
  ) {}

  async onModuleInit() {
    await this.store
      .collection('quality_tickets')
      .createIndexes([
        { key: { createdAt: -1, _id: -1 } },
        { key: { 'requests.createdAt': 1 } },
        { key: { 'requests.answer.receivedAt': 1 } },
      ]);
    await this.store
      .collection('quality_tickets')
      .createIndex({ 'requests.token': 1 }, { unique: true, sparse: true });
    if (!this.client.enabled()) return;
    this.timer = setInterval(() => void this.sync(), 60000);
    this.timer.unref();
    void this.sync();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async sync() {
    if (this.running) return;
    this.running = true;
    try {
      const startedAt = new Date();
      const state = this.store.collection('quality_sync');
      const checkpoint = await state.findOne({ _id: 'deals' });
      const funnel = await this.client.funnel();
      const stages = new Map(funnel.stages.map(({ id, name }) => [id, name]));
      const tickets = this.store.collection('quality_tickets');
      const offices = await this.store.connection
        .db!.collection('offices')
        .find({}, { projection: { number: 1, company: 1, property: 1 } })
        .toArray();
      const normalize = (value: unknown) =>
        String(value ?? '')
          .trim()
          .toLocaleLowerCase('ru');
      const properties = await this.store.connection
        .db!.collection('properties')
        .find({}, { projection: { name: 1 } })
        .toArray();
      const propertyNames = new Map(
        properties.map(({ _id, name }) => [
          String(_id),
          String(name ?? '').replace(/^БЦ\s+/i, ''),
        ]),
      );
      const companies = new Map<number, string>();
      let afterId = 0;
      while (true) {
        const { result } = await this.client.call<QualityDeal[]>(
          'crm.deal.list',
          {
            order: { ID: 'ASC' },
            start: -1,
            filter: {
              CATEGORY_ID: funnel.id,
              '>ID': afterId,
              ...(checkpoint?.officeFormat === 4 &&
              checkpoint.categoryId === funnel.id &&
              checkpoint.scannedAt
                ? {
                    '>=DATE_MODIFY': new Date(
                      checkpoint.scannedAt.getTime() - 60000,
                    ).toISOString(),
                  }
                : {}),
            },
            select: [
              'ID',
              'TITLE',
              'DATE_CREATE',
              'MOVED_TIME',
              'CLOSED',
              'STAGE_ID',
              'CREATED_BY_ID',
              'COMPANY_ID',
              'CONTACT_ID',
              'SOURCE_ID',
              'ORIGINATOR_ID',
              'ORIGIN_ID',
            ],
          },
        );
        if (!Array.isArray(result)) throw new Error('Invalid deal list');
        if (!result.length) break;
        for (const deal of result) {
          const dealId = Number(deal.ID);
          const createdAt = new Date(deal.DATE_CREATE);
          const movedAt = new Date(deal.MOVED_TIME ?? '');
          const closedAt =
            deal.CLOSED === 'Y' && Number.isFinite(movedAt.getTime())
              ? movedAt
              : null;
          if (
            !Number.isSafeInteger(dealId) ||
            dealId <= afterId ||
            !Number.isFinite(createdAt.getTime())
          ) {
            throw new Error('Invalid deal record');
          }
          const passTicketId =
            deal.ORIGINATOR_ID === this.client.originator()
              ? String(deal.ORIGIN_ID || '')
              : '';
          const passTicket = passTicketId
            ? await this.store
                .collection('tickets')
                .findOne(
                  { id: Number(passTicketId), 'bitrix.deal_id': dealId },
                  { projection: { requester_name: 1 } },
                )
            : null;
          // The Pass CRM worker writes the resolved tenant company to the deal.
          const companyId = Number(deal.COMPANY_ID) || null;
          if (companyId && !companies.has(companyId)) {
            try {
              const { result } = await this.client.call<{ TITLE?: string }>(
                'crm.company.get',
                { id: companyId },
              );
              companies.set(companyId, normalize(result?.TITLE));
            } catch (error) {
              if (
                !(error instanceof Bitrix24Error) ||
                ![
                  'not_found',
                  'error_not_found',
                  'access_denied',
                  'http_403',
                  'http_404',
                ].includes(error.code.toLowerCase())
              )
                throw error;
              companies.set(companyId, '');
            }
          }
          const company = companyId ? companies.get(companyId) : '';
          const companyOffices = company
            ? offices.filter((office) => normalize(office.company) === company)
            : [];
          const words = (value: unknown) =>
            normalize(value)
              .replace(/[^\p{L}\p{N}-]+/gu, ' ')
              .trim();
          const title = ` ${words(deal.TITLE)} `;
          const qualified = [
            ...String(deal.TITLE ?? '')
              .replace(/-\d+(?:[.,]\d+)?\s*м(?:²|2)?(?=$|[^\p{L}\p{N}])/giu, '')
              .matchAll(
                /(?:^|[^\p{L}\p{N}])д(?:\s*[-–—]?\s*([12]))?\s*[\\/]\s*([\p{L}\p{N}-]+)/giu,
              ),
          ];
          const titleOffices = offices.filter((office) => {
            const label = words(office.number);
            if (qualified.length) {
              const property = normalize(
                propertyNames.get(String(office.property)),
              ).replace(/[\s–—-]+/g, '');
              return qualified.some(
                ([, building, number]) =>
                  property ===
                    (building === '2' ? 'добрынинский2' : 'добрынинский') &&
                  label === words(number),
              );
            }
            return label && title.includes(` ${label} `);
          });
          const office =
            companyOffices.length === 1
              ? companyOffices[0]
              : titleOffices.length === 1
                ? titleOffices[0]
                : undefined;
          const creatorId = String(deal.CREATED_BY_ID || '');
          const creatorName =
            passTicket?.requester_name ||
            (creatorId ? await this.client.author(creatorId) : '');
          await tickets.updateOne(
            { _id: String(dealId) },
            {
              $set: {
                title: deal.TITLE,
                createdAt,
                closedAt,
                stageId: deal.STAGE_ID,
                stageName: stages.get(deal.STAGE_ID) ?? deal.STAGE_ID,
                source: passTicketId ? 'Pass' : deal.SOURCE_ID || 'Битрикс24',
                creatorId,
                creatorName,
                companyId,
                autoOfficeId: office
                  ? [propertyNames.get(String(office.property)), office.number]
                      .filter(Boolean)
                      .join(' · ')
                  : '',
                passTicketId,
              },
            },
            { upsert: true },
          );
          if (
            checkpoint?.scannedAt &&
            closedAt &&
            checkpoint.categoryId === funnel.id &&
            closedAt.getTime() >= checkpoint.scannedAt.getTime() - 1000 &&
            /^\s*(Можно закрывать|Сделка успешна)\s*$/i.test(
              stages.get(deal.STAGE_ID) ?? '',
            )
          ) {
            await this.sendRating(String(dealId), Number(deal.CONTACT_ID));
          }
          afterId = dealId;
        }
      }
      await state.updateOne(
        { _id: 'deals' },
        {
          $set: { categoryId: funnel.id, officeFormat: 4 },
          $max: { scannedAt: startedAt, completedAt: new Date() },
        },
        { upsert: true },
      );
    } catch (error) {
      const code = error instanceof Bitrix24Error ? error.code : 'sync_failed';
      this.logger.warn(
        `Не удалось синхронизировать заявки для контроля качества (${code})`,
      );
    } finally {
      this.running = false;
    }
  }

  private async sendRating(id: string, contactId: number) {
    const origin = this.config?.get<string>('PUBLIC_APP_URL')?.trim();
    if (!origin || !Number.isSafeInteger(contactId) || contactId <= 0) return;
    const url = URL.parse(origin);
    if (!url || !['http:', 'https:'].includes(url.protocol)) return;
    const tickets = this.store.collection<{
      _id: string;
      excluded?: boolean;
      requests: {
        token: string;
        createdAt: Date;
        deliveryChannel: string;
        deliveryStatus: string;
      }[];
    }>('quality_tickets');
    const eligible = {
      _id: id,
      excluded: { $ne: true },
      'requests.0': { $exists: false },
    };
    if (!(await tickets.findOne(eligible, { projection: { _id: 1 } }))) return;

    type ContactValue = { VALUE?: string };
    type Contact = {
      EMAIL?: ContactValue[];
      PHONE?: ContactValue[];
    };
    let contact: Contact;
    try {
      ({ result: contact } = await this.client.call<Contact>(
        'crm.contact.get',
        {
          id: contactId,
        },
      ));
    } catch (error) {
      if (
        error instanceof Bitrix24Error &&
        /^(not_found|error_not_found|access_denied|http_403|http_404)$/i.test(
          error.code,
        )
      ) {
        this.logger.warn(`Контакт для оценки заявки №${id} недоступен`);
        return;
      }
      throw error;
    }
    const email = contact?.EMAIL?.map(({ VALUE }) => VALUE?.trim() ?? '').find(
      (value) => isEmail(value),
    );
    const phone = contact?.PHONE?.map(({ VALUE }) =>
      (VALUE ?? '').replace(/\D/g, '').replace(/^8(?=\d{10}$)/, '7'),
    ).find((value) => /^7\d{10}$/.test(value));
    if (email ? !this.mail?.isConfigured() : !phone || !this.sms?.textEnabled())
      return;

    const token = randomBytes(16).toString('base64url');
    const link = new URL('/q/' + token, url).href;
    const claimed = await tickets.updateOne(eligible, {
      $push: {
        requests: {
          token,
          createdAt: new Date(),
          deliveryChannel: email ? 'email' : 'sms',
          deliveryStatus: 'sending',
        },
      },
    });
    if (!claimed.modifiedCount) return;

    let deliveryStatus = 'sent';
    try {
      if (email) {
        await this.mail!.sendServiceRequestEmail(
          email,
          `Оцените работу по заявке №${id}`,
          `Здравствуйте! Заявка №${id} завершена. Пожалуйста, оцените нашу работу: ${link}`,
        );
      } else {
        await this.sms!.sendText(phone!, `Оцените заявку №${id}: ${link}`);
      }
    } catch {
      deliveryStatus = 'failed';
      this.logger.warn(`Не удалось отправить запрос оценки по заявке №${id}`);
    }
    await tickets.updateOne(
      { _id: id, 'requests.token': token },
      { $set: { 'requests.$.deliveryStatus': deliveryStatus } },
    );
  }
}
