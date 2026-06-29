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
exports.PassesPublicController = void 0;
const common_1 = require("@nestjs/common");
const passes_service_1 = require("./passes.service");
let PassesPublicController = class PassesPublicController {
    passesService;
    constructor(passesService) {
        this.passesService = passesService;
    }
    getTicket(passNumber) {
        return this.passesService.getPublicTicket(passNumber);
    }
};
exports.PassesPublicController = PassesPublicController;
__decorate([
    (0, common_1.Get)(':passNumber'),
    __param(0, (0, common_1.Param)('passNumber')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PassesPublicController.prototype, "getTicket", null);
exports.PassesPublicController = PassesPublicController = __decorate([
    (0, common_1.Controller)('passes/public'),
    __metadata("design:paramtypes", [passes_service_1.PassesService])
], PassesPublicController);
//# sourceMappingURL=passes-public.controller.js.map