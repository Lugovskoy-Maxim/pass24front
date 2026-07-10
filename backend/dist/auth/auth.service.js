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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const person_name_1 = require("../common/person-name");
const profile_change_1 = require("../common/profile-change");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const bcrypt = __importStar(require("bcryptjs"));
const jwt_1 = require("@nestjs/jwt");
const access_config_service_1 = require("../access/access-config.service");
const audit_service_1 = require("../audit/audit.service");
const auth_database_constants_1 = require("../database/auth-database.constants");
const mail_service_1 = require("../mail/mail.service");
const schemas_1 = require("../schemas");
const bookable_visit_dates_1 = require("../common/bookable-visit-dates");
const tenant_owner_1 = require("../common/tenant-owner");
const dev_test_accounts_1 = require("../database/dev-test-accounts");
let AuthService = class AuthService {
    userModel;
    pendingModel;
    officeModel;
    propertyModel;
    jwtService;
    accessConfigService;
    auditService;
    mailService;
    constructor(userModel, pendingModel, officeModel, propertyModel, jwtService, accessConfigService, auditService, mailService) {
        this.userModel = userModel;
        this.pendingModel = pendingModel;
        this.officeModel = officeModel;
        this.propertyModel = propertyModel;
        this.jwtService = jwtService;
        this.accessConfigService = accessConfigService;
        this.auditService = auditService;
        this.mailService = mailService;
    }
    async requestRegistrationCode(dto) {
        const email = dto.email.toLowerCase().trim();
        const existing = await this.userModel.findOne({ email });
        if (existing) {
            throw new common_1.ConflictException('Пользователь с таким email уже существует');
        }
        let personName;
        try {
            personName = (0, person_name_1.resolvePersonName)(dto);
        }
        catch {
            throw new common_1.BadRequestException('Укажите фамилию и имя');
        }
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const codeHash = await bcrypt.hash(code, 10);
        const passwordHash = await bcrypt.hash(dto.password, 10);
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        await this.pendingModel.findOneAndUpdate({ email }, {
            email,
            codeHash,
            expiresAt,
            password: passwordHash,
            fullName: personName.fullName,
            lastName: personName.lastName,
            firstName: personName.firstName,
            middleName: personName.middleName,
            phone: dto.phone?.trim() || undefined,
            company: dto.company.trim(),
        }, { upsert: true, new: true, setDefaultsOnInsert: true });
        await this.mailService.sendRegistrationCode(email, code);
        return {
            verificationRequired: true,
            message: `Код подтверждения отправлен на ${email}`,
            expiresInMinutes: 15,
        };
    }
    async confirmRegistration(dto) {
        const email = dto.email.toLowerCase().trim();
        const pending = await this.pendingModel
            .findOne({ email })
            .select('+codeHash +password')
            .lean();
        if (!pending) {
            throw new common_1.BadRequestException('Код не найден. Запросите новый код регистрации.');
        }
        if (pending.expiresAt.getTime() < Date.now()) {
            await this.pendingModel.deleteOne({ email });
            throw new common_1.BadRequestException('Код истёк. Запросите новый код регистрации.');
        }
        const codeOk = await bcrypt.compare(dto.code, pending.codeHash);
        if (!codeOk) {
            throw new common_1.BadRequestException('Неверный код подтверждения');
        }
        const existing = await this.userModel.findOne({ email });
        if (existing) {
            await this.pendingModel.deleteOne({ email });
            throw new common_1.ConflictException('Пользователь с таким email уже существует');
        }
        const user = await this.userModel.create({
            email,
            fullName: pending.fullName,
            lastName: pending.lastName,
            firstName: pending.firstName,
            middleName: pending.middleName,
            phone: pending.phone,
            company: pending.company,
            role: 'tenant',
            password: pending.password,
            isActive: false,
        });
        await this.pendingModel.deleteOne({ email });
        await this.auditService.log({
            action: 'user.registration_request',
            entityType: 'user',
            entityId: user._id,
            details: {
                email: user.email,
                fullName: user.fullName,
                company: user.company,
                phone: user.phone,
                emailVerified: true,
            },
        });
        return {
            pendingApproval: true,
            message: 'Заявка отправлена. Доступ будет открыт после подтверждения администратором.',
        };
    }
    async register(dto) {
        return this.requestRegistrationCode(dto);
    }
    async login(dto) {
        const login = (dto.login || dto.email || '').trim().toLowerCase();
        if (!login) {
            throw new common_1.UnauthorizedException('Неверные учетные данные');
        }
        const user = await this.userModel.findOne({
            $or: [{ username: login }, { email: login }],
        }).select('+password');
        if (!user) {
            if (dev_test_accounts_1.DEV_TEST_ACCOUNT_EMAILS.has(login)) {
                return this.createTestUser(login, dto.password);
            }
            throw new common_1.UnauthorizedException('Неверные учетные данные');
        }
        const isValid = await bcrypt.compare(dto.password, user.password || '');
        if (!isValid) {
            throw new common_1.UnauthorizedException('Неверные учетные данные');
        }
        if (user.isActive === false) {
            throw new common_1.ForbiddenException('Учётная запись ожидает подтверждения администратором. Вход будет доступен после одобрения заявки.');
        }
        const offices = await this.getUserOffices(user._id.toString(), user.parentTenantId?.toString());
        const token = this.generateToken(user);
        return { user: await this.toUserDto(user, offices), token };
    }
    async me(userId) {
        const user = await this.userModel.findById(userId);
        if (!user)
            throw new common_1.UnauthorizedException();
        if (user.isActive === false) {
            throw new common_1.ForbiddenException('Учётная запись не активирована');
        }
        const offices = await this.getUserOffices(userId, user.parentTenantId?.toString());
        return { user: await this.toUserDto(user, offices) };
    }
    async requestProfileChange(userId, dto) {
        const user = await this.userModel.findById(userId);
        if (!user)
            throw new common_1.UnauthorizedException();
        if (user.parentTenantId) {
            throw new common_1.ForbiddenException('Сотрудники компании не могут изменять профиль — обратитесь к владельцу аккаунта');
        }
        if (user.role !== 'tenant') {
            throw new common_1.ForbiddenException('Редактирование профиля доступно только арендаторам');
        }
        let personName;
        try {
            personName = (0, person_name_1.resolvePersonName)({
                lastName: dto.lastName,
                firstName: dto.firstName,
                middleName: dto.middleName,
            });
        }
        catch {
            throw new common_1.BadRequestException('Укажите фамилию и имя');
        }
        const current = user.lastName || user.firstName
            ? {
                lastName: user.lastName || '',
                firstName: user.firstName || '',
                middleName: user.middleName || '',
            }
            : (0, person_name_1.splitFullName)(user.fullName);
        const requested = {
            lastName: personName.lastName,
            firstName: personName.firstName,
            middleName: personName.middleName,
            phone: dto.phone?.trim() || '',
            company: dto.company?.trim() || '',
        };
        if ((0, profile_change_1.profileFieldsEqual)({ ...current, phone: user.phone || '', company: user.company || '' }, requested)) {
            throw new common_1.BadRequestException('Нет изменений для отправки на подтверждение');
        }
        user.profileChangeRequest = {
            lastName: requested.lastName,
            firstName: requested.firstName,
            middleName: requested.middleName,
            fullName: personName.fullName,
            phone: requested.phone || undefined,
            company: requested.company || undefined,
            requestedAt: new Date(),
        };
        user.markModified('profileChangeRequest');
        await user.save();
        await this.auditService.log({
            action: 'profile.change_request',
            entityType: 'user',
            entityId: user._id,
            actor: { userId, email: user.email, role: user.role },
            details: {
                fullName: personName.fullName,
                phone: requested.phone || undefined,
                company: requested.company || undefined,
            },
        });
        const offices = await this.getUserOffices(userId);
        return { user: await this.toUserDto(user, offices) };
    }
    async cancelProfileChange(userId) {
        const user = await this.userModel.findById(userId);
        if (!user)
            throw new common_1.UnauthorizedException();
        if (!user.profileChangeRequest?.requestedAt) {
            throw new common_1.BadRequestException('Нет заявки на изменение профиля');
        }
        user.profileChangeRequest = null;
        user.markModified('profileChangeRequest');
        await user.save();
        const offices = await this.getUserOffices(userId, user.parentTenantId?.toString());
        return { user: await this.toUserDto(user, offices) };
    }
    async listTenantEmployees(userId) {
        const owner = await this.userModel.findById(userId);
        if (!owner)
            throw new common_1.UnauthorizedException();
        if (owner.role !== 'tenant' || owner.parentTenantId) {
            throw new common_1.ForbiddenException('Управление сотрудниками доступно только владельцу компании');
        }
        const employees = await this.userModel
            .find({ parentTenantId: owner._id })
            .sort({ createdAt: -1 })
            .lean();
        const { roles } = await this.accessConfigService.getEmployeeAssignableRoles();
        const roleLabelMap = new Map(roles.map((item) => [item.key, item.label]));
        return {
            employees: employees.map((e) => ({
                id: e._id.toString(),
                email: e.email,
                full_name: e.fullName,
                last_name: e.lastName,
                first_name: e.firstName,
                middle_name: e.middleName,
                phone: e.phone,
                is_active: e.isActive !== false,
                role: e.role,
                role_label: roleLabelMap.get(e.role) || e.role,
                created_at: e.createdAt,
            })),
        };
    }
    async addTenantEmployee(userId, dto) {
        const owner = await this.userModel.findById(userId);
        if (!owner)
            throw new common_1.UnauthorizedException();
        if (owner.role !== 'tenant' || owner.parentTenantId) {
            throw new common_1.ForbiddenException('Добавлять сотрудников может только владелец компании');
        }
        const email = dto.email.toLowerCase().trim();
        const existing = await this.userModel.findOne({ email });
        if (existing) {
            throw new common_1.ConflictException('Пользователь с таким email уже существует');
        }
        let personName;
        try {
            personName = (0, person_name_1.resolvePersonName)({
                lastName: dto.lastName,
                firstName: dto.firstName,
                middleName: dto.middleName,
            });
        }
        catch {
            throw new common_1.BadRequestException('Укажите фамилию и имя');
        }
        const assignable = await this.accessConfigService.getEmployeeAssignableRoles();
        const employeeRole = dto.role || assignable.roles[0]?.key;
        if (!employeeRole) {
            throw new common_1.BadRequestException('Сначала создайте тип пользователя в разделе «Права и типы пропусков»');
        }
        await this.accessConfigService.assertEmployeeRole(employeeRole);
        const roleLabel = assignable.roles.find((item) => item.key === employeeRole)?.label || employeeRole;
        const passwordHash = await bcrypt.hash(dto.password, 10);
        const employee = await this.userModel.create({
            email,
            fullName: personName.fullName,
            lastName: personName.lastName,
            firstName: personName.firstName,
            middleName: personName.middleName,
            phone: dto.phone?.trim() || undefined,
            company: owner.company,
            role: employeeRole,
            parentTenantId: owner._id,
            password: passwordHash,
            isActive: true,
        });
        await this.auditService.log({
            action: 'tenant.employee_added',
            entityType: 'user',
            entityId: employee._id,
            actor: { userId, email: owner.email, role: owner.role },
            details: {
                employeeEmail: email,
                employeeName: personName.fullName,
                ownerCompany: owner.company,
                employeeRole,
                employeeRoleLabel: roleLabel,
            },
        });
        return {
            employee: {
                id: employee._id.toString(),
                email: employee.email,
                full_name: employee.fullName,
                last_name: employee.lastName,
                first_name: employee.firstName,
                middle_name: employee.middleName,
                phone: employee.phone,
                is_active: true,
                role: employee.role,
                role_label: roleLabel,
                created_at: employee.createdAt,
            },
        };
    }
    async removeTenantEmployee(userId, employeeId) {
        const owner = await this.userModel.findById(userId);
        if (!owner)
            throw new common_1.UnauthorizedException();
        if (owner.role !== 'tenant' || owner.parentTenantId) {
            throw new common_1.ForbiddenException('Удалять сотрудников может только владелец компании');
        }
        const employee = await this.userModel.findById(employeeId);
        if (!employee || employee.parentTenantId?.toString() !== owner._id.toString()) {
            throw new common_1.NotFoundException('Сотрудник не найден');
        }
        employee.isActive = false;
        await employee.save();
        await this.auditService.log({
            action: 'tenant.employee_removed',
            entityType: 'user',
            entityId: employee._id,
            actor: { userId, email: owner.email, role: owner.role },
            details: { employeeEmail: employee.email, employeeName: employee.fullName },
        });
        return { message: 'Сотрудник деактивирован' };
    }
    async getUserOffices(userId, parentTenantId) {
        const ownerId = (0, tenant_owner_1.resolveTenantOwnerId)({ userId, parentTenantId }) || userId;
        const offices = await this.officeModel.find({ tenantId: new mongoose_2.Types.ObjectId(ownerId), isActive: true }).lean();
        if (!offices.length)
            return [];
        const propertyIds = [...new Set(offices.map((o) => o.property.toString()))];
        const properties = await this.propertyModel.find({ _id: { $in: propertyIds } }).lean();
        const propertyMap = new Map(properties.map((p) => [p._id.toString(), p]));
        return offices.map((o) => {
            const property = propertyMap.get(o.property.toString());
            const ps = property?.settings || {};
            return {
                id: o._id.toString(),
                propertyId: o.property.toString(),
                businessCenterName: property?.name,
                number: o.number,
                floor: o.floor,
                company: o.company,
                workingHoursFrom: ps.working_hours_from || '08:00',
                workingHoursTo: ps.working_hours_to || '20:00',
                closedWeekdays: (0, bookable_visit_dates_1.parseClosedWeekdays)(ps.closed_weekdays),
            };
        });
    }
    generateToken(user) {
        return this.jwtService.sign({
            sub: user._id.toString(),
            email: user.email,
            role: user.role,
        });
    }
    async toUserDto(user, offices = []) {
        const role = user.role || 'tenant';
        const permissions = await this.accessConfigService.getPermissionsForRole(role);
        const { enabledPassTypes, roleLabels } = await this.accessConfigService.getConfig();
        return {
            id: user._id.toString(),
            username: user.username,
            email: user.email,
            full_name: user.fullName,
            last_name: user.lastName,
            first_name: user.firstName,
            middle_name: user.middleName,
            phone: user.phone,
            company: user.company,
            role,
            role_label: roleLabels?.[role] || role,
            office: user.office,
            floor: user.floor,
            offices,
            permissions,
            enabledPassTypes,
            parent_tenant_id: user.parentTenantId?.toString(),
            is_tenant_owner: user.role === 'tenant' && !user.parentTenantId,
            profile_change_request: (0, profile_change_1.mapProfileChangeRequest)(user.profileChangeRequest),
        };
    }
    getDevAccounts() {
        if (process.env.NODE_ENV === 'production') {
            return { accounts: [] };
        }
        return {
            accounts: dev_test_accounts_1.DEV_TEST_ACCOUNTS.map(({ label, email, password, role }) => ({
                label,
                email,
                password,
                role,
            })),
        };
    }
    async createTestUser(email, password) {
        const account = dev_test_accounts_1.DEV_TEST_ACCOUNTS.find((item) => item.email === email.toLowerCase());
        if (!account) {
            throw new common_1.UnauthorizedException('Неверные учетные данные');
        }
        const hashed = await bcrypt.hash(password, 10);
        let user = await this.userModel.findOne({ email: account.email });
        if (!user) {
            user = await this.userModel.create({
                email: account.email,
                fullName: account.fullName,
                company: account.company,
                office: account.office,
                floor: account.floor,
                role: account.role,
                password: hashed,
                isActive: true,
            });
        }
        const offices = await this.getUserOffices(user._id.toString(), user.parentTenantId?.toString());
        const token = this.generateToken(user);
        return { user: await this.toUserDto(user, offices), token };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(schemas_1.User.name, auth_database_constants_1.AUTH_CONNECTION)),
    __param(1, (0, mongoose_1.InjectModel)(schemas_1.RegistrationPending.name, auth_database_constants_1.AUTH_CONNECTION)),
    __param(2, (0, mongoose_1.InjectModel)(schemas_1.Office.name)),
    __param(3, (0, mongoose_1.InjectModel)(schemas_1.Property.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        jwt_1.JwtService,
        access_config_service_1.AccessConfigService,
        audit_service_1.AuditService,
        mail_service_1.MailService])
], AuthService);
//# sourceMappingURL=auth.service.js.map