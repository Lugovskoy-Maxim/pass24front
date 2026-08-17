import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as mysql from 'mysql2/promise';
import {
  decryptJson,
  encryptJson,
} from '../integrations/mstyle-v2/mstyle-v2.crypto';
import {
  AppSettings,
  AppSettingsDocument,
} from '../schemas/app-settings.schema';
import { Office, OfficeDocument } from '../schemas/office.schema';
import { Pass, PassDocument } from '../schemas/pass.schema';
import {
  PassTemplate,
  PassTemplateDocument,
} from '../schemas/pass-template.schema';
import { Property, PropertyDocument } from '../schemas/property.schema';
import { PropertyType } from '../schemas/enums';
import { NotificationsService } from '../notifications/notifications.service';

const SETTINGS_KEY = 'global';
const DEFAULT_PREFIX = 'wps_';

export type SiteMysqlMapping = {
  tablePrefix: string;
  roomPostType: string;
  roomNumberMeta: string;
  floorMeta: string;
  areaMeta: string;
  badgeMeta: string;
  availabilityMeta: string;
  officeFormatMeta: string;
  companyMeta: string;
  roomStatusMeta: string;
  businessCenterTaxonomy: string;
  roomTypeTaxonomy: string;
  serviceRequestsTable: string;
  serviceRequestMessagesTable: string;
  servicesTable: string;
};

const DEFAULT_MAPPING: SiteMysqlMapping = {
  tablePrefix: DEFAULT_PREFIX,
  roomPostType: 'tf_room',
  roomNumberMeta: 'room_number',
  floorMeta: 'tf_room_floor_number',
  areaMeta: 'room_area',
  badgeMeta: 'room_badges_0_text',
  availabilityMeta: 'tf_room_availability_status',
  officeFormatMeta: 'tf_room_office_format',
  companyMeta: '',
  roomStatusMeta: 'room_status',
  businessCenterTaxonomy: 'tf_business_center',
  roomTypeTaxonomy: 'tf_room_type',
  serviceRequestsTable: 'tf_service_requests',
  serviceRequestMessagesTable: 'tf_service_request_messages',
  servicesTable: 'tf_services',
};

const MAPPING_KEYS = Object.keys(DEFAULT_MAPPING) as Array<
  keyof SiteMysqlMapping
>;

type SourceOfficeItem = {
  externalId: string;
  number: string;
  floor?: string;
  areaSqm?: number;
  company?: string;
  title?: string;
  propertyCode?: string;
  propertyName?: string;
  officeFormat?: string;
  availability?: string;
  busyUntil?: string;
  roomStatus?: string;
  paymentStatus?: string;
  paidUntil?: string;
  isActive?: boolean;
};

type SiteLinkStatus = 'linked' | 'suggested' | 'unmatched';

type SiteLinksResult = {
  properties: Array<{
    sourceCode: string;
    sourceName: string;
    status: SiteLinkStatus;
    linkedId?: string;
    linkedName?: string;
    suggestedId?: string;
    suggestedName?: string;
  }>;
  offices: Array<{
    externalId: string;
    number: string;
    floor?: string;
    areaSqm?: number;
    company?: string;
    propertyName?: string;
    propertyCode?: string;
    status: SiteLinkStatus;
    linkedId?: string;
    linkedNumber?: string;
    suggestedId?: string;
    suggestedNumber?: string;
  }>;
  passProperties: Array<{
    id: string;
    name: string;
    code?: string;
    officesCount: number;
  }>;
  passOffices: Array<{
    id: string;
    number: string;
    propertyId?: string;
    externalId?: string;
    company?: string;
  }>;
  pendingChanges: boolean;
  lastCheckedAt?: string;
  lastChangedAt?: string;
  note?: string;
};

export type SiteMysqlPublic = {
  enabled: boolean;
  host: string;
  port: number;
  database: string;
  user: string;
  hasPassword: boolean;
  writeEnabled: boolean;
  autoSyncEnabled: boolean;
  autoSyncIntervalSec: number;
  autoApply: boolean;
  lastCheckedAt?: string;
  lastChangedAt?: string;
  pendingChanges: boolean;
} & SiteMysqlMapping;

