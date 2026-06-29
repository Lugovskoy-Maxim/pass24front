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
exports.PassesController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const permissions_decorator_1 = require("../auth/permissions.decorator");
const permissions_guard_1 = require("../auth/permissions.guard");
const passes_service_1 = require("./passes.service");
const create_pass_dto_1 = require("./dto/create-pass.dto");
const send_pass_email_dto_1 = require("./dto/send-pass-email.dto");
const update_status_dto_1 = require("./dto/update-status.dto");
let PassesController = class PassesController {
    passesService;
    constructor(passesService) {
        this.passesService = passesService;
    }
    findAll(query, req) {
        return this.passesService.findAll(query, req.user);
    }
    getJournal(date, req) {
        return this.passesService.getJournal(date, req?.user);
    }
    getStats(req) {
        return this.passesService.getStats(req.user);
    }
    getOverdueActive(req) {
        return this.passesService.getOverdueActive(req.user);
    }
    lookup(passNumber, req) {
        return this.passesService.lookup(passNumber, req.user);
    }
    findOne(id, req) {
        return this.passesService.findOne(id, req.user);
    }
    create(dto, req) {
        return this.passesService.create(dto, req.user);
    }
    updateStatus(id, dto, req) {
        return this.passesService.updateStatus(id, dto, req.user);
    }
    sendEmail(id, dto, req) {
        return this.passesService.sendPassEmail(id, dto.email, req.user);
    }
    checkIn(id, req) {
        return this.passesService.checkIn(id, req.user);
    }
    checkOut(id, req) {
        return this.passesService.checkOut(id, req.user);
    }
};
exports.PassesController = PassesController;
__decorate([
    (0, common_1.Get)(),
    (0, permissions_decorator_1.RequirePermissions)('passes.view_own', 'passes.view_all', 'admin.panel'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], PassesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('journal'),
    (0, permissions_decorator_1.RequirePermissions)('passes.reception', 'passes.view_all', 'admin.panel'),
    __param(0, (0, common_1.Query)('date')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PassesController.prototype, "getJournal", null);
__decorate([
    (0, common_1.Get)('stats'),
    (0, permissions_decorator_1.RequirePermissions)('passes.view_own', 'passes.view_all', 'admin.panel'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PassesController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)('overdue-active'),
    (0, permissions_decorator_1.RequirePermissions)('passes.reception', 'passes.view_all', 'admin.panel'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PassesController.prototype, "getOverdueActive", null);
__decorate([
    (0, common_1.Get)('lookup/:passNumber'),
    (0, permissions_decorator_1.RequirePermissions)('passes.lookup', 'passes.reception', 'admin.panel'),
    __param(0, (0, common_1.Param)('passNumber')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PassesController.prototype, "lookup", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, permissions_decorator_1.RequirePermissions)('passes.view_own', 'passes.view_all', 'admin.panel'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PassesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, permissions_decorator_1.RequirePermissions)('passes.create'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_pass_dto_1.CreatePassDto, Object]),
    __metadata("design:returntype", void 0)
], PassesController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    (0, permissions_decorator_1.RequirePermissions)('passes.approve', 'passes.create'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_status_dto_1.UpdateStatusDto, Object]),
    __metadata("design:returntype", void 0)
], PassesController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Post)(':id/send-email'),
    (0, permissions_decorator_1.RequirePermissions)('passes.create', 'passes.view_own', 'passes.view_all'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, send_pass_email_dto_1.SendPassEmailDto, Object]),
    __metadata("design:returntype", void 0)
], PassesController.prototype, "sendEmail", null);
__decorate([
    (0, common_1.Post)(':id/check-in'),
    (0, permissions_decorator_1.RequirePermissions)('passes.reception', 'admin.panel'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PassesController.prototype, "checkIn", null);
__decorate([
    (0, common_1.Post)(':id/check-out'),
    (0, permissions_decorator_1.RequirePermissions)('passes.reception', 'admin.panel'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PassesController.prototype, "checkOut", null);
exports.PassesController = PassesController = __decorate([
    (0, common_1.Controller)('passes'),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt'), permissions_guard_1.PermissionsGuard),
    __metadata("design:paramtypes", [passes_service_1.PassesService])
], PassesController);
//# sourceMappingURL=passes.controller.js.map