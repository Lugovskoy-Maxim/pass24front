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
exports.ConfigController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const access_config_service_1 = require("../access/access-config.service");
const app_config_service_1 = require("./app-config.service");
let ConfigController = class ConfigController {
    accessConfigService;
    appConfigService;
    constructor(accessConfigService, appConfigService) {
        this.accessConfigService = accessConfigService;
        this.appConfigService = appConfigService;
    }
    getConfig() {
        return this.appConfigService.getPublicConfig();
    }
    async getAccessConfig(req) {
        const config = await this.accessConfigService.getConfig();
        const permissions = await this.accessConfigService.getPermissionsForRole(req.user.role);
        return {
            enabledPassTypes: config.enabledPassTypes,
            passTypeLabels: config.passTypeLabels,
            permissions,
            rolePermissions: config.rolePermissions,
        };
    }
};
exports.ConfigController = ConfigController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ConfigController.prototype, "getConfig", null);
__decorate([
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Get)('access'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ConfigController.prototype, "getAccessConfig", null);
exports.ConfigController = ConfigController = __decorate([
    (0, common_1.Controller)('config'),
    __metadata("design:paramtypes", [access_config_service_1.AccessConfigService,
        app_config_service_1.AppConfigService])
], ConfigController);
//# sourceMappingURL=config.controller.js.map