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
exports.AccessEventSchema = exports.AccessEvent = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const enums_1 = require("./enums");
let AccessEvent = class AccessEvent {
    timestamp;
    type;
    property;
    pass;
    passRequest;
    vehicle;
    vehiclePlate;
    guestName;
    actor;
    actorName;
    gate;
    comment;
    meta;
};
exports.AccessEvent = AccessEvent;
__decorate([
    (0, mongoose_1.Prop)({ type: Date, default: Date.now, index: true }),
    __metadata("design:type", Date)
], AccessEvent.prototype, "timestamp", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, enum: enums_1.EventType, index: true }),
    __metadata("design:type", String)
], AccessEvent.prototype, "type", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Property', required: true, index: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], AccessEvent.prototype, "property", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Pass' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], AccessEvent.prototype, "pass", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'PassRequest' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], AccessEvent.prototype, "passRequest", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Vehicle' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], AccessEvent.prototype, "vehicle", void 0);
__decorate([
    (0, mongoose_1.Prop)({ uppercase: true, trim: true }),
    __metadata("design:type", String)
], AccessEvent.prototype, "vehiclePlate", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], AccessEvent.prototype, "guestName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], AccessEvent.prototype, "actor", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], AccessEvent.prototype, "actorName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], AccessEvent.prototype, "gate", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], AccessEvent.prototype, "comment", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object, default: {} }),
    __metadata("design:type", Object)
], AccessEvent.prototype, "meta", void 0);
exports.AccessEvent = AccessEvent = __decorate([
    (0, mongoose_1.Schema)({ timestamps: { createdAt: true, updatedAt: false }, collection: 'access_events' })
], AccessEvent);
exports.AccessEventSchema = mongoose_1.SchemaFactory.createForClass(AccessEvent);
exports.AccessEventSchema.index({ property: 1, timestamp: -1 });
exports.AccessEventSchema.index({ type: 1, timestamp: -1 });
exports.AccessEventSchema.index({ vehiclePlate: 1, timestamp: -1 });
exports.AccessEventSchema.index({ pass: 1, timestamp: -1 });
exports.AccessEventSchema.index({ actor: 1, timestamp: -1 });
//# sourceMappingURL=access-event.schema.js.map