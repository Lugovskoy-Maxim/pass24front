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
exports.SiteSettingsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const app_settings_schema_1 = require("../schemas/app-settings.schema");
const SETTINGS_KEY = 'global';
const MAX_ICON_LENGTH = 120_000;
let SiteSettingsService = class SiteSettingsService {
    appSettingsModel;
    constructor(appSettingsModel) {
        this.appSettingsModel = appSettingsModel;
    }
    async onModuleInit() {
        await this.ensureDefaults();
    }
    async ensureDefaults() {
        const existing = await this.appSettingsModel.findOne({ key: SETTINGS_KEY });
        if (!existing) {
            await this.appSettingsModel.create({ key: SETTINGS_KEY });
        }
    }
    async get() {
        const doc = await this.appSettingsModel.findOne({ key: SETTINGS_KEY }).lean();
        return this.map(doc);
    }
    async update(data) {
        if (data.siteIcon !== undefined && data.siteIcon.length > MAX_ICON_LENGTH) {
            throw new common_1.BadRequestException('Иконка слишком большая. Загрузите файл до 80 КБ.');
        }
        const update = {};
        if (data.siteName !== undefined)
            update.siteName = data.siteName.trim() || 'PASS24';
        if (data.siteIcon !== undefined)
            update.siteIcon = data.siteIcon.trim();
        if (data.siteTagline !== undefined)
            update.siteTagline = data.siteTagline.trim();
        if (data.sitePhone !== undefined)
            update.sitePhone = data.sitePhone.trim();
        if (data.siteEmail !== undefined)
            update.siteEmail = data.siteEmail.trim();
        const doc = await this.appSettingsModel
            .findOneAndUpdate({ key: SETTINGS_KEY }, { $set: update }, { new: true, upsert: true })
            .lean();
        return this.map(doc);
    }
    map(doc) {
        return {
            siteName: doc?.siteName || 'PASS24',
            siteIcon: doc?.siteIcon || '',
            siteTagline: doc?.siteTagline || 'Пропуска для арендаторов бизнес-центра',
            sitePhone: doc?.sitePhone || '+7 (495) 123-45-67',
            siteEmail: doc?.siteEmail || 'info@pass24.local',
        };
    }
};
exports.SiteSettingsService = SiteSettingsService;
exports.SiteSettingsService = SiteSettingsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(app_settings_schema_1.AppSettings.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], SiteSettingsService);
//# sourceMappingURL=site-settings.service.js.map