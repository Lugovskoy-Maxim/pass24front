"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const person_name_1 = require("../common/person-name");
const profile_change_1 = require("../common/profile-change");
const mongoose_1 = require("@nestjs/mongoose");
const bcrypt = __importStar(require("bcryptjs"));
const mongoose_2 = require("mongoose");
const audit_service_1 = require("../audit/audit.service");
const passes_service_1 = require("../passes/passes.service");
const schemas_1 = require("../schemas");
const auth_database_constants_1 = require("../database/auth-database.constants");
const enums_1 = require("../schemas/enums");
const test_data_seed_service_1 = require("../database/test-data-seed.service");
const STAFF_ROLES = ['security', 'bc_admin', 'admin'];
let AdminService = class AdminService {
    userModel;
    propertyModel;
    officeModel;
    passModel;
    passTemplateModel;
    auditService;
    passesService;
    testDataSeedService;
    constructor(userModel, propertyModel, officeModel, passModel, passTemplateModel, auditService, passesService, testDataSeedService) {
        this.userModel = userModel;
        this.propertyModel = propertyModel;
        this.officeModel = officeModel;
        this.passModel = passModel;
        this.passTemplateModel = passTemplateModel;
        this.auditService = auditService;
        this.passesService = passesService;
        this.testDataSeedService = testDataSeedService;
    }
    async dashboard() {
        await this.passesService.expirePastPasses();
        const [users, passes, properties, offices] = await Promise.all([
            this.userModel.find().lean(),
            this.passModel.find().lean(),
            this.propertyModel.find({ type: enums_1.PropertyType.BUSINESS_CENTER, isActive: true }).lean(),
            this.officeModel.find({ isActive: true }).lean(),
        ]);
        const today = new Date().toISOString().slice(0, 10);
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
        const todayPasses = passes.filter((p) => p.visitDate === today);
        const weekPasses = passes.filter((p) => p.visitDate >= weekAgo);
        const recentActivity = await this.auditService.getRecent(10);
        return {
            stats: {
                users: {
                    total: users.length,
                    byRole: this.countBy(users, 'role'),
                },
                passes: {
                    total: passes.length,
                    today: todayPasses.length,
                    week: weekPasses.length,
                    byStatus: this.countBy(passes, 'status'),
                },
                businessCenters: properties.length,
            },
            recentActivity,
            businessCenterNames: properties.map((p) => p.name),
            officesCount: offices.length,
        };
    }
    getAudit(query = {}) {
        return this.auditService.getAudit(query);
    }
    exportAuditCsv(query = {}) {
        return this.auditService.exportCsv(query);
    }
    async getUsers(params = {}) {
        const filter = await this.buildUserFilter(params);
        const tenantCountFilter = await this.buildUserFilter({ ...params, category: 'tenants', role: undefined });
        const staffCountFilter = await this.buildUserFilter({ ...params, category: 'staff', role: undefined });
        const [users, total, counts] = await Promise.all([
            this.userModel.find(filter).sort({ createdAt: -1 }).lean(),
            this.userModel.countDocuments(filter),
            Promise.all([
                this.userModel.countDocuments(tenantCountFilter),
                this.userModel.countDocuments(staffCountFilter),
            ]).then(([tenants, staff]) => ({ tenants, staff })),
        ]);
        const passCounts = await this.passModel.aggregate([
            { $group: { _id: '$createdBy', count: { $sum: 1 } } },
        ]);
        const countMap = new Map(passCounts.map((p) => [p._id?.toString(), p.count]));
        const officeLinks = await this.officeModel.find({ tenantId: { $in: users.map((u) => u._id) } }).lean();
        const officesByTenant = officeLinks.reduce((acc, office) => {
            const key = office.tenantId?.toString();
            if (!key)
                return acc;
            if (!acc[key])
                acc[key] = [];
            acc[key].push(office);
            return acc;
        }, {});
        const propertyIds = [
            ...new Set(users.flatMap((u) => (u.properties || []).map((p) => p.toString()))),
        ];
        const properties = propertyIds.length
            ? await this.propertyModel.find({ _id: { $in: propertyIds } }).lean()
            : [];
        const propertyMap = new Map(properties.map((p) => [p._id.toString(), p]));
        const propertyMapByOffice = new Map();
        const officePropertyIds = [...new Set(officeLinks.map((o) => o.property.toString()))];
        const officeProperties = officePropertyIds.length
            ? await this.propertyModel.find({ _id: { $in: officePropertyIds } }).lean()
            : [];
        officeProperties.forEach((p) => propertyMapByOffice.set(p._id.toString(), p));
        return {
            users: users.map((u) => {
                const tenantOffices = (officesByTenant[u._id.toString()] || []).map((o) => this.mapOffice(o, propertyMapByOffice, new Map()));
                const businessCenters = (u.properties || []).map((pid) => ({
                    id: pid.toString(),
                    name: propertyMap.get(pid.toString())?.name || 'БЦ',
                }));
                return this.mapUser(u, countMap.get(u._id.toString()) || 0, tenantOffices, businessCenters);
            }),
            total,
            counts,
        };
    }
    async buildUserFilter(params) {
        const filter = {};
        if (params.category === 'tenants') {
            filter.role = 'tenant';
        }
        else if (params.category === 'staff') {
            if (params.role && STAFF_ROLES.includes(params.role)) {
                filter.role = params.role;
            }
            else {
                filter.role = { $in: [...STAFF_ROLES] };
            }
        }
        else if (params.role) {
            filter.role = params.role;
        }
        if (params.isActive === 'true')
            filter.isActive = true;
        if (params.isActive === 'false')
            filter.isActive = false;
        if (params.search?.trim()) {
            const rx = new RegExp(params.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filter.$or = [{ fullName: rx }, { email: rx }, { company: rx }, { office: rx }];
        }
        const isStaffCategory = params.category === 'staff' || (params.role && params.role !== 'tenant' && !params.category);
        if (params.officeId?.trim()) {
            const office = await this.officeModel.findById(params.officeId.trim()).lean();
            if (office?.tenantId) {
                filter._id = office.tenantId;
                filter.role = 'tenant';
            }
            else {
                filter._id = { $in: [] };
            }
        }
        else if (params.propertyId?.trim()) {
            const propertyObjectId = new mongoose_2.Types.ObjectId(params.propertyId.trim());
            if (isStaffCategory) {
                filter.properties = propertyObjectId;
            }
            else {
                const tenantIds = await this.officeModel.distinct('tenantId', {
                    property: propertyObjectId,
                    tenantId: { $exists: true, $ne: null },
                });
                filter._id = { $in: tenantIds };
                filter.role = 'tenant';
            }
        }
        return filter;
    }
    async createUser(dto, actor) {
        const email = dto.email.toLowerCase();
        const existing = await this.userModel.findOne({ email });
        if (existing)
            throw new common_1.ConflictException('Пользователь с таким email уже существует');
        const hashed = await bcrypt.hash(dto.password, 10);
        let personName;
        try {
            personName = (0, person_name_1.resolvePersonName)(dto);
        }
        catch {
            throw new common_1.BadRequestException('Укажите фамилию и имя');
        }
        const user = await this.userModel.create({
            email,
            fullName: personName.fullName,
            lastName: personName.lastName,
            firstName: personName.firstName,
            middleName: personName.middleName,
            phone: dto.phone,
            company: dto.company,
            role: dto.role,
            office: dto.office,
            floor: dto.floor,
            password: hashed,
            isActive: true,
        });
        if (dto.role === 'tenant' && dto.officeIds !== undefined) {
            await this.assignOfficesToTenant(user._id.toString(), dto.officeIds);
        }
        if ((dto.role === 'security' || dto.role === 'bc_admin') && dto.propertyIds !== undefined) {
            user.properties = dto.propertyIds.map((pid) => new mongoose_2.Types.ObjectId(pid));
            await user.save();
        }
        const offices = await this.getTenantOffices(user._id.toString());
        const businessCenters = await this.getUserBusinessCenters(user);
        await this.auditService.log({
            action: 'user.create',
            entityType: 'user',
            entityId: user._id,
            actor,
            details: { email: user.email, role: user.role, fullName: user.fullName },
        });
        return { user: this.mapUser(user.toObject(), 0, offices, businessCenters) };
    }
    async getRegistrationRequests() {
        const users = await this.userModel
            .find({ role: 'tenant', isActive: false })
            .sort({ createdAt: -1 })
            .lean();
        return {
            requests: users.map((user) => this.mapUser(user, 0, [], [])),
        };
    }
    async approveRegistration(id, actor) {
        const user = await this.userModel.findById(id);
        if (!user)
            throw new common_1.NotFoundException('Пользователь не найден');
        if (user.role !== 'tenant') {
            throw new common_1.BadRequestException('Подтверждение доступно только для арендаторов');
        }
        if (user.isActive) {
            throw new common_1.BadRequestException('Учётная запись уже активирована');
        }
        user.isActive = true;
        await user.save();
        await this.auditService.log({
            action: 'user.registration_approved',
            entityType: 'user',
            entityId: user._id,
            actor,
            details: { email: user.email, fullName: user.fullName, company: user.company },
        });
        const offices = await this.getTenantOffices(id);
        return { user: this.mapUser(user.toObject(), 0, offices, []) };
    }
    async rejectRegistration(id, actor) {
        const user = await this.userModel.findById(id);
        if (!user)
            throw new common_1.NotFoundException('Пользователь не найден');
        if (user.role !== 'tenant') {
            throw new common_1.BadRequestException('Отклонение доступно только для арендаторов');
        }
        if (user.isActive) {
            throw new common_1.BadRequestException('Нельзя отклонить уже активированную учётную запись');
        }
        await this.auditService.log({
            action: 'user.registration_rejected',
            entityType: 'user',
            entityId: user._id,
            actor,
            details: { email: user.email, fullName: user.fullName, company: user.company },
        });
        await this.userModel.deleteOne({ _id: user._id });
        return { message: 'Заявка на регистрацию отклонена' };
    }
    async getProfileChangeRequests() {
        const users = await this.userModel
            .find({ role: 'tenant', 'profileChangeRequest.requestedAt': { $exists: true, $ne: null } })
            .sort({ 'profileChangeRequest.requestedAt': -1 })
            .lean();
        const items = await Promise.all(users.map(async (user) => {
            const offices = await this.getTenantOffices(user._id.toString());
            return {
                user: this.mapUser(user, 0, offices, []),
                request: (0, profile_change_1.mapProfileChangeRequest)(user.profileChangeRequest),
            };
        }));
        return { requests: items.filter((item) => item.request) };
    }
    async approveProfileChange(id, actor) {
        const user = await this.userModel.findById(id);
        if (!user)
            throw new common_1.NotFoundException('Пользователь не найден');
        if (!user.profileChangeRequest?.requestedAt) {
            throw new common_1.BadRequestException('Нет заявки на изменение профиля');
        }
        const req = user.profileChangeRequest;
        user.lastName = req.lastName;
        user.firstName = req.firstName;
        user.middleName = req.middleName;
        user.fullName = req.fullName;
        if (req.phone !== undefined)
            user.phone = req.phone;
        if (req.company !== undefined)
            user.company = req.company;
        user.profileChangeRequest = null;
        user.markModified('profileChangeRequest');
        await user.save();
        await this.auditService.log({
            action: 'profile.change_approved',
            entityType: 'user',
            entityId: user._id,
            actor,
            details: { fullName: user.fullName, email: user.email },
        });
        const offices = await this.getTenantOffices(id);
        return { user: this.mapUser(user.toObject(), 0, offices, []) };
    }
    async rejectProfileChange(id, actor) {
        const user = await this.userModel.findById(id);
        if (!user)
            throw new common_1.NotFoundException('Пользователь не найден');
        if (!user.profileChangeRequest?.requestedAt) {
            throw new common_1.BadRequestException('Нет заявки на изменение профиля');
        }
        const requestedName = user.profileChangeRequest.fullName;
        user.profileChangeRequest = null;
        user.markModified('profileChangeRequest');
        await user.save();
        await this.auditService.log({
            action: 'profile.change_rejected',
            entityType: 'user',
            entityId: user._id,
            actor,
            details: { fullName: requestedName, email: user.email },
        });
        const offices = await this.getTenantOffices(id);
        return { user: this.mapUser(user.toObject(), 0, offices, []) };
    }
    async updateUser(id, dto, actor) {
        const user = await this.userModel.findById(id);
        if (!user)
            throw new common_1.NotFoundException('Пользователь не найден');
        const prevRole = user.role;
        if (dto.fullName !== undefined || dto.lastName !== undefined || dto.firstName !== undefined || dto.middleName !== undefined) {
            try {
                const personName = (0, person_name_1.resolvePersonName)({
                    fullName: dto.fullName ?? user.fullName,
                    lastName: dto.lastName ?? user.lastName,
                    firstName: dto.firstName ?? user.firstName,
                    middleName: dto.middleName ?? user.middleName,
                });
                user.fullName = personName.fullName;
                user.lastName = personName.lastName;
                user.firstName = personName.firstName;
                user.middleName = personName.middleName;
            }
            catch {
                throw new common_1.BadRequestException('Укажите фамилию и имя');
            }
        }
        if (dto.phone !== undefined)
            user.phone = dto.phone;
        if (dto.company !== undefined)
            user.company = dto.company;
        if (dto.role !== undefined)
            user.role = dto.role;
        if (dto.office !== undefined)
            user.office = dto.office;
        if (dto.floor !== undefined)
            user.floor = dto.floor;
        if (dto.isActive !== undefined)
            user.isActive = dto.isActive;
        if (dto.password)
            user.password = await bcrypt.hash(dto.password, 10);
        if (dto.role && dto.role !== 'tenant' && prevRole === 'tenant') {
            await this.assignOfficesToTenant(id, []);
        }
        if (dto.role && !['security', 'bc_admin'].includes(dto.role) && ['security', 'bc_admin'].includes(prevRole)) {
            user.properties = [];
        }
        if (dto.role === 'tenant' && prevRole !== 'tenant') {
            user.properties = [];
        }
        if (dto.propertyIds !== undefined && ['security', 'bc_admin'].includes(user.role)) {
            user.properties = dto.propertyIds.map((pid) => new mongoose_2.Types.ObjectId(pid));
        }
        await user.save();
        if (dto.officeIds !== undefined && user.role === 'tenant') {
            await this.assignOfficesToTenant(id, dto.officeIds);
        }
        const offices = await this.getTenantOffices(id);
        const passesCount = await this.passModel.countDocuments({ createdBy: user._id });
        const businessCenters = await this.getUserBusinessCenters(user);
        await this.auditService.log({
            action: 'user.update',
            entityType: 'user',
            entityId: user._id,
            actor,
            details: { email: user.email, role: user.role, isActive: user.isActive },
        });
        return { user: this.mapUser(user.toObject(), passesCount, offices, businessCenters) };
    }
    async updateBusinessCenter(id, dto, actor) {
        const property = await this.propertyModel.findById(id);
        if (!property)
            throw new common_1.NotFoundException('Бизнес-центр не найден');
        await this.ensureBcAccess(property._id.toString(), actor);
        if (dto.name?.trim())
            property.name = dto.name.trim();
        if (dto.address?.trim())
            property.address = dto.address.trim();
        if (dto.passSettings) {
            property.settings = this.mergeBcPassSettings(property.settings, dto.passSettings);
            property.markModified('settings');
        }
        await property.save();
        const stats = await this.officeModel.aggregate([
            { $match: { property: property._id, isActive: true } },
            { $group: { _id: '$property', count: { $sum: 1 }, totalAreaSqm: { $sum: { $ifNull: ['$areaSqm', 0] } } } },
        ]);
        await this.auditService.log({
            action: 'bc.update',
            entityType: 'business_center',
            entityId: property._id,
            actor,
            details: { name: property.name, address: property.address },
        });
        return {
            businessCenter: {
                id: property._id.toString(),
                name: property.name,
                address: property.address,
                officesCount: stats[0]?.count || 0,
                totalAreaSqm: stats[0]?.totalAreaSqm || 0,
                isActive: property.isActive,
                createdAt: property.createdAt,
                passSettings: this.mapBcPassSettings(property.toObject()),
            },
        };
    }
    async getBusinessCenters(actor) {
        const filter = { type: enums_1.PropertyType.BUSINESS_CENTER };
        const scope = await this.getActorPropertyIds(actor);
        if (scope?.length)
            filter._id = { $in: scope.map((id) => new mongoose_2.Types.ObjectId(id)) };
        const properties = await this.propertyModel
            .find(filter)
            .sort({ name: 1 })
            .lean();
        const officeStats = await this.officeModel.aggregate([
            { $match: { isActive: true } },
            {
                $group: {
                    _id: '$property',
                    count: { $sum: 1 },
                    totalAreaSqm: { $sum: { $ifNull: ['$areaSqm', 0] } },
                },
            },
        ]);
        const statsMap = new Map(officeStats.map((s) => [s._id.toString(), s]));
        return {
            businessCenters: properties.map((p) => {
                const stats = statsMap.get(p._id.toString());
                return {
                    id: p._id.toString(),
                    name: p.name,
                    address: p.address,
                    officesCount: stats?.count || 0,
                    totalAreaSqm: stats?.totalAreaSqm || 0,
                    isActive: p.isActive,
                    createdAt: p.createdAt,
                    passSettings: this.mapBcPassSettings(p),
                };
            }),
        };
    }
    async deleteBusinessCenter(id, actor) {
        const property = await this.propertyModel.findById(id);
        if (!property || property.type !== enums_1.PropertyType.BUSINESS_CENTER) {
            throw new common_1.NotFoundException('Бизнес-центр не найден');
        }
        await this.ensureBcAccess(property._id.toString(), actor);
        const propertyId = property._id;
        const [officesCount, passesCount, usersCount] = await Promise.all([
            this.officeModel.countDocuments({ property: propertyId }),
            this.passModel.countDocuments({ property: propertyId }),
            this.userModel.countDocuments({ properties: propertyId }),
        ]);
        if (officesCount > 0) {
            throw new common_1.BadRequestException(`Нельзя удалить БЦ: в нём ${officesCount} офис(ов). Сначала удалите или перенесите офисы.`);
        }
        if (passesCount > 0) {
            throw new common_1.BadRequestException(`Нельзя удалить БЦ: есть ${passesCount} пропуск(ов), привязанных к этому объекту.`);
        }
        if (usersCount > 0) {
            throw new common_1.BadRequestException(`Нельзя удалить БЦ: ${usersCount} пользователь(ей) привязаны к этому объекту.`);
        }
        await this.propertyModel.deleteOne({ _id: propertyId });
        await this.auditService.log({
            action: 'bc.delete',
            entityType: 'business_center',
            entityId: propertyId,
            actor,
            details: { name: property.name, address: property.address },
        });
        return { message: 'Бизнес-центр удалён', id: property._id.toString() };
    }
    async createBusinessCenter(dto, actor) {
        const property = await this.propertyModel.create({
            name: dto.name.trim(),
            address: dto.address.trim(),
            code: dto.code?.trim(),
            type: enums_1.PropertyType.BUSINESS_CENTER,
            isActive: true,
            settings: {},
            gates: ['Главный вход'],
        });
        await this.auditService.log({
            action: 'bc.create',
            entityType: 'business_center',
            entityId: property._id,
            actor,
            details: { name: property.name, address: property.address },
        });
        return {
            businessCenter: {
                id: property._id.toString(),
                name: property.name,
                address: property.address,
                officesCount: 0,
                isActive: true,
                createdAt: property.createdAt,
                passSettings: this.mapBcPassSettings(property.toObject()),
            },
        };
    }
    async exportOfficesCsv() {
        const { offices } = await this.getOffices();
        const { buildOfficeCsv } = await import('../common/office-csv.js');
        const tenantIds = offices.filter((o) => o.tenantId).map((o) => new mongoose_2.Types.ObjectId(o.tenantId));
        const tenants = tenantIds.length
            ? await this.userModel.find({ _id: { $in: tenantIds } }).lean()
            : [];
        const tenantEmailMap = new Map(tenants.map((t) => [t._id.toString(), t.email || '']));
        return buildOfficeCsv(offices.map((office) => ({
            businessCenterName: office.businessCenterName || '',
            number: office.number,
            floor: office.floor,
            areaSqm: office.areaSqm,
            company: office.company,
            tenantEmail: office.tenantId ? tenantEmailMap.get(office.tenantId) : undefined,
            isActive: office.isActive,
        })));
    }
    async importOfficesCsv(csv, actor) {
        const { parseOfficeCsv } = await import('../common/office-csv.js');
        const parsed = parseOfficeCsv(csv);
        if (!parsed.rows.length && parsed.errors.length) {
            throw new common_1.BadRequestException(parsed.errors.join('; '));
        }
        const properties = await this.propertyModel.find({ isActive: true }).lean();
        const propertyByName = new Map(properties.map((p) => [p.name.trim().toLowerCase(), p]));
        const tenantEmails = [...new Set(parsed.rows.map((r) => r.tenantEmail).filter(Boolean))];
        const tenants = tenantEmails.length
            ? await this.userModel.find({ email: { $in: tenantEmails } }).lean()
            : [];
        const tenantByEmail = new Map(tenants.map((t) => [t.email.toLowerCase(), t]));
        const result = {
            created: 0,
            skipped: 0,
            errors: [...parsed.errors],
        };
        for (const [index, row] of parsed.rows.entries()) {
            const rowNum = index + 2;
            const property = propertyByName.get(row.businessCenter.toLowerCase());
            if (!property) {
                result.errors.push(`Строка ${rowNum}: БЦ «${row.businessCenter}» не найден`);
                continue;
            }
            const existing = await this.officeModel.findOne({
                property: property._id,
                number: row.number.trim(),
            });
            if (existing) {
                result.skipped += 1;
                continue;
            }
            let tenantId;
            if (row.tenantEmail) {
                const tenant = tenantByEmail.get(row.tenantEmail);
                if (!tenant) {
                    result.errors.push(`Строка ${rowNum}: арендатор ${row.tenantEmail} не найден`);
                    continue;
                }
                tenantId = tenant._id;
            }
            const office = await this.officeModel.create({
                property: property._id,
                number: row.number.trim(),
                floor: row.floor,
                areaSqm: row.areaSqm,
                company: row.company,
                tenantId,
                isActive: row.isActive,
            });
            if (tenantId) {
                await this.syncTenantProperties(tenantId.toString());
            }
            await this.auditService.log({
                action: 'office.import',
                entityType: 'office',
                entityId: office._id,
                actor,
                details: { number: office.number, propertyId: property._id.toString(), source: 'csv' },
            });
            result.created += 1;
        }
        return result;
    }
    async getOffices() {
        const offices = await this.officeModel.find().sort({ createdAt: -1 }).lean();
        const propertyIds = [...new Set(offices.map((o) => o.property.toString()))];
        const tenantIds = [...new Set(offices.filter((o) => o.tenantId).map((o) => o.tenantId.toString()))];
        const [properties, tenants] = await Promise.all([
            this.propertyModel.find({ _id: { $in: propertyIds } }).lean(),
            this.userModel.find({ _id: { $in: tenantIds } }).lean(),
        ]);
        const propertyMap = new Map(properties.map((p) => [p._id.toString(), p]));
        const tenantMap = new Map(tenants.map((t) => [t._id.toString(), t]));
        return {
            offices: offices.map((o) => this.mapOffice(o, propertyMap, tenantMap)),
        };
    }
    async createOffice(dto, actor) {
        const property = await this.propertyModel.findById(dto.propertyId);
        if (!property)
            throw new common_1.NotFoundException('Бизнес-центр не найден');
        const existing = await this.officeModel.findOne({
            property: dto.propertyId,
            number: dto.number.trim(),
        });
        if (existing)
            throw new common_1.ConflictException('Офис с таким номером уже есть в этом БЦ');
        const office = await this.officeModel.create({
            property: new mongoose_2.Types.ObjectId(dto.propertyId),
            number: dto.number.trim(),
            floor: dto.floor?.trim() || undefined,
            areaSqm: dto.areaSqm,
            company: dto.company?.trim(),
            tenantId: dto.tenantId ? new mongoose_2.Types.ObjectId(dto.tenantId) : undefined,
            isActive: true,
        });
        if (dto.tenantId) {
            await this.syncTenantProperties(dto.tenantId);
        }
        const propertyMap = new Map([[property._id.toString(), property]]);
        const tenant = dto.tenantId ? await this.userModel.findById(dto.tenantId).lean() : null;
        const tenantMap = tenant ? new Map([[tenant._id.toString(), tenant]]) : new Map();
        await this.auditService.log({
            action: 'office.create',
            entityType: 'office',
            entityId: office._id,
            actor,
            details: { number: office.number, floor: office.floor, propertyId: dto.propertyId },
        });
        return { office: this.mapOffice(office.toObject(), propertyMap, tenantMap) };
    }
    async updateOffice(id, dto, actor) {
        const office = await this.officeModel.findById(id);
        if (!office)
            throw new common_1.NotFoundException('Офис не найден');
        const prevTenantId = office.tenantId?.toString();
        if (dto.company !== undefined)
            office.company = dto.company?.trim();
        if (dto.areaSqm !== undefined)
            office.areaSqm = dto.areaSqm;
        if (dto.isActive !== undefined)
            office.isActive = dto.isActive;
        if (dto.tenantId !== undefined) {
            office.tenantId = dto.tenantId ? new mongoose_2.Types.ObjectId(dto.tenantId) : undefined;
        }
        await office.save();
        if (prevTenantId)
            await this.syncTenantProperties(prevTenantId);
        if (office.tenantId)
            await this.syncTenantProperties(office.tenantId.toString());
        const property = await this.propertyModel.findById(office.property).lean();
        const tenant = office.tenantId ? await this.userModel.findById(office.tenantId).lean() : null;
        const propertyMap = property ? new Map([[property._id.toString(), property]]) : new Map();
        const tenantMap = tenant ? new Map([[tenant._id.toString(), tenant]]) : new Map();
        await this.auditService.log({
            action: 'office.update',
            entityType: 'office',
            entityId: office._id,
            actor,
            details: { number: office.number, isActive: office.isActive },
        });
        return { office: this.mapOffice(office.toObject(), propertyMap, tenantMap) };
    }
    async deleteOffice(id, actor) {
        const office = await this.officeModel.findById(id);
        if (!office)
            throw new common_1.NotFoundException('Офис не найден');
        const officeObjectId = office._id;
        const [passesCount, templatesCount] = await Promise.all([
            this.passModel.countDocuments({ officeId: officeObjectId }),
            this.passTemplateModel.countDocuments({ officeId: officeObjectId }),
        ]);
        if (passesCount > 0) {
            throw new common_1.BadRequestException(`Нельзя удалить офис: есть ${passesCount} пропуск(ов), привязанных к этому офису.`);
        }
        if (templatesCount > 0) {
            throw new common_1.BadRequestException(`Нельзя удалить офис: есть ${templatesCount} шаблон(ов) пропусков для этого офиса.`);
        }
        const prevTenantId = office.tenantId?.toString();
        const property = await this.propertyModel.findById(office.property).lean();
        await this.officeModel.deleteOne({ _id: officeObjectId });
        if (prevTenantId) {
            await this.syncTenantProperties(prevTenantId);
        }
        await this.auditService.log({
            action: 'office.delete',
            entityType: 'office',
            entityId: officeObjectId,
            actor,
            details: {
                number: office.number,
                floor: office.floor,
                propertyId: office.property.toString(),
                businessCenterName: property?.name,
            },
        });
        return { message: 'Офис удалён', id: office._id.toString() };
    }
    async seedTestData() {
        const result = await this.testDataSeedService.seedTestData();
        return {
            ...result,
            tenants: result.users,
        };
    }
    async getTenantOffices(tenantId) {
        const offices = await this.officeModel
            .find({ tenantId: new mongoose_2.Types.ObjectId(tenantId), isActive: true })
            .sort({ number: 1 })
            .lean();
        const propertyIds = [...new Set(offices.map((o) => o.property.toString()))];
        const properties = await this.propertyModel.find({ _id: { $in: propertyIds } }).lean();
        const propertyMap = new Map(properties.map((p) => [p._id.toString(), p]));
        return offices.map((o) => this.mapOffice(o, propertyMap, new Map()));
    }
    async assignOfficesToTenant(tenantId, officeIds) {
        await this.officeModel.updateMany({ tenantId: new mongoose_2.Types.ObjectId(tenantId) }, { $unset: { tenantId: 1 } });
        if (officeIds.length) {
            await this.officeModel.updateMany({ _id: { $in: officeIds.map((id) => new mongoose_2.Types.ObjectId(id)) } }, { $set: { tenantId: new mongoose_2.Types.ObjectId(tenantId) } });
        }
        await this.syncTenantProperties(tenantId);
    }
    async syncTenantProperties(tenantId) {
        const offices = await this.officeModel.find({ tenantId: new mongoose_2.Types.ObjectId(tenantId), isActive: true }).lean();
        const propertyIds = [...new Set(offices.map((o) => o.property.toString()))];
        const primary = offices[0];
        await this.userModel.findByIdAndUpdate(tenantId, {
            properties: propertyIds.map((id) => new mongoose_2.Types.ObjectId(id)),
            ...(primary
                ? { office: primary.number, floor: primary.floor, company: primary.company }
                : {}),
        });
    }
    mapOffice(office, propertyMap, tenantMap) {
        const property = propertyMap.get(office.property?.toString());
        const tenant = office.tenantId ? tenantMap.get(office.tenantId.toString()) : null;
        return {
            id: office._id.toString(),
            propertyId: office.property?.toString(),
            businessCenterName: property?.name,
            number: office.number,
            floor: office.floor || undefined,
            areaSqm: office.areaSqm,
            company: office.company,
            tenantId: office.tenantId?.toString(),
            tenantName: tenant?.fullName,
            isActive: office.isActive,
            createdAt: office.createdAt,
        };
    }
    async getUserBusinessCenters(user) {
        if (!user.properties?.length)
            return [];
        const properties = await this.propertyModel.find({ _id: { $in: user.properties } }).lean();
        return properties.map((p) => ({ id: p._id.toString(), name: p.name }));
    }
    mapUser(user, passesCount, offices = [], businessCenters = []) {
        const nameParts = user.lastName || user.firstName
            ? { lastName: user.lastName || '', firstName: user.firstName || '', middleName: user.middleName || '' }
            : (0, person_name_1.splitFullName)(user.fullName);
        return {
            id: user._id.toString(),
            email: user.email,
            fullName: user.fullName,
            lastName: nameParts.lastName,
            firstName: nameParts.firstName,
            middleName: nameParts.middleName,
            phone: user.phone,
            company: user.company,
            role: user.role || 'tenant',
            office: user.office,
            floor: user.floor,
            isActive: user.isActive !== false,
            createdAt: user.createdAt,
            passesCount,
            offices,
            businessCenters,
            propertyIds: businessCenters.map((bc) => bc.id),
            profileChangeRequest: (0, profile_change_1.mapProfileChangeRequest)(user.profileChangeRequest),
        };
    }
    async getActorPropertyIds(actor) {
        if (!actor || actor.role === 'admin')
            return null;
        if (!['bc_admin', 'security'].includes(actor.role))
            return null;
        const user = await this.userModel.findById(actor.userId).lean();
        return (user?.properties || []).map((p) => p.toString());
    }
    async ensureBcAccess(propertyId, actor) {
        if (!actor || actor.role === 'admin')
            return;
        if (actor.role !== 'bc_admin')
            return;
        const allowed = await this.getActorPropertyIds(actor);
        if (!allowed?.includes(propertyId)) {
            throw new common_1.NotFoundException('Бизнес-центр не найден');
        }
    }
    mapBcPassSettings(property) {
        const s = property?.settings || {};
        return {
            auto_approve_delivery: s.auto_approve_delivery || 'false',
            working_hours_from: s.working_hours_from || '08:00',
            working_hours_to: s.working_hours_to || '20:00',
            contact_phone: s.contact_phone || '+7 (495) 000-00-00',
            contact_email: s.contact_email || 'reception@pass24.local',
            reception_floor: s.reception_floor || '1',
            require_checkout: s.require_checkout !== 'false' ? 'true' : 'false',
            closed_weekdays: s.closed_weekdays || '',
        };
    }
    mergeBcPassSettings(current, dto) {
        const settings = { ...(current || {}) };
        if (dto.auto_approve_delivery !== undefined)
            settings.auto_approve_delivery = dto.auto_approve_delivery;
        if (dto.working_hours_from !== undefined)
            settings.working_hours_from = dto.working_hours_from;
        if (dto.working_hours_to !== undefined)
            settings.working_hours_to = dto.working_hours_to;
        if (dto.contact_phone !== undefined)
            settings.contact_phone = dto.contact_phone;
        if (dto.contact_email !== undefined)
            settings.contact_email = dto.contact_email;
        if (dto.reception_floor !== undefined)
            settings.reception_floor = dto.reception_floor;
        if (dto.require_checkout !== undefined)
            settings.require_checkout = dto.require_checkout;
        if (dto.closed_weekdays !== undefined)
            settings.closed_weekdays = dto.closed_weekdays;
        return settings;
    }
    countBy(arr, key) {
        return arr.reduce((acc, item) => {
            const val = item[key] || 'unknown';
            acc[val] = (acc[val] || 0) + 1;
            return acc;
        }, {});
    }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(schemas_1.User.name, auth_database_constants_1.AUTH_CONNECTION)),
    __param(1, (0, mongoose_1.InjectModel)(schemas_1.Property.name)),
    __param(2, (0, mongoose_1.InjectModel)(schemas_1.Office.name)),
    __param(3, (0, mongoose_1.InjectModel)(schemas_1.Pass.name)),
    __param(4, (0, mongoose_1.InjectModel)(schemas_1.PassTemplate.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        audit_service_1.AuditService,
        passes_service_1.PassesService,
        test_data_seed_service_1.TestDataSeedService])
], AdminService);
//# sourceMappingURL=admin.service.js.map