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
exports.PassTemplatesController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const permissions_decorator_1 = require("../auth/permissions.decorator");
const permissions_guard_1 = require("../auth/permissions.guard");
const create_pass_template_dto_1 = require("./dto/create-pass-template.dto");
const pass_templates_service_1 = require("./pass-templates.service");
let PassTemplatesController = class PassTemplatesController {
    templatesService;
    constructor(templatesService) {
        this.templatesService = templatesService;
    }
    findAll(req) {
        return this.templatesService.findAll(req.user);
    }
    create(dto, req) {
        return this.templatesService.create(dto, req.user);
    }
    syncFromPasses(req) {
        return this.templatesService.syncFromPasses(req.user);
    }
    createFromPass(passId, req, body) {
        return this.templatesService.createFromPass(passId, req.user, body?.name);
    }
    findOne(id, req) {
        return this.templatesService.findOne(id, req.user);
    }
    update(id, dto, req) {
        return this.templatesService.update(id, dto, req.user);
    }
    remove(id, req) {
        return this.templatesService.remove(id, req.user);
    }
};
exports.PassTemplatesController = PassTemplatesController;
__decorate([
    (0, common_1.Get)(),
    (0, permissions_decorator_1.RequirePermissions)('passes.templates'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PassTemplatesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)(),
    (0, permissions_decorator_1.RequirePermissions)('passes.templates'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_pass_template_dto_1.CreatePassTemplateDto, Object]),
    __metadata("design:returntype", void 0)
], PassTemplatesController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('sync-from-passes'),
    (0, permissions_decorator_1.RequirePermissions)('passes.templates'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PassTemplatesController.prototype, "syncFromPasses", null);
__decorate([
    (0, common_1.Post)('from-pass/:passId'),
    (0, permissions_decorator_1.RequirePermissions)('passes.templates'),
    __param(0, (0, common_1.Param)('passId')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], PassTemplatesController.prototype, "createFromPass", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('passes.templates'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PassTemplatesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('passes.templates'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], PassTemplatesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('passes.templates'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PassTemplatesController.prototype, "remove", null);
exports.PassTemplatesController = PassTemplatesController = __decorate([
    (0, common_1.Controller)('pass-templates'),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt'), permissions_guard_1.PermissionsGuard),
    __metadata("design:paramtypes", [pass_templates_service_1.PassTemplatesService])
], PassTemplatesController);
//# sourceMappingURL=pass-templates.controller.js.map