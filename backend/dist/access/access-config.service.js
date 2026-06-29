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
exports.AccessConfigService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const access_config_schema_1 = require("../schemas/access-config.schema");
const access_constants_1 = require("./access.constants");
let AccessConfigService = class AccessConfigService {
    accessConfigModel;
    constructor(accessConfigModel) {
        this.accessConfigModel = accessConfigModel;
    }
    async onModuleInit() {
        await this.ensureDefaults();
    }
    async ensureDefaults() {
        const existing = await this.accessConfigModel.findOne({ key: 'default' });
        if (!existing) {
            await this.accessConfigModel.create({
                key: 'default',
                enabledPassTypes: [...access_constants_1.ALL_PASS_TYPES],
                rolePermissions: { ...access_constants_1.DEFAULT_ROLE_PERMISSIONS },
            });
            return;
        }
        let changed = false;
        const validKeys = new Set(access_constants_1.ALL_PERMISSIONS.map((p) => p.key));
        for (const [role, defaults] of Object.entries(access_constants_1.DEFAULT_ROLE_PERMISSIONS)) {
            if (!existing.rolePermissions[role]) {
                existing.rolePermissions[role] = [...defaults];
                changed = true;
            }
        }
        for (const [role, perms] of Object.entries(existing.rolePermissions)) {
            const sanitized = [...new Set((perms || []).filter((p) => validKeys.has(p)))];
            const defaults = access_constants_1.DEFAULT_ROLE_PERMISSIONS[role] || [];
            for (const perm of defaults) {
                if (!sanitized.includes(perm)) {
                    sanitized.push(perm);
                    changed = true;
                }
            }
            if (role === 'admin' && !sanitized.includes('admin.permissions')) {
                sanitized.push('admin.permissions');
                changed = true;
            }
            if (sanitized.length !== perms.length || sanitized.some((p, i) => p !== perms[i])) {
                existing.rolePermissions[role] = sanitized;
                changed = true;
            }
        }
        if (changed) {
            existing.markModified('rolePermissions');
            await existing.save();
        }
    }
    async getConfig() {
        await this.ensureDefaults();
        const doc = await this.accessConfigModel.findOne({ key: 'default' }).lean();
        return this.mapConfig(doc);
    }
    async updateConfig(data) {
        await this.ensureDefaults();
        const doc = await this.accessConfigModel.findOne({ key: 'default' });
        if (!doc)
            throw new common_1.BadRequestException('Конфигурация не найдена');
        if (data.enabledPassTypes) {
            const invalid = data.enabledPassTypes.filter((t) => !access_constants_1.ALL_PASS_TYPES.includes(t));
            if (invalid.length) {
                throw new common_1.BadRequestException(`Неизвестные типы пропусков: ${invalid.join(', ')}`);
            }
            if (data.enabledPassTypes.length === 0) {
                throw new common_1.BadRequestException('Должен быть включён хотя бы один тип пропуска');
            }
            doc.enabledPassTypes = data.enabledPassTypes;
        }
        if (data.rolePermissions) {
            const validKeys = new Set(access_constants_1.ALL_PERMISSIONS.map((p) => p.key));
            for (const [role, perms] of Object.entries(data.rolePermissions)) {
                doc.rolePermissions[role] = (perms || []).filter((p) => validKeys.has(p));
            }
            for (const [role, defaults] of Object.entries(access_constants_1.DEFAULT_ROLE_PERMISSIONS)) {
                const current = doc.rolePermissions[role] || [];
                if (current.includes('admin.panel')) {
                    for (const perm of ['passes.view_all', 'passes.reception', 'passes.lookup', ...defaults]) {
                        if (!current.includes(perm))
                            current.push(perm);
                    }
                    doc.rolePermissions[role] = current;
                }
            }
            if (!doc.rolePermissions.admin?.includes('admin.permissions')) {
                doc.rolePermissions.admin = [
                    ...new Set([...(doc.rolePermissions.admin || []), 'admin.permissions']),
                ];
            }
            doc.markModified('rolePermissions');
        }
        await doc.save();
        return { config: this.mapConfig(doc.toObject()) };
    }
    async getPermissionsForRole(role) {
        const { rolePermissions } = await this.getConfig();
        return rolePermissions[role] || [];
    }
    async isPassTypeEnabled(passType) {
        const { enabledPassTypes } = await this.getConfig();
        return enabledPassTypes.includes(passType);
    }
    async hasPermission(role, permission) {
        const perms = await this.getPermissionsForRole(role);
        return perms.includes(permission);
    }
    async canViewAllPasses(role) {
        if (role === 'tenant')
            return false;
        if (await this.hasPermission(role, 'passes.view_all'))
            return true;
        return this.hasPermission(role, 'admin.panel');
    }
    mapConfig(doc) {
        const mergedRoles = {
            ...access_constants_1.DEFAULT_ROLE_PERMISSIONS,
            ...doc.rolePermissions,
        };
        return {
            enabledPassTypes: doc.enabledPassTypes,
            rolePermissions: doc.rolePermissions,
            permissions: access_constants_1.ALL_PERMISSIONS,
            passTypeLabels: access_constants_1.PASS_TYPE_LABELS,
            roleLabels: access_constants_1.ROLE_LABELS,
            roles: Object.keys(mergedRoles),
        };
    }
};
exports.AccessConfigService = AccessConfigService;
exports.AccessConfigService = AccessConfigService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(access_config_schema_1.AccessConfig.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], AccessConfigService);
//# sourceMappingURL=access-config.service.js.map