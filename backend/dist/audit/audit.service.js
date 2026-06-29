"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const schemas_1 = require("../schemas");
const EXPORT_LIMIT = 10_000;
const ACTION_LABELS = {
    'pass.create': 'Создание пропуска',
    'pass.approved': 'Одобрение',
    'pass.rejected': 'Отклонение',
    'pass.cancelled': 'Отмена',
    'pass.check_in': 'Вход в БЦ',
    'pass.check_out': 'Выход из БЦ',
    'pass.expired': 'Истечение пропуска',
    'user.create': 'Создание пользователя',
    'user.update': 'Изменение пользователя',
    'profile.change_request': 'Заявка на изменение профиля',
    'profile.change_approved': 'Профиль подтверждён',
    'profile.change_rejected': 'Изменение профиля отклонено',
    'settings.update': 'Изменение настроек',
    'office.create': 'Добавление офиса',
    'office.update': 'Изменение офиса',
    'bc.create': 'Создание БЦ',
    'bc.update': 'Изменение БЦ',
    'permissions.update': 'Изменение прав доступа',
    'site_settings.update': 'Изменение настроек сайта',
};
const ENTITY_LABELS = {
    pass: 'Пропуск',
    user: 'Пользователь',
    office: 'Офис',
    business_center: 'Бизнес-центр',
    property: 'Бизнес-центр',
    access_config: 'Права доступа',
    app_settings: 'Настройки сайта',
};
let AuditService = class AuditService {
    auditLogModel;
    userModel;
    constructor(auditLogModel, userModel) {
        this.auditLogModel = auditLogModel;
        this.userModel = userModel;
    }
    async log(params) {
        const actor = params.actor;
        let userName;
        let userEmail = actor?.email;
        let userId;
        if (actor?.userId) {
            userId = new mongoose_2.Types.ObjectId(actor.userId);
            const user = await this.userModel.findById(actor.userId).select('fullName email').lean();
            if (user) {
                userName = user.fullName;
                userEmail = user.email;
            }
        }
        await this.auditLogModel.create({
            action: params.action,
            entityType: params.entityType,
            entityId: params.entityId ? new mongoose_2.Types.ObjectId(params.entityId) : undefined,
            userId,
            userName,
            userEmail,
            details: params.details || {},
        });
    }
    async getAudit(query = {}) {
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
    async exportCsv(query = {}) {
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
    buildFilter(query) {
        const filter = {};
        if (query.dateFrom || query.dateTo) {
            const createdAt = {};
            if (query.dateFrom) {
                createdAt.$gte = new Date(`${query.dateFrom}T00:00:00.000Z`);
            }
            if (query.dateTo) {
                createdAt.$lte = new Date(`${query.dateTo}T23:59:59.999Z`);
            }
            filter.createdAt = createdAt;
        }
        if (query.action?.trim())
            filter.action = query.action.trim();
        if (query.entityType?.trim())
            filter.entityType = query.entityType.trim();
        if (query.userId?.trim())
            filter.userId = new mongoose_2.Types.ObjectId(query.userId.trim());
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
    escapeCsv(value) {
        if (/[;"\r\n]/.test(value)) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    }
    async getRecent(limit = 10) {
        const entries = await this.auditLogModel.find().sort({ createdAt: -1 }).limit(limit).lean();
        return entries.map((e) => this.mapEntry(e));
    }
    mapEntry(doc) {
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
    formatEntityLabel(doc) {
        const type = ENTITY_LABELS[doc.entityType || ''] || doc.entityType || 'Объект';
        const d = doc.details || {};
        switch (doc.entityType) {
            case 'pass': {
                const passNumber = d.passNumber;
                const visitorName = d.visitorName;
                if (passNumber && visitorName)
                    return `${type} ${passNumber} · ${visitorName}`;
                if (passNumber)
                    return `${type} ${passNumber}`;
                break;
            }
            case 'user': {
                const fullName = d.fullName;
                const email = d.email;
                if (fullName)
                    return `${type}: ${fullName}`;
                if (email)
                    return `${type}: ${email}`;
                break;
            }
            case 'office': {
                const number = d.number;
                const floor = d.floor;
                if (number)
                    return `${type} ${number}${floor ? `, ${floor} эт.` : ''}`;
                break;
            }
            case 'business_center':
            case 'property': {
                const name = d.name;
                const address = d.address;
                if (name && address)
                    return `${type}: ${name} · ${address}`;
                if (name)
                    return `${type}: ${name}`;
                break;
            }
            case 'app_settings': {
                const siteName = d.siteName;
                if (siteName)
                    return `${type}: ${siteName}`;
                break;
            }
            case 'access_config':
                return type;
            default:
                break;
        }
        return type;
    }
};
exports.AuditService = AuditService;
exports.AuditService = AuditService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(schemas_1.AuditLog.name)),
    __param(1, (0, mongoose_1.InjectModel)(schemas_1.User.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model])
], AuditService);
//# sourceMappingURL=audit.service.js.map