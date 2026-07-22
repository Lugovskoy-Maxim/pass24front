/**
 * Журнал действий (audit_logs, operational DB).
 * Вызывать после мутаций: user.*, pass.*, site_settings.*, tenant.employee_*.
 */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AUTH_CONNECTION } from '../database/auth-database.constants';
import { AuditLog, AuditLogDocument, User, UserDocument } from '../schemas';

export interface AuditActor {
  userId?: string;
  email?: string;
  role?: string;
}

export interface AuditQuery {
  offset?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  action?: string;
  entityType?: string;
  userId?: string;
  search?: string;
}

const EXPORT_LIMIT = 10_000;

const ACTION_LABELS: Record<string, string> = {
  'pass.create': 'Создание пропуска',
  'pass.approved': 'Одобрение',
  'pass.visitor_data_updated': 'Паспортные данные посетителя',
  'pass.rejected': 'Отклонение',
  'pass.cancelled': 'Отмена',
  'pass.check_in': 'Вход в БЦ',
  'pass.check_out': 'Выход из БЦ',
  'pass.expired': 'Истечение пропуска',
  'user.create': 'Создание пользователя',
  'user.update': 'Изменение пользователя',
  'user.registration_request': 'Заявка на регистрацию',
  'user.registration_approved': 'Подтверждение регистрации',
  'user.registration_rejected': 'Отклонение регистрации',
  'profile.change_request': 'Заявка на изменение профиля',
  'profile.change_approved': 'Профиль подтверждён',
  'profile.change_rejected': 'Изменение профиля отклонено',
  'settings.update': 'Изменение настроек',
  'office.create': 'Добавление офиса',
  'office.update': 'Изменение офиса',
  'office.delete': 'Удаление офиса',
  'bc.create': 'Создание БЦ',
  'bc.update': 'Изменение БЦ',
  'bc.delete': 'Удаление БЦ',
  'permissions.update': 'Изменение прав доступа',
  'site_settings.update': 'Изменение настроек сайта',
};

