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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const permissions_decorator_1 = require("../auth/permissions.decorator");
const permissions_guard_1 = require("../auth/permissions.guard");
const access_config_service_1 = require("../access/access-config.service");
const audit_service_1 = require("../audit/audit.service");
const admin_service_1 = require("./admin.service");
const create_business_center_dto_1 = require("./dto/create-business-center.dto");
const create_office_dto_1 = require("./dto/create-office.dto");
const create_user_dto_1 = require("./dto/create-user.dto");
const update_access_config_dto_1 = require("./dto/update-access-config.dto");
const update_business_center_dto_1 = require("./dto/update-business-center.dto");
const update_site_settings_dto_1 = require("./dto/update-site-settings.dto");
const site_settings_service_1 = require("../site-settings/site-settings.service");
let AdminController = class AdminController {
    adminService;
    accessConfigService;
    auditService;
    siteSettingsService;
    constructor(adminService, accessConfigService, auditService, siteSettingsService) {
        this.adminService = adminService;
        this.accessConfigService = accessConfigService;
        this.auditService = auditService;
        this.siteSettingsService = siteSettingsService;
    }
    dashboard() {
        return this.adminService.dashboard();
    }
    seedTestData() {
        return this.adminService.seedTestData();
    }
    getAccessConfig() {
        return this.accessConfigService.getConfig();
    }
    async updateAccessConfig(dto, req) {
        const result = await this.accessConfigService.updateConfig(dto);
        await this.auditService.log({
            action: 'permissions.update',
            entityType: 'access_config',
            actor: req.user,
            details: {
                enabledPassTypes: dto.enabledPassTypes,
                roles: dto.rolePermissions ? Object.keys(dto.rolePermissions) : undefined,
            },
        });
        return result;
    }
    getUsers(q) {
        return this.adminService.getUsers({
            category: q.category,
            role: q.role,
            search: q.search,
            isActive: q.isActive,
            propertyId: q.propertyId,
            officeId: q.officeId,
        });
    }
    createUser(dto, req) {
        return this.adminService.createUser(dto, req.user);
    }
    updateUser(id, dto, req) {
        return this.adminService.updateUser(id, dto, req.user);
    }
    getRegistrationRequests() {
        return this.adminService.getRegistrationRequests();
    }
    approveRegistration(id, req) {
        return this.adminService.approveRegistration(id, req.user);
    }
    rejectRegistration(id, req) {
        return this.adminService.rejectRegistration(id, req.user);
    }
    getProfileChangeRequests() {
        return this.adminService.getProfileChangeRequests();
    }
    approveProfileChange(id, req) {
        return this.adminService.approveProfileChange(id, req.user);
    }
    rejectProfileChange(id, req) {
        return this.adminService.rejectProfileChange(id, req.user);
    }
    getBusinessCenters(req) {
        return this.adminService.getBusinessCenters(req.user);
    }
    updateBusinessCenter(id, dto, req) {
        return this.adminService.updateBusinessCenter(id, dto, req.user);
    }
    createBusinessCenter(dto, req) {
        return this.adminService.createBusinessCenter(dto, req.user);
    }
    deleteBusinessCenter(id, req) {
        return this.adminService.deleteBusinessCenter(id, req.user);
    }
    getOffices() {
        return this.adminService.getOffices();
    }
    createOffice(dto, req) {
        return this.adminService.createOffice(dto, req.user);
    }
    updateOffice(id, dto, req) {
        return this.adminService.updateOffice(id, dto, req.user);
    }
    deleteOffice(id, req) {
        return this.adminService.deleteOffice(id, req.user);
    }
    async exportAudit(query, res) {
        const csv = await this.adminService.exportAuditCsv(this.parseAuditQuery(query));
        const filename = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(Buffer.from(`\uFEFF${csv}`, 'utf-8'));
    }
    getAudit(query) {
        return this.adminService.getAudit(this.parseAuditQuery(query));
    }
    parseAuditQuery(query) {
        return {
            offset: query.offset !== undefined ? Number(query.offset) : undefined,
            limit: query.limit !== undefined ? Number(query.limit) : undefined,
            dateFrom: query.dateFrom,
            dateTo: query.dateTo,
            action: query.action,
            entityType: query.entityType,
            userId: query.userId,
            search: query.search,
        };
    }
    async getSiteSettings() {
        const settings = await this.siteSettingsService.get();
        return { settings };
    }
    async updateSiteSettings(dto, req) {
        const settings = await this.siteSettingsService.update(dto);
        await this.auditService.log({
            action: 'site_settings.update',
            entityType: 'app_settings',
            actor: req.user,
            details: { siteName: settings.siteName },
        });
        return { settings };
    }
    getDailyReport(date) {
        return { date: date || new Date().toISOString().slice(0, 10), summary: [], visitors: [] };
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Get)('dashboard'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "dashboard", null);
__decorate([
    (0, common_1.Post)('seed-test-data'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "seedTestData", null);
__decorate([
    (0, common_1.Get)('access-config'),
    (0, permissions_decorator_1.RequireAllPermissions)('admin.permissions'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getAccessConfig", null);
__decorate([
    (0, common_1.Patch)('access-config'),
    (0, permissions_decorator_1.RequireAllPermissions)('admin.permissions'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [update_access_config_dto_1.UpdateAccessConfigDto, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateAccessConfig", null);
__decorate([
    (0, common_1.Get)('users'),
    (0, permissions_decorator_1.RequireAllPermissions)('admin.users'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getUsers", null);
__decorate([
    (0, common_1.Post)('users'),
    (0, permissions_decorator_1.RequireAllPermissions)('admin.users'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_user_dto_1.CreateUserDto, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "createUser", null);
__decorate([
    (0, common_1.Patch)('users/:id'),
    (0, permissions_decorator_1.RequireAllPermissions)('admin.users'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateUser", null);
__decorate([
    (0, common_1.Get)('registration-requests'),
    (0, permissions_decorator_1.RequireAllPermissions)('admin.users'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getRegistrationRequests", null);
__decorate([
    (0, common_1.Post)('users/:id/registration/approve'),
    (0, permissions_decorator_1.RequireAllPermissions)('admin.users'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "approveRegistration", null);
__decorate([
    (0, common_1.Post)('users/:id/registration/reject'),
    (0, permissions_decorator_1.RequireAllPermissions)('admin.users'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "rejectRegistration", null);
__decorate([
    (0, common_1.Get)('profile-change-requests'),
    (0, permissions_decorator_1.RequireAllPermissions)('admin.users'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getProfileChangeRequests", null);
__decorate([
    (0, common_1.Post)('users/:id/profile-change/approve'),
    (0, permissions_decorator_1.RequireAllPermissions)('admin.users'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "approveProfileChange", null);
__decorate([
    (0, common_1.Post)('users/:id/profile-change/reject'),
    (0, permissions_decorator_1.RequireAllPermissions)('admin.users'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "rejectProfileChange", null);
__decorate([
    (0, common_1.Get)('business-centers'),
    (0, permissions_decorator_1.RequireAllPermissions)('admin.offices'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getBusinessCenters", null);
__decorate([
    (0, common_1.Patch)('business-centers/:id'),
    (0, permissions_decorator_1.RequireAllPermissions)('admin.offices'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_business_center_dto_1.UpdateBusinessCenterDto, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateBusinessCenter", null);
__decorate([
    (0, common_1.Post)('business-centers'),
    (0, permissions_decorator_1.RequireAllPermissions)('admin.offices'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_business_center_dto_1.CreateBusinessCenterDto, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "createBusinessCenter", null);
__decorate([
    (0, common_1.Delete)('business-centers/:id'),
    (0, permissions_decorator_1.RequireAllPermissions)('admin.offices'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "deleteBusinessCenter", null);
__decorate([
    (0, common_1.Get)('offices'),
    (0, permissions_decorator_1.RequireAllPermissions)('admin.offices'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getOffices", null);
__decorate([
    (0, common_1.Post)('offices'),
    (0, permissions_decorator_1.RequireAllPermissions)('admin.offices'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_office_dto_1.CreateOfficeDto, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "createOffice", null);
__decorate([
    (0, common_1.Patch)('offices/:id'),
    (0, permissions_decorator_1.RequireAllPermissions)('admin.offices'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateOffice", null);
__decorate([
    (0, common_1.Delete)('offices/:id'),
    (0, permissions_decorator_1.RequireAllPermissions)('admin.offices'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "deleteOffice", null);
__decorate([
    (0, common_1.Get)('audit/export'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "exportAudit", null);
__decorate([
    (0, common_1.Get)('audit'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getAudit", null);
__decorate([
    (0, common_1.Get)('site-settings'),
    (0, permissions_decorator_1.RequireAllPermissions)('admin.settings'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getSiteSettings", null);
__decorate([
    (0, common_1.Patch)('site-settings'),
    (0, permissions_decorator_1.RequireAllPermissions)('admin.settings'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [update_site_settings_dto_1.UpdateSiteSettingsDto, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateSiteSettings", null);
__decorate([
    (0, common_1.Get)('reports/daily'),
    __param(0, (0, common_1.Query)('date')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getDailyReport", null);
exports.AdminController = AdminController = __decorate([
    (0, common_1.Controller)('admin'),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt'), permissions_guard_1.PermissionsGuard),
    (0, permissions_decorator_1.RequireAllPermissions)('admin.panel'),
    __metadata("design:paramtypes", [admin_service_1.AdminService,
        access_config_service_1.AccessConfigService,
        audit_service_1.AuditService,
        site_settings_service_1.SiteSettingsService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map