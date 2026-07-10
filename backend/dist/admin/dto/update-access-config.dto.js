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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateAccessConfigDto = void 0;
const class_validator_1 = require("class-validator");
const access_constants_1 = require("../../access/access.constants");
class UpdateAccessConfigDto {
    enabledPassTypes;
    rolePermissions;
    roleLabels;
}
exports.UpdateAccessConfigDto = UpdateAccessConfigDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsIn)([...access_constants_1.ALL_PASS_TYPES], { each: true }),
    __metadata("design:type", Array)
], UpdateAccessConfigDto.prototype, "enabledPassTypes", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], UpdateAccessConfigDto.prototype, "rolePermissions", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], UpdateAccessConfigDto.prototype, "roleLabels", void 0);
//# sourceMappingURL=update-access-config.dto.js.map