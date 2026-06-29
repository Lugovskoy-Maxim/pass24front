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
exports.PassSchema = exports.Pass = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let Pass = class Pass {
    passNumber;
    createdBy;
    creatorName;
    creatorCompany;
    creatorPhone;
    visitorName;
    visitorPhone;
    companyName;
    visitPurpose;
    passType;
    status;
    vehiclePlate;
    vehicleModel;
    visitDate;
    visitTimeFrom;
    visitTimeTo;
    property;
    officeId;
    businessCenterName;
    office;
    floor;
    comment;
    approvedBy;
    approverName;
    approvedAt;
    rejectionReason;
    checkedInAt;
    checkedInBy;
    checkerInName;
    checkedOutAt;
    checkedOutBy;
    checkerOutName;
    meta;
};
exports.Pass = Pass;
__decorate([
    (0, mongoose_1.Prop)({ required: true, unique: true }),
    __metadata("design:type", String)
], Pass.prototype, "passNumber", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Pass.prototype, "createdBy", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Pass.prototype, "creatorName", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Pass.prototype, "creatorCompany", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Pass.prototype, "creatorPhone", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, trim: true }),
    __metadata("design:type", String)
], Pass.prototype, "visitorName", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Pass.prototype, "visitorPhone", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Pass.prototype, "companyName", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Pass.prototype, "visitPurpose", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, index: true }),
    __metadata("design:type", String)
], Pass.prototype, "passType", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, index: true }),
    __metadata("design:type", String)
], Pass.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ uppercase: true, trim: true }),
    __metadata("design:type", String)
], Pass.prototype, "vehiclePlate", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Pass.prototype, "vehicleModel", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Pass.prototype, "visitDate", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Pass.prototype, "visitTimeFrom", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Pass.prototype, "visitTimeTo", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Property', index: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Pass.prototype, "property", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Office' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Pass.prototype, "officeId", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Pass.prototype, "businessCenterName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Pass.prototype, "office", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Pass.prototype, "floor", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Pass.prototype, "comment", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Pass.prototype, "approvedBy", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Pass.prototype, "approverName", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Pass.prototype, "approvedAt", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Pass.prototype, "rejectionReason", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Pass.prototype, "checkedInAt", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Pass.prototype, "checkedInBy", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Pass.prototype, "checkerInName", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Pass.prototype, "checkedOutAt", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Pass.prototype, "checkedOutBy", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Pass.prototype, "checkerOutName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object, default: {} }),
    __metadata("design:type", Object)
], Pass.prototype, "meta", void 0);
exports.Pass = Pass = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true, collection: 'passes' })
], Pass);
exports.PassSchema = mongoose_1.SchemaFactory.createForClass(Pass);
exports.PassSchema.index({ status: 1, visitDate: -1 });
exports.PassSchema.index({ visitorName: 'text', vehiclePlate: 'text', companyName: 'text' });
exports.PassSchema.index({ office: 1 });
exports.PassSchema.index({ property: 1, visitDate: -1 });
exports.PassSchema.index({ officeId: 1 });
exports.PassSchema.index({ createdBy: 1 });
//# sourceMappingURL=pass.schema.js.map