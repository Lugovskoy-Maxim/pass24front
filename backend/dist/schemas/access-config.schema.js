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
exports.AccessConfigSchema = exports.AccessConfig = void 0;
const mongoose_1 = require("@nestjs/mongoose");
let AccessConfig = class AccessConfig {
    key;
    enabledPassTypes;
    rolePermissions;
    roleLabels;
};
exports.AccessConfig = AccessConfig;
__decorate([
    (0, mongoose_1.Prop)({ required: true, unique: true, default: 'default' }),
    __metadata("design:type", String)
], AccessConfig.prototype, "key", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [String], default: ['visitor', 'parking', 'delivery', 'contractor'] }),
    __metadata("design:type", Array)
], AccessConfig.prototype, "enabledPassTypes", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        type: Object,
        default: {
            tenant: ['passes.create', 'passes.templates', 'passes.view_own'],
            security: ['passes.view_all', 'passes.approve', 'passes.reception', 'passes.lookup'],
            bc_admin: [
                'passes.view_all',
                'passes.approve',
                'passes.reception',
                'passes.lookup',
                'admin.panel',
                'admin.users',
                'admin.offices',
                'admin.settings',
            ],
            admin: [
                'passes.create',
                'passes.templates',
                'passes.view_own',
                'passes.view_all',
                'passes.approve',
                'passes.reception',
                'passes.lookup',
                'admin.panel',
                'admin.users',
                'admin.offices',
                'admin.settings',
                'admin.permissions',
            ],
        },
    }),
    __metadata("design:type", Object)
], AccessConfig.prototype, "rolePermissions", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object, default: {} }),
    __metadata("design:type", Object)
], AccessConfig.prototype, "roleLabels", void 0);
exports.AccessConfig = AccessConfig = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true, collection: 'access_config' })
], AccessConfig);
exports.AccessConfigSchema = mongoose_1.SchemaFactory.createForClass(AccessConfig);
//# sourceMappingURL=access-config.schema.js.map