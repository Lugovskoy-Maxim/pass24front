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
exports.PassTemplateSchema = exports.PassTemplate = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let PassTemplate = class PassTemplate {
    createdBy;
    name;
    source;
    sourcePassId;
    visitorName;
    visitorPhone;
    companyName;
    visitPurpose;
    passType;
    vehiclePlate;
    vehicleModel;
    visitTimeFrom;
    visitTimeTo;
    officeId;
    office;
    floor;
    businessCenterName;
    comment;
};
exports.PassTemplate = PassTemplate;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true, index: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], PassTemplate.prototype, "createdBy", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, trim: true }),
    __metadata("design:type", String)
], PassTemplate.prototype, "name", void 0);
__decorate([
    (0, mongoose_1.Prop)({ enum: ['manual', 'from_pass'], default: 'manual' }),
    __metadata("design:type", String)
], PassTemplate.prototype, "source", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Pass' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], PassTemplate.prototype, "sourcePassId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, trim: true }),
    __metadata("design:type", String)
], PassTemplate.prototype, "visitorName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], PassTemplate.prototype, "visitorPhone", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], PassTemplate.prototype, "companyName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], PassTemplate.prototype, "visitPurpose", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], PassTemplate.prototype, "passType", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], PassTemplate.prototype, "vehiclePlate", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], PassTemplate.prototype, "vehicleModel", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], PassTemplate.prototype, "visitTimeFrom", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], PassTemplate.prototype, "visitTimeTo", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Office' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], PassTemplate.prototype, "officeId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], PassTemplate.prototype, "office", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], PassTemplate.prototype, "floor", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], PassTemplate.prototype, "businessCenterName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], PassTemplate.prototype, "comment", void 0);
exports.PassTemplate = PassTemplate = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], PassTemplate);
exports.PassTemplateSchema = mongoose_1.SchemaFactory.createForClass(PassTemplate);
exports.PassTemplateSchema.index({ createdBy: 1, visitorName: 1, passType: 1, officeId: 1 }, { unique: true, partialFilterExpression: { officeId: { $exists: true } } });
//# sourceMappingURL=pass-template.schema.js.map