@Injectable()
export class SiteSourceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SiteSourceService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(AppSettings.name)
    private readonly settings: Model<AppSettingsDocument>,
    @InjectModel(Office.name) private readonly offices: Model<OfficeDocument>,
    @InjectModel(Property.name)
    private readonly properties: Model<PropertyDocument>,
    @InjectModel(Pass.name) private readonly passes: Model<PassDocument>,
    @InjectModel(PassTemplate.name)
    private readonly templates: Model<PassTemplateDocument>,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.restartTimer();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async getPublicConfig(): Promise<SiteMysqlPublic> {
    const raw = (await this.loadDoc()).siteMysql || {};
    return {
      enabled: !!raw.enabled,
      host: raw.host || '',
      port: raw.port || 3306,
      database: raw.database || '',
      user: raw.user || '',
      hasPassword: !!raw.passwordEnc,
      writeEnabled: !!raw.writeEnabled,
      autoSyncEnabled: !!raw.autoSyncEnabled,
      autoSyncIntervalSec: Number(raw.autoSyncIntervalSec) || 300,
      autoApply: !!raw.autoApply,
      lastCheckedAt: raw.lastCheckedAt,
      lastChangedAt: raw.lastChangedAt,
      pendingChanges: !!raw.pendingChanges,
      ...this.resolveMapping(raw),
    };
  }

  async saveConfig(input: {
    enabled?: boolean;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    writeEnabled?: boolean;
    autoSyncEnabled?: boolean;
    autoSyncIntervalSec?: number;
    autoApply?: boolean;
  } & Partial<SiteMysqlMapping>): Promise<SiteMysqlPublic> {
    const doc = await this.loadDoc();
    const current = doc.siteMysql || {};
    const next = { ...current };
    if (input.enabled !== undefined) next.enabled = input.enabled;
    if (input.host !== undefined) next.host = input.host.trim();
    if (input.port !== undefined) next.port = Number(input.port) || 3306;
    if (input.database !== undefined) next.database = input.database.trim();
    if (input.user !== undefined) next.user = input.user.trim();
    for (const key of MAPPING_KEYS) {
      if (input[key] === undefined) continue;
      const value = String(input[key] ?? '').trim();
      next[key] = key === 'tablePrefix' ? value || DEFAULT_PREFIX : value;
    }
    if (input.password) {
      next.passwordEnc = encryptJson(this.secret(), input.password);
    }
    if (input.writeEnabled !== undefined) next.writeEnabled = input.writeEnabled;
    if (input.autoSyncEnabled !== undefined)
      next.autoSyncEnabled = input.autoSyncEnabled;
    if (input.autoSyncIntervalSec !== undefined) {
      next.autoSyncIntervalSec = Math.max(
        60,
        Number(input.autoSyncIntervalSec) || 300,
      );
    }
    if (input.autoApply !== undefined) next.autoApply = input.autoApply;
    doc.siteMysql = next;
    doc.markModified('siteMysql');
    await doc.save();
    this.restartTimer();
    return this.getPublicConfig();
  }

  async testConnection() {
    const conn = await this.connect();
    try {
      const [rows] = await conn.query('SELECT DATABASE() AS db, NOW() AS now');
      const tables = await this.listTables(conn);
      return {
        ok: true,
        database: (rows as any[])[0]?.db,
        tables: tables.length,
        tableNames: tables.slice(0, 80),
      };
    } finally {
      await conn.end();
    }
  }

  async previewOffices() {
    const conn = await this.connect();
    try {
      const tables = await this.listTables(conn);
      const prefix = await this.resolvePrefix(conn, tables);
      const source = await this.resolveOfficeSource(conn, tables, prefix);
      const items: Array<
        SourceOfficeItem & {
          match: {
            propertyAction: 'link' | 'create';
            propertyId?: string;
            propertyName?: string;
            propertyCode?: string;
            officeAction: 'link' | 'update' | 'create';
            officeId?: string;
          };
        }
      > = [];
      for (const item of source.items) {
        const property = await this.findProperty(item);
        const office = property
          ? await this.findOffice(item, property)
          : null;
        items.push({
          ...item,
          match: {
            propertyAction: property ? 'link' : 'create',
            propertyId: property?._id.toString(),
            propertyName: property?.name || item.propertyName,
            propertyCode: property?.code || item.propertyCode,
            officeAction: office
              ? office.externalId === item.externalId
                ? 'update'
                : 'link'
              : 'create',
            officeId: office?._id.toString(),
          },
        });
      }
      return {
        source: { name: source.name, prefix: source.prefix },
        items,
      };
    } finally {
      await conn.end();
    }
  }

  async importOffices() {
    const preview = await this.previewOffices();
    let created = 0;
    let updated = 0;
    let linked = 0;
    let merged = 0;
    for (const item of preview.items) {
      const { property, merged: absorbed } = await this.ensureProperty(item);
      merged += absorbed;
      const hadOffice = await this.findOffice(item, property);
      await this.upsertOffice(item, property);
      if (!hadOffice) created += 1;
      else if (!hadOffice.externalId && item.externalId) linked += 1;
      else updated += 1;
    }
    return {
      source: preview.source.name,
      created,
      updated,
      linked,
      merged,
      skipped: 0,
      total: preview.items.length,
    };
  }

  async listLinks(): Promise<SiteLinksResult> {
    const cfg = await this.getPublicConfig();
    await this.collapseDuplicateCenters();
    const passProperties = await this.properties
      .find({
        type: PropertyType.BUSINESS_CENTER,
        isActive: { $ne: false },
      })
      .sort({ name: 1 })
      .lean();
    const passOffices = await this.offices.find().sort({ number: 1 }).lean();
    const mappedPass = {
      passProperties: passProperties.map((p) => ({
        id: p._id.toString(),
        name: p.name,
        code: p.code || undefined,
        officesCount: passOffices.filter(
          (o) => o.property?.toString() === p._id.toString(),
        ).length,
      })),
      passOffices: passOffices.map((o) => ({
        id: o._id.toString(),
        number: o.number,
        propertyId: o.property?.toString(),
        externalId: o.externalId || undefined,
        company: o.company,
      })),
      pendingChanges: cfg.pendingChanges,
      lastCheckedAt: cfg.lastCheckedAt,
      lastChangedAt: cfg.lastChangedAt,
    };
    if (!cfg.enabled || !cfg.host) {
      return {
        ...mappedPass,
        properties: [],
        offices: [],
        note: 'MySQL выключен',
      };
    }
    let preview: Awaited<ReturnType<SiteSourceService['previewOffices']>>;
    try {
      preview = await this.previewOffices();
    } catch (err) {
      return {
        ...mappedPass,
        properties: [],
        offices: [],
        note: err instanceof Error ? err.message : 'MySQL недоступен',
      };
    }
    const bcMap = new Map<
      string,
      { sourceCode: string; sourceName: string; suggestedId?: string }
    >();
    for (const item of preview.items) {
      const code = item.propertyCode || '';
      if (!code || bcMap.has(code)) continue;
      bcMap.set(code, {
        sourceCode: code,
        sourceName: item.propertyName || code,
        suggestedId: item.match?.propertyId,
      });
    }
    const properties = [...bcMap.values()].map((source) => {
      const linked = passProperties.find((p) => p.code === source.sourceCode);
      const suggested = source.suggestedId
        ? passProperties.find((p) => p._id.toString() === source.suggestedId)
        : undefined;
      return {
        sourceCode: source.sourceCode,
        sourceName: source.sourceName,
        status: (linked
          ? 'linked'
          : suggested
            ? 'suggested'
            : 'unmatched') as SiteLinkStatus,
        linkedId: linked?._id.toString(),
        linkedName: linked?.name,
        suggestedId: suggested && !linked ? suggested._id.toString() : undefined,
        suggestedName: suggested && !linked ? suggested.name : undefined,
      };
    });
    const offices = preview.items.map((item) => {
      const linked = passOffices.find((o) => o.externalId === item.externalId);
      const suggested =
        !linked && item.match?.officeId
          ? passOffices.find((o) => o._id.toString() === item.match?.officeId)
          : undefined;
      return {
        externalId: item.externalId,
        number: item.number,
        floor: item.floor,
        areaSqm: item.areaSqm,
        company: item.company,
        propertyName: item.propertyName,
        propertyCode: item.propertyCode,
        status: (linked
          ? 'linked'
          : suggested
            ? 'suggested'
            : 'unmatched') as SiteLinkStatus,
        linkedId: linked?._id.toString(),
        linkedNumber: linked?.number,
        suggestedId: suggested?._id.toString(),
        suggestedNumber: suggested?.number,
      };
    });
    return { ...mappedPass, properties, offices };
  }

  async confirmLinks(input: {
    properties?: Array<{ sourceCode: string; targetId: string }>;
    offices?: Array<{ externalId: string; targetId: string }>;
  }) {
    let properties = 0;
    let offices = 0;
    for (const item of input.properties || []) {
      const property = await this.properties.findById(item.targetId);
      if (!property) throw new NotFoundException('БЦ не найден');
      const previous = await this.properties.findOne({
        code: item.sourceCode,
        _id: { $ne: property._id },
      });
      await this.stampPropertyCode(property, item.sourceCode, true);
      if (previous) await this.absorbProperty(previous, property);
      properties += 1;
    }
    await this.collapseDuplicateCenters();
    const preview =
      input.offices?.length || input.properties?.length
        ? await this.previewOffices().catch(() => null)
        : null;
    const sourceByExt = new Map(
      (preview?.items || []).map((row) => [row.externalId, row]),
    );
    for (const item of input.offices || []) {
      const office = await this.offices.findById(item.targetId);
      if (!office) throw new NotFoundException('Офис не найден');
      if (office.externalId && office.externalId !== item.externalId) {
        throw new BadRequestException(
          `Офис ${office.number} уже связан с ${office.externalId}`,
        );
      }
      office.externalId = item.externalId;
      const source = sourceByExt.get(item.externalId);
      if (source) await this.applySourceToOffice(office, source);
      else await office.save();
      offices += 1;
    }
    return { properties, offices };
  }

  async confirmSuggested(input?: { properties?: boolean; offices?: boolean }) {
    const links = await this.listLinks();
    const doProps = input?.properties !== false;
    const doOffices = input?.offices !== false;
    return this.confirmLinks({
      properties: doProps
        ? links.properties
            .filter((item) => item.status === 'suggested' && item.suggestedId)
            .map((item) => ({
              sourceCode: item.sourceCode,
              targetId: item.suggestedId!,
            }))
        : [],
      offices: doOffices
        ? links.offices
            .filter((item) => item.status === 'suggested' && item.suggestedId)
            .map((item) => ({
              externalId: item.externalId,
              targetId: item.suggestedId!,
            }))
        : [],
    });
  }

  async unlink(input: { propertyId?: string; officeId?: string }) {
    if (input.propertyId) {
      await this.properties.updateOne(
        { _id: input.propertyId },
        { $unset: { code: 1 } },
      );
    }
    if (input.officeId) {
      await this.offices.updateOne(
        { _id: input.officeId },
        { $unset: { externalId: 1 } },
      );
    }
    return { ok: true };
  }

  async syncLinked() {
    const preview = await this.previewOffices();
    let updated = 0;
    let skipped = 0;
    for (const item of preview.items) {
      if (!item.externalId) {
        skipped += 1;
        continue;
      }
      const office = await this.offices.findOne({
        externalId: item.externalId,
      });
      if (!office) {
        skipped += 1;
        continue;
      }
      if (item.propertyCode) {
        const property = await this.properties.findOne({
          code: item.propertyCode,
        });
        if (property) office.property = property._id as any;
      }
      await this.applySourceToOffice(office, item);
      updated += 1;
    }
    await this.markPending(false);
    return { updated, skipped, total: preview.items.length };
  }

  async pushOffice(
    officeId: string,
    patch?: {
      number?: string;
      floor?: string;
      areaSqm?: number;
      company?: string;
      availability?: string;
    },
  ) {
    const cfg = await this.getPublicConfig();
    if (!cfg.writeEnabled) {
      throw new BadRequestException(
        'Запись в MySQL выключена. Включите writeEnabled.',
      );
    }
    const office = await this.offices.findById(officeId);
    if (!office?.externalId) {
      throw new BadRequestException('Офис не связан с MySQL (нет externalId)');
    }
    const postId = sourcePostId(office.externalId);
    if (!postId) {
      throw new BadRequestException(`Непонятный externalId: ${office.externalId}`);
    }
    const mapping = await this.currentMapping();
    const number = patch?.number ?? office.number;
    const floor = patch?.floor ?? office.floor;
    const area = patch?.areaSqm ?? office.areaSqm;
    const company = patch?.company ?? office.company;
    const conn = await this.connect();
    try {
      const tables = await this.listTables(conn);
      const prefix = await this.resolvePrefix(conn, tables);
      const postmeta = `${prefix}postmeta`;
      if (!tables.includes(postmeta)) {
        throw new BadRequestException(`Нет таблицы ${postmeta}`);
      }
      await this.upsertMeta(conn, postmeta, postId, mapping.roomNumberMeta, number);
      if (floor != null)
        await this.upsertMeta(conn, postmeta, postId, mapping.floorMeta, floor);
      if (area != null)
        await this.upsertMeta(
          conn,
          postmeta,
          postId,
          mapping.areaMeta,
          String(area),
        );
      if (mapping.companyMeta && company != null) {
        await this.upsertMeta(
          conn,
          postmeta,
          postId,
          mapping.companyMeta,
          company,
        );
      }
      if (patch?.availability && mapping.availabilityMeta) {
        await this.upsertMeta(
          conn,
          postmeta,
          postId,
          mapping.availabilityMeta,
          patch.availability,
        );
      }
    } finally {
      await conn.end();
    }
    if (patch?.number) office.number = patch.number;
    if (patch?.floor !== undefined) office.floor = patch.floor || undefined;
    if (patch?.areaSqm !== undefined) office.areaSqm = patch.areaSqm;
    if (patch?.company !== undefined) office.company = patch.company || undefined;
    await office.save();
    return { ok: true, externalId: office.externalId, postId };
  }

  async checkSource() {
    const conn = await this.connect();
    try {
      const tables = await this.listTables(conn);
      const prefix = await this.resolvePrefix(conn, tables);
      const mapping = await this.currentMapping();
      const posts = `${prefix}posts`;
      const tickets = tableName(prefix, mapping.serviceRequestsTable);
      let rooms = { n: 0, maxId: 0, maxMod: '' };
      if (tables.includes(posts)) {
        const [rows] = await conn.query(
          `SELECT COUNT(*) AS n, MAX(ID) AS maxId, MAX(post_modified) AS maxMod
           FROM ${ident(posts)} WHERE post_type = ?`,
          [mapping.roomPostType],
        );
        const row = (rows as any[])[0] || {};
        rooms = {
          n: Number(row.n || 0),
          maxId: Number(row.maxId || 0),
          maxMod: row.maxMod ? String(row.maxMod) : '',
        };
      }
      let ticket = { n: 0, maxId: 0 };
      if (tables.includes(tickets)) {
        const cols = await this.tableColumns(conn, tickets);
        const idCol = cols.includes('id') ? 'id' : cols.includes('ID') ? 'ID' : cols[0];
        const [rows] = await conn.query(
          `SELECT COUNT(*) AS n, MAX(${ident(idCol)}) AS maxId FROM ${ident(tickets)}`,
        );
        const row = (rows as any[])[0] || {};
        ticket = { n: Number(row.n || 0), maxId: Number(row.maxId || 0) };
      }
      const fingerprint = `r${rooms.n}:${rooms.maxId}:${rooms.maxMod}|t${ticket.n}:${ticket.maxId}`;
      const doc = await this.loadDoc();
      const raw = doc.siteMysql || {};
      const changed = !!raw.lastFingerprint && raw.lastFingerprint !== fingerprint;
      raw.lastCheckedAt = new Date().toISOString();
      if (!raw.lastFingerprint || changed) {
        if (changed) {
          raw.pendingChanges = true;
          raw.lastChangedAt = raw.lastCheckedAt;
        }
        raw.lastFingerprint = fingerprint;
      }
      if (changed && raw.autoApply) {
        await this.syncLinked();
        raw.pendingChanges = false;
      }
      doc.siteMysql = raw;
      doc.markModified('siteMysql');
      await doc.save();
      return {
        fingerprint,
        changed,
        pendingChanges: !!raw.pendingChanges,
        lastCheckedAt: raw.lastCheckedAt,
        lastChangedAt: raw.lastChangedAt,
        rooms,
        tickets: ticket,
        autoApplied: !!(changed && raw.autoApply),
      };
    } finally {
      await conn.end();
    }
  }

  async listTickets(limit = 50): Promise<{
    stub: boolean;
    note?: string;
    table?: string;
    fields: string[];
    items: Array<{
      id?: unknown;
      status?: unknown;
      title?: unknown;
      office?: unknown;
      created?: unknown;
      raw: Record<string, unknown>;
    }>;
  }> {
    const cfg = await this.getPublicConfig();
    if (!cfg.enabled || !cfg.host) {
      return {
        stub: true,
        note: 'MySQL выключен',
        items: [],
        fields: [],
      };
    }
    const conn = await this.connect();
    try {
      const tables = await this.listTables(conn);
      const prefix = await this.resolvePrefix(conn, tables);
      const mapping = await this.currentMapping();
      const table = tableName(prefix, mapping.serviceRequestsTable);
      if (!tables.includes(table)) {
        return {
          stub: true,
          note: `Таблица ${table} не найдена. Заготовка готова — задайте имя в настройках MySQL.`,
          items: [],
          fields: [],
        };
      }
      const cols = await this.tableColumns(conn, table);
      const sample = await this.sampleTable(conn, table, Math.min(limit, 100));
      return {
        stub: false,
        table,
        fields: cols,
        items: sample.map((row) => ({
          id: pick(row, ['id', 'ID', 'request_id']),
          status: pick(row, ['status', 'state', 'request_status']),
          title: pick(row, ['title', 'subject', 'name', 'topic']),
          office: pick(row, ['office', 'room', 'room_number', 'office_number']),
          created: pick(row, ['created_at', 'created', 'date', 'post_date']),
          raw: row,
        })),
      };
    } finally {
      await conn.end();
    }
  }

  async getTicket(id: string) {
    const list = await this.listTickets(200);
    const item = list.items.find((row) => String(row.id) === String(id));
    if (!item && !list.stub) throw new NotFoundException('Заявка не найдена');
    const conn = await this.connect();
    try {
      const tables = await this.listTables(conn);
      const prefix = await this.resolvePrefix(conn, tables);
      const mapping = await this.currentMapping();
      const messagesTable = tableName(
        prefix,
        mapping.serviceRequestMessagesTable,
      );
      let messages: Record<string, unknown>[] = [];
      let stub = !tables.includes(messagesTable);
      if (!stub) {
        const cols = await this.tableColumns(conn, messagesTable);
        const fk = [
          'request_id',
          'service_request_id',
          'ticket_id',
          'parent_id',
        ].find((name) => cols.includes(name));
        if (fk) {
          const [rows] = await conn.query(
            `SELECT * FROM ${ident(messagesTable)} WHERE ${ident(fk)} = ? ORDER BY 1 ASC LIMIT 100`,
            [id],
          );
          messages = (rows as Record<string, unknown>[]).map(plainRow);
        } else {
          stub = true;
        }
      }
      return {
        ticket: item || { id, raw: {} },
        messages,
        stub,
        note: stub
          ? 'Таблица сообщений не сопоставлена. Заготовка: POST /admin/site-source/tickets/:id/messages'
          : undefined,
      };
    } finally {
      await conn.end();
    }
  }

  async addTicketMessage(id: string, body: string) {
    const cfg = await this.getPublicConfig();
    if (!cfg.writeEnabled) {
      throw new BadRequestException(
        'Запись в MySQL выключена. Включите writeEnabled.',
      );
    }
    const conn = await this.connect();
    try {
      const tables = await this.listTables(conn);
      const prefix = await this.resolvePrefix(conn, tables);
      const mapping = await this.currentMapping();
      const messagesTable = tableName(
        prefix,
        mapping.serviceRequestMessagesTable,
      );
      if (!tables.includes(messagesTable)) {
        return {
          stub: true,
          stored: false,
          note: `Нет ${messagesTable}. Сообщение не записано.`,
          draft: { ticketId: id, body, at: new Date().toISOString() },
        };
      }
      const cols = await this.tableColumns(conn, messagesTable);
      const fk = [
        'request_id',
        'service_request_id',
        'ticket_id',
        'parent_id',
      ].find((name) => cols.includes(name));
      const textCol = ['message', 'body', 'content', 'text', 'comment'].find(
        (name) => cols.includes(name),
      );
      if (!fk || !textCol) {
        return {
          stub: true,
          stored: false,
          note: `Не нашёл колонки связи/текста в ${messagesTable}: ${cols.join(', ')}`,
          draft: { ticketId: id, body },
        };
      }
      const extra: string[] = [];
      const extraVals: unknown[] = [];
      if (cols.includes('created_at')) {
        extra.push('created_at');
        extraVals.push(new Date());
      } else if (cols.includes('date')) {
        extra.push('date');
        extraVals.push(new Date());
      }
      await conn.query(
        `INSERT INTO ${ident(messagesTable)} (${ident(fk)}, ${ident(textCol)}${
          extra.length ? `, ${extra.map(ident).join(', ')}` : ''
        }) VALUES (?, ?${extra.map(() => ', ?').join('')})`,
        [id, body, ...extraVals],
      );
      return { stub: false, stored: true, ticketId: id };
    } finally {
      await conn.end();
    }
  }

  private async resolveOfficeSource(
    conn: mysql.Connection,
    tables: string[],
    prefix: string,
  ) {
    const mapping = await this.currentMapping();
    const posts = `${prefix}posts`;
    const postmeta = `${prefix}postmeta`;
    const items: SourceOfficeItem[] = [];

    if (!tables.includes(posts)) {
      return { name: 'not_found', prefix, mapping, items };
    }

    const rows = await this.samplePosts(
      conn,
      ident(posts),
      mapping.roomPostType,
      500,
    );
    const ids = rows.map((r) => r.ID);
    const financeByRoom = await this.loadRoomFinance(
      conn,
      tables,
      prefix,
      ids.map(String),
    );
    const metaKeys = [
      mapping.roomNumberMeta,
      mapping.floorMeta,
      mapping.areaMeta,
      mapping.badgeMeta,
      mapping.availabilityMeta,
      mapping.officeFormatMeta,
      mapping.companyMeta,
      mapping.roomStatusMeta,
      'room_busy_until',
    ].filter(Boolean);
    const meta = tables.includes(postmeta)
      ? await this.loadMeta(conn, ident(postmeta), ids, metaKeys)
      : new Map<string, Record<string, string>>();
    const bc = mapping.businessCenterTaxonomy
      ? await this.loadTaxonomy(
          conn,
          tables,
          prefix,
          ids,
          mapping.businessCenterTaxonomy,
        )
      : new Map<string, { termId: string; name: string; slug: string }>();
    const roomType = mapping.roomTypeTaxonomy
      ? await this.loadTaxonomy(
          conn,
          tables,
          prefix,
          ids,
          mapping.roomTypeTaxonomy,
        )
      : new Map<string, { termId: string; name: string; slug: string }>();

    for (const row of rows) {
      const id = String(row.ID);
      const m = meta.get(id) || {};
      const number = officeNumber(
        m[mapping.roomNumberMeta],
        row.post_title,
        id,
      );
      const area =
        num(m[mapping.areaMeta]) ?? areaFromBadge(m[mapping.badgeMeta]);
      const bcInfo = bc.get(id);
      const companyFromMeta = mapping.companyMeta
        ? str(m[mapping.companyMeta])
        : undefined;
      const finance = financeByRoom.get(id);
      items.push({
        externalId: `${mapping.roomPostType}:${id}`,
        number,
        title: str(row.post_title) || number,
        floor: str(m[mapping.floorMeta]),
        areaSqm: area,
        company:
          companyFromMeta || roomType.get(id)?.name || roomType.get(id)?.slug,
        propertyCode: bcInfo
          ? `${mapping.businessCenterTaxonomy}:${bcInfo.termId}`
          : undefined,
        propertyName: bcInfo?.name,
        officeFormat: str(m[mapping.officeFormatMeta]),
        availability: str(m[mapping.availabilityMeta]),
        busyUntil: normalizeBusyUntil(m.room_busy_until),
        roomStatus: str(m[mapping.roomStatusMeta]),
        paymentStatus: finance?.paymentStatus,
        paidUntil: finance?.paidUntil,
        isActive: row.post_status === 'publish',
      });
    }

    return {
      name: `${posts}.${mapping.roomPostType}`,
      prefix,
      mapping,
      items,
    };
  }

  private async ensureProperty(item: SourceOfficeItem) {
    let property = await this.findProperty(item);
    if (property) {
      if (property.isActive === false) {
        property.isActive = true;
        await property.save();
      }
      const previous = item.propertyCode
        ? await this.properties.findOne({
            code: item.propertyCode,
            _id: { $ne: property._id },
          })
        : null;
      await this.stampPropertyCode(property, item.propertyCode, true);
      const absorbed = previous
        ? await this.absorbProperty(previous, property)
        : 0;
      return { property, merged: absorbed };
    }
    const name = item.propertyName?.trim() || 'Бизнес-центр (сайт)';
    property = await this.properties.create({
      name,
      address: name,
      type: PropertyType.BUSINESS_CENTER,
      code: item.propertyCode?.trim() || undefined,
      isActive: true,
    });
    return { property, merged: 0 };
  }

  private async findProperty(item: SourceOfficeItem) {
    const code = item.propertyCode?.trim() || '';
    const name = item.propertyName?.trim() || '';
    const byCode = code ? await this.properties.findOne({ code }) : null;
    const centers = await this.properties
      .find({ type: PropertyType.BUSINESS_CENTER })
      .exec();
    const byName = name
      ? centers.filter((itemBc) => normName(itemBc.name) === normName(name))
      : [];

    if (byCode) {
      const named = byName.find(
        (itemBc) => itemBc._id.toString() !== byCode._id.toString(),
      );
      if (named) {
        const [codeCount, nameCount] = await Promise.all([
          this.offices.countDocuments({ property: byCode._id }),
          this.offices.countDocuments({ property: named._id }),
        ]);
        if (nameCount >= codeCount) return named;
      }
      return byCode;
    }

    if (byName.length === 1) return byName[0];
    if (byName.length > 1) {
      return byName.find((itemBc) => !itemBc.code) || byName[0];
    }

    if (!name) {
      const withOffices: PropertyDocument[] = [];
      for (const center of centers) {
        const count = await this.offices.countDocuments({
          property: center._id,
        });
        if (count > 0) withOffices.push(center);
      }
      if (withOffices.length === 1) return withOffices[0];
      if (centers.length === 1) return centers[0];
    }

    return null;
  }

  private async stampPropertyCode(
    property: PropertyDocument,
    rawCode?: string,
    force = false,
  ) {
    const code = rawCode?.trim();
    if (!code || property.code === code) return;
    const holder = await this.properties.findOne({
      code,
      _id: { $ne: property._id },
    });
    if (holder) {
      const [holderCount, mine] = await Promise.all([
        this.offices.countDocuments({ property: holder._id }),
        this.offices.countDocuments({ property: property._id }),
      ]);
      if (!force && holderCount > mine) return;
      holder.set('code', undefined);
      await holder.save();
      await this.properties.updateOne(
        { _id: holder._id },
        { $unset: { code: 1 } },
      );
    }
    property.code = code;
    await property.save();
  }

  private async findOffice(
    item: SourceOfficeItem,
    property: PropertyDocument,
  ) {
    if (item.externalId) {
      const byExt = await this.offices.findOne({
        externalId: item.externalId,
      });
      if (byExt) return byExt;
    }
    const byNumber = await this.offices.findOne({
      property: property._id,
      number: item.number,
    });
    if (byNumber) return byNumber;
    const orphans = await this.offices.find({
      number: item.number,
      $or: [
        { externalId: { $exists: false } },
        { externalId: null },
        { externalId: '' },
      ],
    });
    if (orphans.length === 1) return orphans[0];
    return null;
  }

  private async upsertOffice(
    item: SourceOfficeItem,
    property: PropertyDocument,
  ) {
    let office = await this.findOffice(item, property);
    if (!office) {
      return this.offices.create({
        property: property._id,
        number: item.number,
        title: item.title || item.number,
        floor: item.floor || undefined,
        areaSqm: item.areaSqm,
        company: item.company || undefined,
        isActive: item.isActive !== false,
        externalId: item.externalId,
        availability: item.availability,
        officeFormat: item.officeFormat,
        busyUntil: item.busyUntil,
        roomStatus: item.roomStatus,
        paymentStatus: item.paymentStatus,
        paidUntil: item.paidUntil,
      });
    }

    if (office.property.toString() !== property._id.toString()) {
      const clash = await this.offices.findOne({
        property: property._id,
        number: item.number,
        _id: { $ne: office._id },
      });
      if (clash) {
        await this.mergeOfficeDocs(clash, office);
        await this.retireOffice(office, clash);
        office = clash;
      } else {
        office.property = property._id as any;
      }
    }

    if (item.externalId && !office.externalId) office.externalId = item.externalId;
    await this.applySourceToOffice(office, item);
    return office;
  }

  private async absorbProperty(
    from: PropertyDocument,
    into: PropertyDocument,
  ) {
    const fromOffices = await this.offices.find({ property: from._id });
    let merged = 0;
    for (const src of fromOffices) {
      const dest = await this.offices.findOne({
        property: into._id,
        number: src.number,
        _id: { $ne: src._id },
      });
      if (dest) {
        await this.mergeOfficeDocs(dest, src);
        await this.retireOffice(src, dest);
        merged += 1;
      } else {
        src.property = into._id as any;
        await src.save();
        merged += 1;
      }
    }
    from.isActive = false;
    from.set('code', undefined);
    await from.save();
    await this.properties.updateOne(
      { _id: from._id },
      { $unset: { code: 1 } },
    );
    return merged;
  }

  private async applySourceToOffice(
    office: OfficeDocument,
    item: SourceOfficeItem,
  ) {
    const prevPayment = office.paymentStatus;
    if (item.number) office.number = item.number;
    if (item.title) office.title = item.title;
    if (item.floor) office.floor = item.floor;
    if (item.areaSqm != null) office.areaSqm = item.areaSqm;
    if (item.company) office.company = item.company;
    if (item.availability !== undefined) office.availability = item.availability;
    if (item.officeFormat !== undefined)
      office.officeFormat = item.officeFormat;
    if (item.busyUntil !== undefined) office.busyUntil = item.busyUntil;
    if (item.roomStatus !== undefined) office.roomStatus = item.roomStatus;
    if (item.paymentStatus !== undefined)
      office.paymentStatus = item.paymentStatus;
    if (item.paidUntil !== undefined) office.paidUntil = item.paidUntil;
    office.isActive = item.isActive !== false;
    const nextPayment = office.paymentStatus;
    const alert =
      nextPayment === 'unpaid' || nextPayment === 'overdue';
    if (office.tenantId && alert && office.lastNotifiedPayment !== nextPayment) {
      await this.notifications.notifyOfficeStatus({
        tenantId: office.tenantId.toString(),
        officeLabel: office.title || office.number,
        paymentStatus: nextPayment || 'unpaid',
        paidUntil: office.paidUntil,
      });
      office.lastNotifiedPayment = nextPayment;
    }
    if (!alert && prevPayment && prevPayment !== nextPayment) {
      office.lastNotifiedPayment = undefined;
    }
    await office.save();
  }

  private async loadRoomFinance(
    conn: mysql.Connection,
    tables: string[],
    prefix: string,
    roomIds: string[],
  ) {
    const out = new Map<
      string,
      { paymentStatus?: string; paidUntil?: string }
    >();
    if (!roomIds.length) return out;

    const profiles = `${prefix}tf_client_profiles`;
    if (tables.includes(profiles)) {
      const sample = await this.sampleTable(conn, profiles, 200);
      for (const row of sample) {
        let data: any = {};
        try {
          data = JSON.parse(String(row.data_json || '{}'));
        } catch {
          continue;
        }
        const policy = data.office_rent_policy || {};
        const rooms: Array<{ room_id?: number }> = data.resident_offices || [];
        const paidUntil = String(policy.paid_until || '').trim();
        let paymentStatus: string | undefined;
        if (paidUntil) {
          paymentStatus =
            new Date(paidUntil).getTime() < Date.now() ? 'overdue' : 'paid';
        } else if (policy.enabled) {
          paymentStatus = 'unpaid';
        }
        if (!paymentStatus) continue;
        for (const room of rooms) {
          const id = room?.room_id != null ? String(room.room_id) : '';
          if (id && roomIds.includes(id) && !out.has(id)) {
            out.set(id, { paymentStatus, paidUntil: paidUntil || undefined });
          }
        }
      }
    }

    const bookings = `${prefix}tf_bookings`;
    if (tables.includes(bookings)) {
      const cols = await this.tableColumns(conn, bookings);
      if (cols.includes('room_id') && cols.includes('payment_status')) {
        const [rows] = await conn.query(
          `SELECT room_id, payment_status FROM ${ident(bookings)}
           WHERE room_id IN (${roomIds.map(() => '?').join(',')})
           AND payment_status IN ('unpaid','overdue','paid')
           ORDER BY id DESC`,
          roomIds,
        );
        for (const row of rows as Array<{
          room_id: number;
          payment_status: string;
        }>) {
          const id = String(row.room_id);
          if (!out.has(id) && row.payment_status) {
            out.set(id, { paymentStatus: row.payment_status });
          }
        }
      }
    }
    return out;
  }

  private collapsing: Promise<{ hidden: number }> | null = null;

  async collapseDuplicateCenters() {
    if (this.collapsing) return this.collapsing;
    this.collapsing = this.reconcileFromSite().finally(() => {
      this.collapsing = null;
    });
    return this.collapsing;
  }

  private async reconcileFromSite() {
    const cfg = await this.getPublicConfig();
    if (cfg.enabled && cfg.host) {
      try {
        await this.ensureMissingFromSite();
      } catch (err) {
        this.logger.warn(
          `reconcile MySQL: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return this.runCollapseDuplicates();
  }

  private async ensureMissingFromSite() {
    const preview = await this.previewOffices();
    const byCode = new Map<string, SourceOfficeItem>();
    for (const item of preview.items) {
      if (item.propertyCode && !byCode.has(item.propertyCode)) {
        byCode.set(item.propertyCode, item);
      }
    }
    for (const item of byCode.values()) {
      await this.ensureProperty(item);
    }
    for (const item of preview.items) {
      const { property } = await this.ensureProperty(item);
      const existing = await this.findOffice(item, property);
      if (!existing) {
        await this.offices.create({
          property: property._id,
          number: item.number,
          title: item.title || item.number,
          floor: item.floor || undefined,
          areaSqm: item.areaSqm,
          company: item.company || undefined,
          isActive: item.isActive !== false,
          externalId: item.externalId,
          availability: item.availability,
          officeFormat: item.officeFormat,
          busyUntil: item.busyUntil,
          roomStatus: item.roomStatus,
          paymentStatus: item.paymentStatus,
          paidUntil: item.paidUntil,
        });
        continue;
      }
      if (existing.property.toString() !== property._id.toString()) {
        const clash = await this.offices.findOne({
          property: property._id,
          number: item.number,
          _id: { $ne: existing._id },
        });
        if (clash) {
          await this.mergeOfficeDocs(clash, existing);
          await this.retireOffice(existing, clash);
        } else {
          existing.property = property._id as any;
          await this.applySourceToOffice(existing, item);
        }
      }
    }
  }

  private async runCollapseDuplicates() {
    const centers = await this.properties
      .find({
        type: PropertyType.BUSINESS_CENTER,
        isActive: { $ne: false },
      })
      .exec();
    const groups = new Map<string, PropertyDocument[]>();
    for (const center of centers) {
      const key = normName(center.name);
      if (!key) continue;
      const list = groups.get(key) || [];
      list.push(center);
      groups.set(key, list);
    }
    let hidden = 0;
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const counts = await Promise.all(
        group.map((center) =>
          this.offices.countDocuments({ property: center._id }),
        ),
      );
      let winnerIndex = 0;
      for (let i = 1; i < group.length; i += 1) {
        if (counts[i] > counts[winnerIndex]) winnerIndex = i;
      }
      const siteIndex = group.findIndex((center) =>
        isSiteBusinessCenterCode(center.code),
      );
      const winner =
        siteIndex >= 0 && counts[siteIndex] >= counts[winnerIndex]
          ? group[siteIndex]
          : group[winnerIndex];
      const siteCode =
        group.find((center) => isSiteBusinessCenterCode(center.code))?.code ||
        group.find((center) => center.code)?.code;
      if (siteCode) await this.stampPropertyCode(winner, siteCode, true);
      for (const loser of group) {
        if (loser._id.toString() === winner._id.toString()) continue;
        if (
          loser.address &&
          loser.address !== loser.name &&
          (!winner.address || winner.address === winner.name)
        ) {
          winner.address = loser.address;
        }
        if (/^бц\s/i.test(loser.name) && !/^бц\s/i.test(winner.name)) {
          winner.name = loser.name;
        }
        await winner.save();
        await this.absorbProperty(loser, winner);
        hidden += 1;
      }
    }
    for (const center of centers) {
      if (center.isActive === false) continue;
      const count = await this.offices.countDocuments({
        property: center._id,
      });
      if (count === 0 && !center.code) {
        center.isActive = false;
        await center.save();
        hidden += 1;
      }
    }
    return { hidden };
  }

  private async mergeOfficeDocs(keep: OfficeDocument, drop: OfficeDocument) {
    if (!keep.externalId && drop.externalId) keep.externalId = drop.externalId;
    if (!keep.floor && drop.floor) keep.floor = drop.floor;
    if (keep.areaSqm == null && drop.areaSqm != null) keep.areaSqm = drop.areaSqm;
    if (!keep.company && drop.company) keep.company = drop.company;
    if (!keep.tenantId && drop.tenantId) keep.tenantId = drop.tenantId;
    await keep.save();
  }

  private async retireOffice(drop: OfficeDocument, keep: OfficeDocument) {
    await this.passes.updateMany(
      { officeId: drop._id },
      { officeId: keep._id, property: keep.property },
    );
    await this.templates.updateMany(
      { officeId: drop._id },
      { officeId: keep._id },
    );
    await this.offices.deleteOne({ _id: drop._id });
  }

  private async connect() {
    const cfg = await this.loadDoc();
    const mysqlCfg = cfg.siteMysql || {};
    if (!mysqlCfg.enabled) {
      throw new BadRequestException('Подключение к MySQL сайта выключено');
    }
    if (!mysqlCfg.host || !mysqlCfg.database || !mysqlCfg.user) {
      throw new BadRequestException('Заполните host, database и user');
    }
    let password = '';
    if (mysqlCfg.passwordEnc) {
      try {
        password = decryptJson<string>(this.secret(), mysqlCfg.passwordEnc);
      } catch {
        throw new BadRequestException('Не удалось расшифровать пароль MySQL');
      }
    }
    try {
      return await mysql.createConnection({
        host: mysqlCfg.host,
        port: mysqlCfg.port || 3306,
        user: mysqlCfg.user,
        password,
        database: mysqlCfg.database,
        connectTimeout: 8000,
      });
    } catch (err) {
      throw new ServiceUnavailableException(
        err instanceof Error ? err.message : 'MySQL недоступен',
      );
    }
  }

  private async listTables(conn: mysql.Connection): Promise<string[]> {
    const [rows] = await conn.query('SHOW TABLES');
    return (rows as Record<string, string>[]).map(
      (row) => Object.values(row)[0],
    );
  }

  private async sampleTable(
    conn: mysql.Connection,
    table: string,
    limit: number,
  ) {
    const [rows] = await conn.query(
      `SELECT * FROM ${ident(table)} LIMIT ${Math.min(limit, 200)}`,
    );
    return (rows as Record<string, unknown>[]).map(plainRow);
  }

  private async samplePosts(
    conn: mysql.Connection,
    postsIdent: string,
    postType: string,
    limit: number,
  ) {
    const [rows] = await conn.query(
      `SELECT ID, post_title, post_status, post_date FROM ${postsIdent}
       WHERE post_type = ? AND post_status IN ('publish','private')
       ORDER BY ID ASC LIMIT ${Math.min(limit, 500)}`,
      [postType],
    );
    return rows as Array<{
      ID: number;
      post_title: string;
      post_status: string;
      post_date: Date;
    }>;
  }

  private async loadMeta(
    conn: mysql.Connection,
    postmetaIdent: string,
    ids: Array<string | number>,
    keys?: string[],
  ) {
    const map = new Map<string, Record<string, string>>();
    if (!ids.length) return map;
    const keyFilter =
      keys && keys.length
        ? ` AND meta_key IN (${keys.map(() => '?').join(',')})`
        : '';
    const [rows] = await conn.query(
      `SELECT post_id, meta_key, meta_value FROM ${postmetaIdent} WHERE post_id IN (${ids
        .map(() => '?')
        .join(',')})${keyFilter}`,
      keys && keys.length ? [...ids, ...keys] : ids,
    );
    for (const row of rows as Array<{
      post_id: number;
      meta_key: string;
      meta_value: string;
    }>) {
      const key = String(row.post_id);
      const cur = map.get(key) || {};
      cur[row.meta_key] = row.meta_value;
      map.set(key, cur);
    }
    return map;
  }

  private restartTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    void this.getPublicConfig()
      .then((cfg) => {
        if (!cfg.enabled || !cfg.autoSyncEnabled) return;
        const ms = Math.max(60, cfg.autoSyncIntervalSec) * 1000;
        this.timer = setInterval(() => {
          void this.checkSource().catch((err) =>
            this.logger.warn(
              `auto-check MySQL: ${err instanceof Error ? err.message : err}`,
            ),
          );
        }, ms);
      })
      .catch(() => undefined);
  }

  private async markPending(value: boolean) {
    const doc = await this.loadDoc();
    const raw = doc.siteMysql || {};
    raw.pendingChanges = value;
    doc.siteMysql = raw;
    doc.markModified('siteMysql');
    await doc.save();
  }

  private async upsertMeta(
    conn: mysql.Connection,
    postmeta: string,
    postId: string,
    key: string,
    value: string,
  ) {
    if (!key) return;
    const [rows] = await conn.query(
      `SELECT meta_id FROM ${ident(postmeta)} WHERE post_id = ? AND meta_key = ? LIMIT 1`,
      [postId, key],
    );
    const existing = (rows as Array<{ meta_id: number }>)[0];
    if (existing) {
      await conn.query(
        `UPDATE ${ident(postmeta)} SET meta_value = ? WHERE meta_id = ?`,
        [value, existing.meta_id],
      );
      return;
    }
    await conn.query(
      `INSERT INTO ${ident(postmeta)} (post_id, meta_key, meta_value) VALUES (?, ?, ?)`,
      [postId, key, value],
    );
  }

  private async tableColumns(conn: mysql.Connection, table: string) {
    const [rows] = await conn.query(`SHOW COLUMNS FROM ${ident(table)}`);
    return (rows as Array<{ Field: string }>).map((row) => row.Field);
  }

  private async currentMapping(): Promise<SiteMysqlMapping> {
    const raw = (await this.loadDoc()).siteMysql || {};
    return this.resolveMapping(raw);
  }

  private resolveMapping(
    raw: Partial<SiteMysqlMapping> & Record<string, unknown>,
  ): SiteMysqlMapping {
    const out = { ...DEFAULT_MAPPING };
    for (const key of MAPPING_KEYS) {
      const value = raw[key];
      if (typeof value === 'string' && value.trim()) {
        out[key] = value.trim();
      } else if (key === 'companyMeta' && typeof value === 'string') {
        out[key] = value.trim();
      }
    }
    return out;
  }

  private async resolvePrefix(
    conn: mysql.Connection,
    tables: string[],
  ): Promise<string> {
    const configured = ((await this.currentMapping()).tablePrefix || '').trim();
    if (configured && tables.includes(`${configured}posts`)) return configured;
    if (tables.includes('wps_posts')) return 'wps_';
    if (tables.includes('wp_posts')) return 'wp_';
    return configured || DEFAULT_PREFIX;
  }

  private async loadTaxonomy(
    conn: mysql.Connection,
    tables: string[],
    prefix: string,
    ids: Array<string | number>,
    taxonomy: string,
  ) {
    const map = new Map<string, { termId: string; name: string; slug: string }>();
    const rel = `${prefix}term_relationships`;
    const tax = `${prefix}term_taxonomy`;
    const terms = `${prefix}terms`;
    if (
      !ids.length ||
      !tables.includes(rel) ||
      !tables.includes(tax) ||
      !tables.includes(terms)
    ) {
      return map;
    }
    const [rows] = await conn.query(
      `SELECT tr.object_id AS object_id, t.term_id AS term_id, t.name AS name, t.slug AS slug
       FROM ${ident(rel)} tr
       INNER JOIN ${ident(tax)} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
       INNER JOIN ${ident(terms)} t ON t.term_id = tt.term_id
       WHERE tt.taxonomy = ? AND tr.object_id IN (${ids.map(() => '?').join(',')})`,
      [taxonomy, ...ids],
    );
    for (const row of rows as Array<{
      object_id: number;
      term_id: number;
      name: string;
      slug: string;
    }>) {
      map.set(String(row.object_id), {
        termId: String(row.term_id),
        name: row.name,
        slug: row.slug,
      });
    }
    return map;
  }

  private async loadDoc() {
    const doc = await this.settings.findOne({ key: SETTINGS_KEY });
    if (!doc) throw new BadRequestException('Настройки сайта не найдены');
    return doc;
  }

  private secret() {
    return (
      this.config.get<string>('MSTYLE_PII_KEY') ||
      this.config.get<string>('JWT_SECRET') ||
      'mstyle-v2-dev-pii-key'
    );
  }
}

function normalizeBusyUntil(raw?: string) {
  const value = String(raw || '').trim();
  if (!value) return undefined;
  const compact = value.replace(/-/g, '');
  if (/^\d{8}$/.test(compact)) {
    return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return value;
}

function sourcePostId(externalId: string) {
  const match = String(externalId).match(/:(\d+)$/);
  return match?.[1];
}

function pick(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim() !== '') return row[key];
  }
  return undefined;
}

function isSiteBusinessCenterCode(code?: string) {
  return /tf[_-]?business[_-]?center/i.test(String(code || ''));
}

export function normalizeBusinessCenterName(value?: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/^(бц|бизнес[-\s]?центр|business\s*center|bc)\s+/i, '')
    .replace(/[\s_]+/g, ' ')
    .trim();
}

function normName(value?: string) {
  return normalizeBusinessCenterName(value);
}

function ident(name: string) {
  return `\`${String(name).replace(/`/g, '')}\``;
}

function tableName(prefix: string, suffix: string) {
  const name = String(suffix || '').trim();
  if (!name) return `${prefix}`;
  if (name.startsWith(prefix)) return name;
  return `${prefix}${name.replace(/^_/, '')}`;
}

function officeNumber(
  roomNumber?: string,
  title?: string,
  fallback?: string,
): string {
  const direct = str(roomNumber);
  if (direct) return direct;
  const fromTitle = String(title || '').match(
    /(?:офис|№|#|-)\s*([0-9A-Za-zА-Яа-я/-]+)/i,
  );
  if (fromTitle?.[1]) return fromTitle[1];
  return str(title) || fallback || '';
}

function areaFromBadge(value?: string): number | undefined {
  const match = String(value || '').replace(/\s/g, '').match(/(\d+(?:[.,]\d+)?)\s*м/i);
  if (!match) return undefined;
  return num(match[1].replace(',', '.'));
}

function str(value: unknown): string | undefined {
  if (value == null) return undefined;
  const out = String(value).trim();
  return out || undefined;
}

function num(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function plainRow(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (Buffer.isBuffer(value)) out[key] = value.toString('utf8');
    else if (value instanceof Date) out[key] = value.toISOString();
    else out[key] = value;
  }
  return out;
}
