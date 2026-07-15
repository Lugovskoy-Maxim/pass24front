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
exports.PassesService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const access_config_service_1 = require("../access/access-config.service");
const audit_service_1 = require("../audit/audit.service");
const mail_service_1 = require("../mail/mail.service");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const auth_database_constants_1 = require("../database/auth-database.constants");
const schemas_1 = require("../schemas");
const enums_1 = require("../schemas/enums");
const pass_helpers_1 = require("../common/pass-helpers");
const tenant_owner_1 = require("../common/tenant-owner");
const tenant_account_1 = require("../common/tenant-account");
const user_permissions_1 = require("../common/user-permissions");
const bookable_visit_dates_1 = require("../common/bookable-visit-dates");
const visit_date_1 = require("../common/visit-date");
const pass_csv_1 = require("../common/pass-csv");
const pass_templates_service_1 = require("./pass-templates.service");
const PASS_EXPORT_LIMIT = 10_000;
const PASS_REPORT_PAGE_SIZE = 50;
const PASS_LIST_PAGE_SIZE = 50;
let PassesService = class PassesService {
    passModel;
    officeModel;
    propertyModel;
    userModel;
    accessConfigService;
    passTemplatesService;
    auditService;
    mailService;
    configService;
    constructor(passModel, officeModel, propertyModel, userModel, accessConfigService, passTemplatesService, auditService, mailService, configService) {
        this.passModel = passModel;
        this.officeModel = officeModel;
        this.propertyModel = propertyModel;
        this.userModel = userModel;
        this.accessConfigService = accessConfigService;
        this.passTemplatesService = passTemplatesService;
        this.auditService = auditService;
        this.mailService = mailService;
        this.configService = configService;
    }
    generatePassNumber() {
        const year = new Date().getFullYear();
        const random = Math.floor(1000 + Math.random() * 9000);
        return `Pass-${year}-${random}`;
    }
    async onModuleInit() {
        await this.expirePastPasses();
    }
    getTodayDate() {
        return this.getLocalDateString();
    }
    getLocalDateString(date = new Date()) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    parseTimeToMinutes(time) {
        const [h, m] = time.split(':').map((v) => parseInt(v, 10));
        if (Number.isNaN(h))
            return 0;
        return h * 60 + (Number.isNaN(m) ? 0 : m);
    }
    isPassOverdueInBuilding(pass, now = new Date()) {
        if (pass.status !== 'active')
            return false;
        const today = this.getLocalDateString(now);
        if (pass.visitDate < today)
            return true;
        if (pass.visitDate === today && pass.visitTimeTo) {
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            return currentMinutes > this.parseTimeToMinutes(pass.visitTimeTo);
        }
        return false;
    }
    async expirePastPasses() {
        const today = this.getTodayDate();
        const toExpire = await this.passModel
            .find({ visitDate: { $lt: today }, status: { $in: ['pending', 'approved'] } })
            .select('_id passNumber visitDate')
            .lean();
        if (toExpire.length) {
            await this.passModel.updateMany({ _id: { $in: toExpire.map((p) => p._id) } }, { $set: { status: 'expired' } });
            await Promise.all(toExpire.map((pass) => this.auditService.log({
                action: 'pass.expired',
                entityType: 'pass',
                entityId: pass._id,
                details: { passNumber: pass.passNumber, visitDate: pass.visitDate },
            })));
        }
        return toExpire.length;
    }
    createdByFilter(userId) {
        return {
            $or: [
                { createdBy: userId },
                { createdBy: new mongoose_2.Types.ObjectId(userId) },
            ],
        };
    }
    createdByTeamFilter(userIds) {
        return { createdBy: { $in: userIds } };
    }
    async getTenantTeamIds(user) {
        const ownerId = (0, tenant_owner_1.resolveTenantOwnerId)(user);
        if (!ownerId)
            return [];
        const team = await this.userModel
            .find({
            $or: [
                { _id: new mongoose_2.Types.ObjectId(ownerId) },
                { parentTenantId: new mongoose_2.Types.ObjectId(ownerId), isActive: { $ne: false } },
            ],
        })
            .select('_id')
            .lean();
        return team.map((member) => member._id);
    }
    async buildAccessFilter(user) {
        if (!user?.role)
            return { _id: null };
        if ((0, tenant_account_1.isTenantCompanyUser)(user)) {
            const teamIds = await this.getTenantTeamIds(user);
            if (!teamIds.length)
                return { _id: null };
            if (user.parentTenantId) {
                if ((0, user_permissions_1.userHasPermission)(user, 'passes.view_own')) {
                    return this.createdByFilter(user.userId);
                }
                return { _id: null };
            }
            return this.createdByTeamFilter(teamIds);
        }
        if (await this.accessConfigService.canViewAllPasses(user.role, user.parentTenantId)) {
            return {};
        }
        if (user.permissions?.length) {
            if ((0, user_permissions_1.userHasPermission)(user, 'passes.view_own')) {
                return this.createdByFilter(user.userId);
            }
            return { _id: null };
        }
        if (await this.accessConfigService.hasPermission(user.role, 'passes.view_own')) {
            return this.createdByFilter(user.userId);
        }
        return { _id: null };
    }
    appendSearchFilter(filter, search) {
        const term = search?.trim();
        if (!term)
            return;
        const pattern = new RegExp(this.escapeRegex(term), 'i');
        filter.$and = filter.$and || [];
        filter.$and.push({
            $or: [
                { visitorName: pattern },
                { visitorPhone: pattern },
                { visitorPassportSeries: pattern },
                { visitorPassportNumber: pattern },
                { vehiclePlate: pattern },
                { companyName: pattern },
                { businessCenterName: pattern },
                { office: pattern },
                { passNumber: pattern },
            ],
        });
    }
    async assertTenantExportScope(user, params) {
        const ownerId = (0, tenant_owner_1.resolveTenantOwnerId)(user);
        if (!ownerId)
            throw new common_1.ForbiddenException('Нет доступа');
        const offices = await this.officeModel
            .find({ tenantId: new mongoose_2.Types.ObjectId(ownerId), isActive: true })
            .select('_id property')
            .lean();
        const officeIds = new Set(offices.map((o) => o._id.toString()));
        const propertyIds = new Set(offices.map((o) => o.property?.toString()).filter((id) => !!id));
        if (params.officeId && !officeIds.has(params.officeId)) {
            throw new common_1.ForbiddenException('Нет доступа к выбранному офису');
        }
        if (params.propertyId && !propertyIds.has(params.propertyId)) {
            throw new common_1.ForbiddenException('Нет доступа к выбранному БЦ');
        }
    }
    async buildListFilter(params, user) {
        const filter = { ...(await this.buildAccessFilter(user)) };
        if (params.status)
            filter.status = params.status;
        if (params.passType)
            filter.passType = params.passType;
        if (params.dateFrom || params.dateTo) {
            if (params.dateFrom && !(0, visit_date_1.isValidVisitDateString)(params.dateFrom)) {
                throw new common_1.BadRequestException('Некорректная дата «с»');
            }
            if (params.dateTo && !(0, visit_date_1.isValidVisitDateString)(params.dateTo)) {
                throw new common_1.BadRequestException('Некорректная дата «по»');
            }
            if (params.dateFrom && params.dateTo && params.dateFrom > params.dateTo) {
                throw new common_1.BadRequestException('Дата «с» не может быть позже даты «по»');
            }
            filter.visitDate = {};
            if (params.dateFrom)
                filter.visitDate.$gte = params.dateFrom;
            if (params.dateTo)
                filter.visitDate.$lte = params.dateTo;
        }
        else if (params.date) {
            if (!(0, visit_date_1.isValidVisitDateString)(params.date)) {
                throw new common_1.BadRequestException('Некорректная дата визита');
            }
            filter.visitDate = params.date;
        }
        this.appendSearchFilter(filter, params.search);
        if (params.propertyId || params.officeId) {
            if ((0, tenant_account_1.isTenantCompanyUser)(user)) {
                await this.assertTenantExportScope(user, params);
            }
            if (params.propertyId)
                filter.property = new mongoose_2.Types.ObjectId(params.propertyId);
            if (params.officeId)
                filter.officeId = new mongoose_2.Types.ObjectId(params.officeId);
        }
        if (params.tenantId) {
            if ((0, tenant_account_1.isTenantCompanyUser)(user)) {
                throw new common_1.ForbiddenException('Фильтр по арендатору недоступен');
            }
            if (!(await this.accessConfigService.canViewAllPasses(user.role, user.parentTenantId))) {
                throw new common_1.ForbiddenException('Нет доступа к фильтру по арендатору');
            }
            filter.createdBy = new mongoose_2.Types.ObjectId(params.tenantId);
        }
        return filter;
    }
    async findAll(params, user) {
        await this.expirePastPasses();
        const filter = await this.buildListFilter(params, user);
        const limit = Math.min(Math.max(parseInt(params.limit || String(PASS_LIST_PAGE_SIZE), 10) || PASS_LIST_PAGE_SIZE, 1), 200);
        const offset = Math.max(parseInt(params.offset || '0', 10) || 0, 0);
        const [passes, total] = await Promise.all([
            this.passModel.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
            this.passModel.countDocuments(filter),
        ]);
        const withCheckout = await this.enrichPassCheckoutSettings(passes);
        const enriched = await this.enrichCreatorFields(withCheckout, user);
        return {
            passes: enriched.map((p) => this.mapToFrontend(p, user)),
            total,
            offset,
            limit,
            hasMore: offset + passes.length < total,
        };
    }
    async getExportFilters(user) {
        const canFilterTenants = !(0, tenant_account_1.isTenantCompanyUser)(user)
            && !!(await this.accessConfigService.canViewAllPasses(user?.role, user?.parentTenantId));
        if ((0, tenant_account_1.isTenantCompanyUser)(user)) {
            const ownerId = (0, tenant_owner_1.resolveTenantOwnerId)(user);
            const offices = ownerId
                ? await this.officeModel.find({ tenantId: new mongoose_2.Types.ObjectId(ownerId), isActive: true }).lean()
                : [];
            const propertyIds = [...new Set(offices.map((o) => o.property?.toString()).filter((id) => !!id))];
            const properties = propertyIds.length
                ? await this.propertyModel.find({ _id: { $in: propertyIds.map((id) => new mongoose_2.Types.ObjectId(id)) } }).select('name').lean()
                : [];
            const propertyMap = new Map(properties.map((p) => [p._id.toString(), p.name]));
            return {
                scope: 'own',
                businessCenters: propertyIds.map((id) => ({ id, name: propertyMap.get(id) || 'БЦ' })),
                offices: offices.map((o) => ({
                    id: o._id.toString(),
                    propertyId: o.property?.toString(),
                    number: o.number,
                    businessCenterName: propertyMap.get(o.property?.toString() || '') || '',
                    company: o.company,
                })),
                tenants: [],
            };
        }
        const [properties, offices, tenants] = await Promise.all([
            this.propertyModel.find({ type: enums_1.PropertyType.BUSINESS_CENTER, isActive: true }).sort({ name: 1 }).lean(),
            this.officeModel.find({ isActive: true }).sort({ number: 1 }).lean(),
            canFilterTenants
                ? this.userModel
                    .find({ role: 'tenant', parentTenantId: null, isActive: { $ne: false } })
                    .select('fullName company email')
                    .sort({ company: 1, fullName: 1 })
                    .lean()
                : Promise.resolve([]),
        ]);
        const propertyMap = new Map(properties.map((p) => [p._id.toString(), p.name]));
        return {
            scope: 'all',
            businessCenters: properties.map((p) => ({ id: p._id.toString(), name: p.name })),
            offices: offices.map((o) => ({
                id: o._id.toString(),
                propertyId: o.property?.toString(),
                number: o.number,
                businessCenterName: propertyMap.get(o.property?.toString() || '') || '',
                company: o.company,
            })),
            tenants: tenants.map((t) => ({
                id: t._id.toString(),
                company: t.company || t.fullName,
                email: t.email,
            })),
        };
    }
    async findReport(query, user) {
        await this.expirePastPasses();
        const reportQuery = { ...query };
        if (!reportQuery.dateFrom && !reportQuery.dateTo && !reportQuery.date) {
            const today = this.getLocalDateString();
            reportQuery.dateTo = today;
            const monthStart = `${today.slice(0, 8)}01`;
            reportQuery.dateFrom = monthStart;
        }
        const filter = await this.buildListFilter(reportQuery, user);
        const limit = Math.min(reportQuery.limit || PASS_REPORT_PAGE_SIZE, PASS_REPORT_PAGE_SIZE);
        const offset = Math.max(reportQuery.offset || 0, 0);
        const [passes, total] = await Promise.all([
            this.passModel
                .find(filter)
                .sort({ visitDate: -1, createdAt: -1 })
                .skip(offset)
                .limit(limit)
                .lean(),
            this.passModel.countDocuments(filter),
        ]);
        const withCheckout = await this.enrichPassCheckoutSettings(passes);
        const enriched = await this.enrichCreatorFields(withCheckout, user);
        return {
            passes: enriched.map((p) => this.mapToFrontend(p, user)),
            total,
            offset,
            limit,
            dateFrom: reportQuery.dateFrom,
            dateTo: reportQuery.dateTo,
        };
    }
    async exportCsv(query, user) {
        await this.expirePastPasses();
        const filter = await this.buildListFilter(query, user);
        const limit = Math.min(query.limit || PASS_EXPORT_LIMIT, PASS_EXPORT_LIMIT);
        const passes = await this.passModel
            .find(filter)
            .sort({ visitDate: -1, createdAt: -1 })
            .limit(limit)
            .lean();
        const withCheckout = await this.enrichPassCheckoutSettings(passes);
        const enriched = await this.enrichCreatorFields(withCheckout, user);
        const includeCreator = !(0, tenant_account_1.isTenantCompanyUser)(user);
        return (0, pass_csv_1.buildPassCsv)(enriched.map((doc) => ({
            passNumber: doc.passNumber,
            status: doc.status,
            passType: doc.passType,
            visitDate: doc.visitDate,
            visitTimeFrom: doc.visitTimeFrom,
            visitTimeTo: doc.visitTimeTo,
            visitorName: doc.visitorName,
            visitorPhone: doc.visitorPhone,
            companyName: doc.companyName,
            visitPurpose: doc.visitPurpose,
            businessCenterName: doc.businessCenterName,
            office: doc.office,
            floor: doc.floor,
            vehiclePlate: doc.vehiclePlate,
            vehicleModel: doc.vehicleModel,
            creatorName: doc.creatorName,
            creatorCompany: doc.creatorCompany,
            creatorPhone: doc.creatorPhone,
            approverName: doc.approverName,
            checkedInAt: doc.checkedInAt,
            checkedOutAt: doc.checkedOutAt,
            comment: doc.comment,
            createdAt: doc.createdAt,
        })), { includeCreator });
    }
    async findOne(id, user) {
        await this.expirePastPasses();
        const pass = await this.passModel.findById(id).lean();
        if (!pass)
            throw new common_1.NotFoundException('Пропуск не найден');
        await this.ensurePassAccess(pass, user);
        const [withCheckout] = await this.enrichPassCheckoutSettings([pass]);
        const [enriched] = await this.enrichCreatorFields([withCheckout], user);
        return { pass: this.mapToFrontend(enriched, user) };
    }
    async create(dto, user) {
        const enabled = await this.accessConfigService.isPassTypeEnabled(dto.passType);
        if (!enabled) {
            throw new common_1.BadRequestException('Этот тип пропуска отключён администратором');
        }
        const { sendEmail, recipientEmail, ...passDto } = dto;
        if (sendEmail && !recipientEmail?.trim()) {
            throw new common_1.BadRequestException('Укажите email для отправки пропуска');
        }
        if (!(0, visit_date_1.isValidVisitDateString)(passDto.visitDate)) {
            throw new common_1.BadRequestException('Некорректная дата визита');
        }
        const resolved = await this.resolveOfficeFields(passDto, user);
        const closedWeekdays = await this.getClosedWeekdaysForProperty(resolved.property);
        try {
            (0, bookable_visit_dates_1.assertVisitDateBookable)(passDto.visitDate, this.getTodayDate(), closedWeekdays);
        }
        catch (e) {
            if (e instanceof Error && e.message === 'PAST_DATE') {
                throw new common_1.BadRequestException('Нельзя заказать пропуск на прошедшую дату');
            }
            if (e instanceof Error && e.message === 'NOT_BOOKABLE') {
                throw new common_1.BadRequestException('Выберите одну из доступных дат визита');
            }
            throw new common_1.BadRequestException('Некорректная дата визита');
        }
        const workingHours = await this.resolveWorkingHours(resolved.property, passDto);
        passDto.visitTimeFrom = workingHours.from;
        passDto.visitTimeTo = workingHours.to;
        const creator = user?.userId
            ? await this.userModel.findById(user.userId).select('fullName phone company email').lean()
            : null;
        const passNumber = this.generatePassNumber();
        const approvedAt = new Date().toISOString();
        const doc = await this.passModel.create({
            ...passDto,
            visitPurpose: (0, pass_helpers_1.deriveVisitPurpose)(passDto.passType),
            ...resolved,
            passNumber,
            status: 'approved',
            approvedAt,
            createdBy: user?.userId ? new mongoose_2.Types.ObjectId(user.userId) : undefined,
            creatorName: creator?.fullName || user?.fullName || user?.email,
            creatorPhone: creator?.phone,
            creatorCompany: resolved.companyName || passDto.companyName || creator?.company,
        });
        if ((0, tenant_account_1.isTenantCompanyUser)(user)) {
            await this.passTemplatesService.upsertFromPass(doc.toObject(), user.userId);
        }
        await this.auditService.log({
            action: 'pass.create',
            entityType: 'pass',
            entityId: doc._id,
            actor: user,
            details: { passNumber: doc.passNumber, visitorName: doc.visitorName, status: doc.status },
        });
        let emailSent = false;
        if (sendEmail && recipientEmail) {
            await this.sendPassEmail(doc._id.toString(), recipientEmail.trim(), user);
            emailSent = true;
        }
        return { pass: this.mapToFrontend(doc, user), emailSent };
    }
    async sendPassEmail(idOrNumber, email, user) {
        const isObjectId = /^[a-f0-9]{24}$/i.test(idOrNumber);
        let pass = isObjectId ? await this.passModel.findById(idOrNumber).lean() : null;
        if (!pass) {
            pass = await this.passModel.findOne({ passNumber: idOrNumber }).lean();
        }
        if (!pass)
            throw new common_1.NotFoundException('Пропуск не найден');
        await this.ensurePassAccess(pass, user);
        const ticketUrl = this.buildTicketUrl(pass.passNumber);
        await this.mailService.sendPassTicket({
            to: email.trim().toLowerCase(),
            visitorName: pass.visitorName,
            passNumber: pass.passNumber,
            visitDate: pass.visitDate,
            visitTimeFrom: pass.visitTimeFrom,
            visitTimeTo: pass.visitTimeTo,
            businessCenterName: pass.businessCenterName,
            office: pass.office,
            floor: pass.floor,
            companyName: pass.companyName,
            visitPurpose: pass.visitPurpose,
            ticketUrl,
        });
        return { sent: true, email: email.trim().toLowerCase() };
    }
    buildTicketUrl(passNumber) {
        const base = (this.configService.get('PUBLIC_APP_URL') || 'http://127.0.0.1:3000').replace(/\/$/, '');
        return `${base}/ticket/${encodeURIComponent(passNumber)}`;
    }
    async updateStatus(id, dto, actor) {
        const pass = await this.passModel.findById(id);
        if (!pass)
            throw new common_1.NotFoundException('Пропуск не найден');
        const canApprove = actor?.role
            ? await this.accessConfigService.hasPermission(actor.role, 'passes.approve')
            : false;
        const canReception = actor?.role
            ? await this.accessConfigService.hasPermission(actor.role, 'passes.reception')
            : false;
        const isCreator = actor?.userId && pass.createdBy?.toString() === actor.userId;
        if (dto.status === 'cancelled') {
            if (!canApprove && !isCreator) {
                throw new common_1.ForbiddenException('Нельзя отменить этот пропуск');
            }
            if (!canApprove && !['pending', 'approved'].includes(pass.status)) {
                throw new common_1.BadRequestException('Можно отменить только до входа в здание');
            }
        }
        else if (dto.status === 'rejected') {
            if (!canApprove && !canReception) {
                throw new common_1.ForbiddenException('Недостаточно прав для отклонения пропуска');
            }
            if (!['pending', 'approved'].includes(pass.status)) {
                throw new common_1.BadRequestException('Можно отклонить только до входа в здание');
            }
        }
        else if (!canApprove) {
            throw new common_1.ForbiddenException('Недостаточно прав для изменения статуса');
        }
        pass.status = dto.status;
        if (dto.rejectionReason)
            pass.rejectionReason = dto.rejectionReason;
        if (dto.status === 'approved') {
            pass.approvedAt = new Date().toISOString();
            pass.approverName = actor?.email || 'admin';
        }
        await pass.save();
        const statusActions = {
            approved: 'pass.approved',
            rejected: 'pass.rejected',
            cancelled: 'pass.cancelled',
        };
        const action = statusActions[dto.status];
        if (action) {
            await this.auditService.log({
                action,
                entityType: 'pass',
                entityId: pass._id,
                actor,
                details: {
                    passNumber: pass.passNumber,
                    status: dto.status,
                    rejectionReason: dto.rejectionReason,
                },
            });
        }
        return { pass: this.mapToFrontend(pass, actor) };
    }
    async checkIn(id, actor) {
        const pass = await this.passModel.findById(id);
        if (!pass)
            throw new common_1.NotFoundException('Пропуск не найден');
        if (!['pending', 'approved'].includes(pass.status)) {
            throw new common_1.BadRequestException('Пропуск нельзя впустить в текущем статусе');
        }
        if (pass.status === 'pending' && !pass.approvedAt) {
            pass.approvedAt = new Date().toISOString();
        }
        const requireCheckout = await this.getRequireCheckoutForPass(pass);
        const now = new Date().toISOString();
        pass.checkedInAt = now;
        if (requireCheckout) {
            pass.status = 'active';
        }
        else {
            pass.status = 'completed';
            pass.checkedOutAt = now;
        }
        await pass.save();
        await this.auditService.log({
            action: 'pass.check_in',
            entityType: 'pass',
            entityId: pass._id,
            actor,
            details: { passNumber: pass.passNumber, visitorName: pass.visitorName },
        });
        const [withCheckout] = await this.enrichPassCheckoutSettings([pass.toObject()]);
        return { pass: this.mapToFrontend(withCheckout) };
    }
    async checkOut(id, actor) {
        const pass = await this.passModel.findById(id);
        if (!pass)
            throw new common_1.NotFoundException('Пропуск не найден');
        pass.status = 'completed';
        pass.checkedOutAt = new Date().toISOString();
        await pass.save();
        await this.auditService.log({
            action: 'pass.check_out',
            entityType: 'pass',
            entityId: pass._id,
            actor,
            details: { passNumber: pass.passNumber, visitorName: pass.visitorName },
        });
        const [withCheckout] = await this.enrichPassCheckoutSettings([pass.toObject()]);
        return { pass: this.mapToFrontend(withCheckout) };
    }
    async getJournal(date, user, search) {
        await this.expirePastPasses();
        const targetDate = date || this.getTodayDate();
        const accessFilter = await this.buildAccessFilter(user);
        const filter = { visitDate: targetDate, ...accessFilter };
        this.appendSearchFilter(filter, search);
        const passes = await this.passModel
            .find(filter)
            .sort({ createdAt: -1 })
            .lean();
        const withCheckout = await this.enrichPassCheckoutSettings(passes);
        const enriched = await this.enrichCreatorFields(withCheckout, user);
        const mapped = enriched.map((p) => this.mapToFrontend(p, user));
        const stats = {
            total: mapped.length,
            pending: mapped.filter((p) => p.status === 'pending').length,
            active: mapped.filter((p) => p.status === 'active').length,
            completed: mapped.filter((p) => p.status === 'completed').length,
            approved: mapped.filter((p) => p.status === 'approved' || p.status === 'pending').length,
        };
        return { date: targetDate, stats, passes: mapped };
    }
    async getHistory(query, user) {
        await this.expirePastPasses();
        const accessFilter = await this.buildAccessFilter(user);
        const limit = Math.min(Math.max(parseInt(query.limit || '50', 10) || 50, 1), 200);
        const filter = { ...accessFilter };
        switch (query.scope) {
            case 'office': {
                if (!query.officeId)
                    throw new common_1.BadRequestException('Укажите officeId');
                filter.officeId = new mongoose_2.Types.ObjectId(query.officeId);
                break;
            }
            case 'company': {
                if (!query.companyName?.trim())
                    throw new common_1.BadRequestException('Укажите companyName');
                filter.companyName = new RegExp(`^${this.escapeRegex(query.companyName.trim())}$`, 'i');
                break;
            }
            case 'bc': {
                if (!query.propertyId)
                    throw new common_1.BadRequestException('Укажите propertyId');
                filter.property = new mongoose_2.Types.ObjectId(query.propertyId);
                break;
            }
            case 'visitor':
            default: {
                const or = [];
                const name = query.visitorName?.trim();
                if (name) {
                    or.push({ visitorName: new RegExp(`^${this.escapeRegex(name)}$`, 'i') });
                }
                const phone = (0, pass_helpers_1.normalizePhone)(query.visitorPhone);
                if (phone) {
                    const phonePattern = phone.replace(/(\d)/g, '[\\s\\-()]*$1');
                    or.push({ visitorPhone: new RegExp(phonePattern) });
                }
                if (query.visitorPassportNumber?.trim()) {
                    or.push({ visitorPassportNumber: new RegExp(this.escapeRegex(query.visitorPassportNumber.trim())) });
                }
                if (query.visitorPassportSeries?.trim()) {
                    or.push({ visitorPassportSeries: new RegExp(this.escapeRegex(query.visitorPassportSeries.trim()), 'i') });
                }
                if (!or.length) {
                    throw new common_1.BadRequestException('Укажите ФИО, телефон или паспортные данные');
                }
                filter.$or = or;
                break;
            }
        }
        const passes = await this.passModel
            .find(filter)
            .sort({ visitDate: -1, createdAt: -1 })
            .limit(limit)
            .lean();
        const withCheckout = await this.enrichPassCheckoutSettings(passes);
        const enriched = await this.enrichCreatorFields(withCheckout, user);
        return {
            scope: query.scope,
            total: enriched.length,
            passes: enriched.map((p) => this.mapToFrontend(p, user)),
        };
    }
    async updateVisitorData(id, dto, actor) {
        if (!actor?.role)
            throw new common_1.ForbiddenException('Недостаточно прав');
        const canEdit = await this.accessConfigService.hasPermission(actor.role, 'passes.reception')
            || await this.accessConfigService.hasPermission(actor.role, 'passes.approve')
            || await this.accessConfigService.hasPermission(actor.role, 'admin.panel');
        if (!canEdit) {
            throw new common_1.ForbiddenException('Паспортные данные может вносить только ресепшн или администратор');
        }
        const pass = await this.passModel.findById(id);
        if (!pass)
            throw new common_1.NotFoundException('Пропуск не найден');
        if (dto.visitorPassportSeries !== undefined) {
            pass.visitorPassportSeries = dto.visitorPassportSeries.trim() || undefined;
        }
        if (dto.visitorPassportNumber !== undefined) {
            pass.visitorPassportNumber = dto.visitorPassportNumber.trim() || undefined;
        }
        if (dto.visitorPassportIssuedBy !== undefined) {
            pass.visitorPassportIssuedBy = dto.visitorPassportIssuedBy.trim() || undefined;
        }
        await pass.save();
        await this.auditService.log({
            action: 'pass.visitor_data_updated',
            entityType: 'pass',
            entityId: pass._id,
            actor,
            details: {
                passNumber: pass.passNumber,
                visitorName: pass.visitorName,
                hasPassport: !!(pass.visitorPassportSeries || pass.visitorPassportNumber),
            },
        });
        return { pass: this.mapToFrontend(pass, actor) };
    }
    escapeRegex(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    async lookup(passNumber, user) {
        await this.expirePastPasses();
        const pass = await this.passModel.findOne({ passNumber }).lean();
        if (!pass)
            throw new common_1.NotFoundException('Пропуск не найден');
        const [withCheckout] = await this.enrichPassCheckoutSettings([pass]);
        const [enriched] = await this.enrichCreatorFields([withCheckout], user || { role: 'security' });
        return { pass: this.mapToFrontend(enriched, user) };
    }
    async getPublicTicket(passNumber) {
        await this.expirePastPasses();
        const pass = await this.passModel.findOne({ passNumber }).lean();
        if (!pass)
            throw new common_1.NotFoundException('Пропуск не найден');
        const [withCheckout] = await this.enrichPassCheckoutSettings([pass]);
        const businessCenterName = await this.resolveBusinessCenterName(pass);
        return { ticket: { ...this.mapToPublicTicket(withCheckout), businessCenterName } };
    }
    async getOverdueActive(user) {
        await this.expirePastPasses();
        const accessFilter = await this.buildAccessFilter(user);
        const passes = await this.passModel
            .find({ status: 'active', ...accessFilter })
            .sort({ visitDate: 1, visitTimeTo: 1 })
            .lean();
        const overdue = passes.filter((p) => this.isPassOverdueInBuilding(p));
        const withCheckout = await this.enrichPassCheckoutSettings(overdue);
        const enriched = await this.enrichCreatorFields(withCheckout, user);
        return {
            count: enriched.length,
            passes: enriched.map((p) => this.mapToFrontend(p, user)),
        };
    }
    async getStats(user) {
        await this.expirePastPasses();
        const today = this.getTodayDate();
        const accessFilter = await this.buildAccessFilter(user);
        const passes = await this.passModel.find(accessFilter).lean();
        const todayPasses = passes.filter((p) => p.visitDate === today);
        return {
            today,
            todayCount: todayPasses.length,
            weekCount: passes.length,
            byStatus: this.countBy(passes, 'status'),
            todayByType: this.countBy(todayPasses, 'passType'),
        };
    }
    async getClosedWeekdaysForProperty(propertyId) {
        if (!propertyId)
            return [];
        const property = await this.propertyModel.findById(propertyId).select('settings').lean();
        return (0, bookable_visit_dates_1.parseClosedWeekdays)(property?.settings?.closed_weekdays);
    }
    async resolveWorkingHours(propertyId, dto) {
        if (dto.visitTimeFrom && dto.visitTimeTo) {
            return { from: dto.visitTimeFrom, to: dto.visitTimeTo };
        }
        if (propertyId) {
            const property = await this.propertyModel.findById(propertyId).lean();
            const ps = property?.settings || {};
            return {
                from: dto.visitTimeFrom || ps.working_hours_from || '08:00',
                to: dto.visitTimeTo || ps.working_hours_to || '20:00',
            };
        }
        return {
            from: dto.visitTimeFrom || '08:00',
            to: dto.visitTimeTo || '20:00',
        };
    }
    async getRequireCheckoutForPass(pass) {
        if (!pass.property)
            return true;
        const property = await this.propertyModel.findById(pass.property).select('settings').lean();
        return property?.settings?.require_checkout !== 'false';
    }
    async enrichPassCheckoutSettings(docs) {
        const propertyIds = [
            ...new Set(docs.map((doc) => doc.property?.toString()).filter((id) => !!id)),
        ];
        if (!propertyIds.length)
            return docs;
        const properties = await this.propertyModel
            .find({ _id: { $in: propertyIds.map((id) => new mongoose_2.Types.ObjectId(id)) } })
            .select('settings')
            .lean();
        const checkoutMap = new Map(properties.map((p) => [p._id.toString(), p.settings?.require_checkout !== 'false']));
        return docs.map((doc) => ({
            ...doc,
            requireCheckout: doc.property
                ? checkoutMap.get(doc.property.toString()) ?? true
                : true,
        }));
    }
    async resolveOfficeFields(dto, user) {
        const tenantOwnerId = (0, tenant_owner_1.tenantOwnerObjectId)(user);
        if ((0, tenant_account_1.isTenantCompanyUser)(user)) {
            if (!tenantOwnerId) {
                throw new common_1.ForbiddenException('Заказ пропусков недоступен');
            }
            const assignedOffices = await this.officeModel.countDocuments({
                tenantId: tenantOwnerId,
                isActive: true,
            });
            if (!assignedOffices) {
                throw new common_1.ForbiddenException('Заказ пропусков недоступен: офис не назначен. Обратитесь к администратору.');
            }
            if (!dto.officeId) {
                throw new common_1.BadRequestException('Выберите офис из списка');
            }
        }
        if (dto.officeId) {
            const office = await this.officeModel.findById(dto.officeId).lean();
            if (!office || !office.isActive) {
                throw new common_1.NotFoundException('Офис не найден');
            }
            if ((0, tenant_account_1.isTenantCompanyUser)(user)) {
                const ownsOffice = office.tenantId?.toString() === tenantOwnerId?.toString();
                if (!ownsOffice) {
                    throw new common_1.ForbiddenException('Вы можете заказывать пропуска только в свои офисы');
                }
            }
            const property = await this.propertyModel.findById(office.property).lean();
            return {
                officeId: office._id,
                property: office.property,
                businessCenterName: property?.name,
                office: office.number,
                floor: office.floor,
                companyName: dto.companyName || office.company,
            };
        }
        if ((0, tenant_account_1.isTenantCompanyUser)(user)) {
            throw new common_1.BadRequestException('Выберите офис из списка');
        }
        if (!dto.office?.trim()) {
            throw new common_1.BadRequestException('Укажите офис из реестра');
        }
        const officeNumber = dto.office.trim();
        const office = await this.officeModel.findOne({ number: officeNumber, isActive: true }).lean();
        if (office) {
            const property = await this.propertyModel.findById(office.property).lean();
            return {
                officeId: office._id,
                property: office.property,
                businessCenterName: property?.name,
                office: office.number,
                floor: dto.floor || office.floor,
                companyName: dto.companyName || office.company,
            };
        }
        const defaultProperty = await this.getDefaultBusinessCenter();
        return {
            office: officeNumber,
            floor: dto.floor,
            property: defaultProperty?._id,
            businessCenterName: defaultProperty?.name,
        };
    }
    async getDefaultBusinessCenter() {
        return this.propertyModel
            .findOne({ type: enums_1.PropertyType.BUSINESS_CENTER, isActive: true })
            .sort({ createdAt: 1 })
            .lean();
    }
    async resolveBusinessCenterName(doc) {
        if (doc.businessCenterName)
            return doc.businessCenterName;
        if (doc.property) {
            const property = await this.propertyModel.findById(doc.property).lean();
            if (property?.name)
                return property.name;
        }
        if (doc.officeId) {
            const office = await this.officeModel.findById(doc.officeId).lean();
            if (office?.property) {
                const property = await this.propertyModel.findById(office.property).lean();
                if (property?.name)
                    return property.name;
            }
        }
        if (doc.office) {
            const office = await this.officeModel.findOne({ number: String(doc.office), isActive: true }).lean();
            if (office?.property) {
                const property = await this.propertyModel.findById(office.property).lean();
                if (property?.name)
                    return property.name;
            }
        }
        const defaultProperty = await this.getDefaultBusinessCenter();
        return defaultProperty?.name;
    }
    async ensurePassAccess(pass, user) {
        if (!user?.role)
            throw new common_1.ForbiddenException('Нет доступа к этому пропуску');
        if ((0, tenant_account_1.isTenantCompanyUser)(user)) {
            const teamIds = await this.getTenantTeamIds(user);
            const createdBy = pass.createdBy?.toString();
            const hasAccess = teamIds.some((id) => id.toString() === createdBy);
            if (!hasAccess)
                throw new common_1.ForbiddenException('Нет доступа к этому пропуску');
            if (user.parentTenantId && createdBy !== user.userId) {
                throw new common_1.ForbiddenException('Нет доступа к этому пропуску');
            }
            return;
        }
        if (await this.accessConfigService.canViewAllPasses(user.role, user.parentTenantId))
            return;
        const isCreator = pass.createdBy?.toString() === user.userId;
        if (isCreator && await this.accessConfigService.hasPermission(user.role, 'passes.view_own'))
            return;
        throw new common_1.ForbiddenException('Нет доступа к этому пропуску');
    }
    countBy(arr, key) {
        return arr.reduce((acc, item) => {
            const val = item[key] || 'unknown';
            acc[val] = (acc[val] || 0) + 1;
            return acc;
        }, {});
    }
    mapToPublicTicket(doc) {
        return {
            passNumber: doc.passNumber,
            visitorName: doc.visitorName,
            companyName: doc.companyName,
            visitPurpose: doc.visitPurpose,
            passType: doc.passType,
            vehiclePlate: doc.vehiclePlate,
            visitDate: doc.visitDate,
            visitTimeFrom: doc.visitTimeFrom,
            visitTimeTo: doc.visitTimeTo,
            businessCenterName: doc.businessCenterName,
            office: doc.office,
            floor: doc.floor,
            status: doc.status,
            createdAt: doc.createdAt,
            approvedAt: doc.approvedAt,
            checkedInAt: doc.checkedInAt,
            checkedOutAt: doc.checkedOutAt,
            rejectionReason: doc.rejectionReason,
            requireCheckout: doc.requireCheckout !== false,
        };
    }
    async enrichCreatorFields(docs, viewer) {
        if (!docs.length || (0, tenant_account_1.isTenantCompanyUser)(viewer))
            return docs;
        const creatorIds = [
            ...new Set(docs
                .map((doc) => doc.createdBy?.toString())
                .filter((id) => !!id)),
        ];
        if (!creatorIds.length)
            return docs;
        const creators = await this.userModel
            .find({ _id: { $in: creatorIds.map((id) => new mongoose_2.Types.ObjectId(id)) } })
            .select('fullName phone company')
            .lean();
        const creatorMap = new Map(creators.map((u) => [u._id.toString(), u]));
        return docs.map((doc) => {
            const creator = doc.createdBy ? creatorMap.get(doc.createdBy.toString()) : null;
            if (!creator)
                return doc;
            return {
                ...doc,
                creatorName: doc.creatorName || creator.fullName,
                creatorPhone: doc.creatorPhone || creator.phone,
                creatorCompany: doc.creatorCompany || creator.company,
            };
        });
    }
    mapToFrontend(doc, user) {
        const isTenant = (0, tenant_account_1.isTenantCompanyUser)(user);
        const isOwner = !!user?.userId && doc.createdBy?.toString() === user.userId;
        return {
            id: doc._id.toString(),
            passNumber: doc.passNumber,
            isOwner,
            createdBy: isOwner || !isTenant ? doc.createdBy?.toString() || '' : '',
            creatorName: isTenant ? undefined : doc.creatorName,
            creatorCompany: isTenant ? undefined : doc.creatorCompany,
            creatorPhone: isTenant ? undefined : doc.creatorPhone,
            visitorName: doc.visitorName,
            visitorPhone: doc.visitorPhone,
            visitorPassportSeries: doc.visitorPassportSeries,
            visitorPassportNumber: doc.visitorPassportNumber,
            visitorPassportIssuedBy: doc.visitorPassportIssuedBy,
            companyName: doc.companyName,
            visitPurpose: doc.visitPurpose,
            passType: doc.passType,
            vehiclePlate: doc.vehiclePlate,
            vehicleModel: doc.vehicleModel,
            visitDate: doc.visitDate,
            visitTimeFrom: doc.visitTimeFrom,
            visitTimeTo: doc.visitTimeTo,
            propertyId: doc.property?.toString(),
            officeId: doc.officeId?.toString(),
            businessCenterName: doc.businessCenterName,
            office: doc.office,
            floor: doc.floor,
            comment: doc.comment,
            status: doc.status,
            approvedBy: doc.approvedBy,
            approverName: doc.approverName,
            approvedAt: doc.approvedAt,
            rejectionReason: doc.rejectionReason,
            checkedInAt: doc.checkedInAt,
            checkedInBy: doc.checkedInBy,
            checkerInName: doc.checkerInName,
            checkedOutAt: doc.checkedOutAt,
            checkedOutBy: doc.checkedOutBy,
            checkerOutName: doc.checkerOutName,
            requireCheckout: doc.requireCheckout !== false,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
        };
    }
};
exports.PassesService = PassesService;
exports.PassesService = PassesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(schemas_1.Pass.name)),
    __param(1, (0, mongoose_1.InjectModel)(schemas_1.Office.name)),
    __param(2, (0, mongoose_1.InjectModel)(schemas_1.Property.name)),
    __param(3, (0, mongoose_1.InjectModel)(schemas_1.User.name, auth_database_constants_1.AUTH_CONNECTION)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        access_config_service_1.AccessConfigService,
        pass_templates_service_1.PassTemplatesService,
        audit_service_1.AuditService,
        mail_service_1.MailService,
        config_1.ConfigService])
], PassesService);
//# sourceMappingURL=passes.service.js.map