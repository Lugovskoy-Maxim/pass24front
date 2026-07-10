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
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const access_config_service_1 = require("../access/access-config.service");
const auth_service_1 = require("./auth.service");
const login_dto_1 = require("./dto/login.dto");
const confirm_registration_dto_1 = require("./dto/confirm-registration.dto");
const create_tenant_employee_dto_1 = require("./dto/create-tenant-employee.dto");
const register_dto_1 = require("./dto/register.dto");
const update_profile_dto_1 = require("./dto/update-profile.dto");
let AuthController = class AuthController {
    authService;
    accessConfigService;
    constructor(authService, accessConfigService) {
        this.authService = authService;
        this.accessConfigService = accessConfigService;
    }
    async login(dto) {
        return this.authService.login(dto);
    }
    getDevAccounts() {
        return this.authService.getDevAccounts();
    }
    async requestRegistrationCode(dto) {
        return this.authService.requestRegistrationCode(dto);
    }
    async confirmRegistration(dto) {
        return this.authService.confirmRegistration(dto);
    }
    async register(dto) {
        return this.authService.requestRegistrationCode(dto);
    }
    async me(req) {
        return this.authService.me(req.user.userId);
    }
    async requestProfileChange(req, dto) {
        return this.authService.requestProfileChange(req.user.userId, dto);
    }
    async cancelProfileChange(req) {
        return this.authService.cancelProfileChange(req.user.userId);
    }
    listTenantEmployees(req) {
        return this.authService.listTenantEmployees(req.user.userId);
    }
    addTenantEmployee(req, dto) {
        return this.authService.addTenantEmployee(req.user.userId, dto);
    }
    removeTenantEmployee(req, id) {
        return this.authService.removeTenantEmployee(req.user.userId, id);
    }
    listEmployeeRoles() {
        return this.accessConfigService.getEmployeeAssignableRoles();
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('login'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_dto_1.LoginDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Get)('dev-accounts'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "getDevAccounts", null);
__decorate([
    (0, common_1.Post)('register/request-code'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [register_dto_1.RegisterDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "requestRegistrationCode", null);
__decorate([
    (0, common_1.Post)('register/confirm'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [confirm_registration_dto_1.ConfirmRegistrationDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "confirmRegistration", null);
__decorate([
    (0, common_1.Post)('register'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [register_dto_1.RegisterDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "register", null);
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Get)('me'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "me", null);
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Patch)('profile'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_profile_dto_1.UpdateProfileDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "requestProfileChange", null);
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Delete)('profile/request'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "cancelProfileChange", null);
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Get)('tenant/employees'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "listTenantEmployees", null);
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Post)('tenant/employees'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_tenant_employee_dto_1.CreateTenantEmployeeDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "addTenantEmployee", null);
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Delete)('tenant/employees/:id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "removeTenantEmployee", null);
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Get)('tenant/employee-roles'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "listEmployeeRoles", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        access_config_service_1.AccessConfigService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map