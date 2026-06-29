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
exports.PassRequestSchema = exports.PassRequest = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const enums_1 = require("./enums");
let PassRequest = class PassRequest {
    requestedBy;
    property;
    type;
    guestName;
    guestPhone;
    vehiclePlate;
    desiredValidFrom;
    desiredValidTo;
    comment;
    status;
    reviewedBy;
    reviewedAt;
    reviewComment;
    pass;
    meta;
};
exports.PassRequest = PassRequest;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true, index: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], PassRequest.prototype, "requestedBy", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Property', required: true, index: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], PassRequest.prototype, "property", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, enum: enums_1.PassType }),
    __metadata("design:type", String)
], PassRequest.prototype, "type", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], PassRequest.prototype, "guestName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], PassRequest.prototype, "guestPhone", void 0);
__decorate([
    (0, mongoose_1.Prop)({ uppercase: true, trim: true }),
    __metadata("design:type", String)
], PassRequest.prototype, "vehiclePlate", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date }),
    __metadata("design:type", Date)
], PassRequest.prototype, "desiredValidFrom", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date }),
    __metadata("design:type", Date)
], PassRequest.prototype, "desiredValidTo", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], PassRequest.prototype, "comment", void 0);
__decorate([
    (0, mongoose_1.Prop)({ enum: enums_1.PassRequestStatus, default: enums_1.PassRequestStatus.PENDING, index: true }),
    __metadata("design:type", String)
], PassRequest.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], PassRequest.prototype, "reviewedBy", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], PassRequest.prototype, "reviewedAt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], PassRequest.prototype, "reviewComment", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Pass' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], PassRequest.prototype, "pass", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object, default: {} }),
    __metadata("design:type", Object)
], PassRequest.prototype, "meta", void 0);
exports.PassRequest = PassRequest = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true, collection: 'pass_requests' })
], PassRequest);
exports.PassRequestSchema = mongoose_1.SchemaFactory.createForClass(PassRequest);
exports.PassRequestSchema.index({ property: 1, status: 1, createdAt: -1 });
exports.PassRequestSchema.index({ requestedBy: 1, createdAt: -1 });
exports.PassRequestSchema.index({ vehiclePlate: 1 });
//# sourceMappingURL=pass-request.schema.js.map