const ENTITY_LABELS: Record<string, string> = {
  pass: 'Пропуск',
  user: 'Пользователь',
  office: 'Офис',
  business_center: 'Бизнес-центр',
  property: 'Бизнес-центр',
  access_config: 'Права доступа',
  app_settings: 'Настройки сайта',
};

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
    @InjectModel(User.name, AUTH_CONNECTION) private userModel: Model<UserDocument>,
  ) {}

  async log(params: {
    action: string;
    entityType: string;
    entityId?: string | Types.ObjectId;
    actor?: AuditActor;
    details?: Record<string, unknown>;
  }) {
    const actor = params.actor;
    let userName: string | undefined;
    let userEmail = actor?.email;
    let userId: Types.ObjectId | undefined;

    if (actor?.userId) {
      userId = new Types.ObjectId(actor.userId);
      const user = await this.userModel.findById(actor.userId).select('fullName email').lean();
      if (user) {
        userName = user.fullName;
        userEmail = user.email;
      }
    }

    await this.auditLogModel.create({
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ? new Types.ObjectId(params.entityId) : undefined,
      userId,
      userName,
      userEmail,
      details: params.details || {},
    });
  }

  async getAudit(query: AuditQuery = {}) {
    const offset = Math.max(0, query.offset ?? 0);
    const limit = Math.min(Math.max(1, query.limit ?? 50), 200);
    const filter = this.buildFilter(query);

    const [entries, total] = await Promise.all([
      this.auditLogModel.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
      this.auditLogModel.countDocuments(filter),
    ]);

    return {
      entries: entries.map((e) => this.mapEntry(e)),
      total,
      offset,
      limit,
    };
  }

  async exportCsv(query: AuditQuery = {}) {
    const filter = this.buildFilter(query);
    const entries = await this.auditLogModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(EXPORT_LIMIT)
      .lean();

    const header = ['Дата и время', 'Действие', 'Пользователь', 'Email', 'Объект', 'Детали'];
    const rows = entries.map((doc) => {
      const entry = this.mapEntry(doc);
      return [
        entry.createdAt ? new Date(entry.createdAt).toLocaleString('ru-RU') : '',
        ACTION_LABELS[entry.action] || entry.action,
        entry.userName || '',
        entry.userEmail || '',
        entry.entityLabel,
        entry.details ? JSON.stringify(entry.details) : '',
      ];
    });

    return [header, ...rows].map((row) => row.map((cell) => this.escapeCsv(String(cell ?? ''))).join(';')).join('\r\n');
  }

  private buildFilter(query: AuditQuery) {
    const filter: Record<string, unknown> = {};

    if (query.dateFrom || query.dateTo) {
      const createdAt: Record<string, Date> = {};
      if (query.dateFrom) {
        createdAt.$gte = new Date(`${query.dateFrom}T00:00:00.000Z`);
      }
      if (query.dateTo) {
        createdAt.$lte = new Date(`${query.dateTo}T23:59:59.999Z`);
      }
      filter.createdAt = createdAt;
    }

    if (query.action?.trim()) filter.action = query.action.trim();
    if (query.entityType?.trim()) filter.entityType = query.entityType.trim();
    if (query.userId?.trim()) filter.userId = new Types.ObjectId(query.userId.trim());

    if (query.search?.trim()) {
      const rx = new RegExp(query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { userName: rx },
        { userEmail: rx },
        { action: rx },
        { entityType: rx },
        { 'details.passNumber': rx },
        { 'details.visitorName': rx },
        { 'details.email': rx },
        { 'details.fullName': rx },
        { 'details.name': rx },
        { 'details.siteName': rx },
      ];
    }

    return filter;
  }

  private escapeCsv(value: string) {
    if (/[;"\r\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  async getRecent(limit = 10) {
    const entries = await this.auditLogModel.find().sort({ createdAt: -1 }).limit(limit).lean();
    return entries.map((e) => this.mapEntry(e));
  }

  private mapEntry(doc: any) {
    return {
      id: doc._id.toString(),
      userId: doc.userId?.toString() || '',
      userName: doc.userName,
      userEmail: doc.userEmail,
      action: doc.action,
      entityType: doc.entityType,
      entityId: doc.entityId?.toString(),
      entityLabel: this.formatEntityLabel(doc),
      details: doc.details,
      createdAt: doc.createdAt,
    };
  }

  private formatEntityLabel(doc: { entityType?: string; details?: Record<string, unknown> }) {
    const type = ENTITY_LABELS[doc.entityType || ''] || doc.entityType || 'Объект';
    const d = doc.details || {};

    switch (doc.entityType) {
      case 'pass': {
        const passNumber = d.passNumber as string | undefined;
        const visitorName = d.visitorName as string | undefined;
        if (passNumber && visitorName) return `${type} ${passNumber} · ${visitorName}`;
        if (passNumber) return `${type} ${passNumber}`;
        break;
      }
      case 'user': {
        const fullName = d.fullName as string | undefined;
        const email = d.email as string | undefined;
        if (fullName) return `${type}: ${fullName}`;
        if (email) return `${type}: ${email}`;
        break;
      }
      case 'office': {
        const number = d.number as string | undefined;
        const floor = d.floor as string | undefined;
        if (number) return `${type} ${number}${floor ? `, ${floor} эт.` : ''}`;
        break;
      }
      case 'business_center':
      case 'property': {
        const name = d.name as string | undefined;
        const address = d.address as string | undefined;
        if (name && address) return `${type}: ${name} · ${address}`;
        if (name) return `${type}: ${name}`;
        break;
      }
      case 'app_settings': {
        const siteName = d.siteName as string | undefined;
        if (siteName) return `${type}: ${siteName}`;
        break;
      }
      case 'access_config':
        return type;
      default:
        break;
    }

    return type;
  }
}