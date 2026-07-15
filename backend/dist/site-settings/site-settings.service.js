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
const brand_defaults_1 = require("../brand/brand-defaults");
const ui_labels_defaults_1 = require("./ui-labels.defaults");
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
            await this.appSettingsModel.create({
                key: SETTINGS_KEY,
                ...brand_defaults_1.MSTYLE_BRAND_DEFAULTS,
            });
            return;
        }
        if ((0, brand_defaults_1.isLegacyBrandSettings)(existing)) {
            await this.appSettingsModel.updateOne({ key: SETTINGS_KEY }, { $set: { ...brand_defaults_1.MSTYLE_BRAND_DEFAULTS } });
        }
    }
    async get() {
        const doc = await this.appSettingsModel.findOne({ key: SETTINGS_KEY }).lean();
        return this.map(doc);
    }
    async update(data) {
        for (const field of ['siteIcon', 'siteIconLight', 'siteIconDark']) {
            const value = data[field];
            if (value !== undefined && value.length > MAX_ICON_LENGTH) {
                throw new common_1.BadRequestException('Иконка слишком большая. Загрузите файл до 80 КБ.');
            }
        }
        const update = {};
        if (data.siteName !== undefined)
            update.siteName = data.siteName.trim() || brand_defaults_1.MSTYLE_BRAND_DEFAULTS.siteName;
        if (data.siteIcon !== undefined)
            update.siteIcon = data.siteIcon.trim();
        if (data.siteIconLight !== undefined) {
            update.siteIconLight = data.siteIconLight.trim();
            update.siteIcon = data.siteIconLight.trim();
        }
        if (data.siteIconDark !== undefined)
            update.siteIconDark = data.siteIconDark.trim();
        if (data.siteTagline !== undefined)
            update.siteTagline = data.siteTagline.trim();
        if (data.sitePhone !== undefined)
            update.sitePhone = data.sitePhone.trim();
        if (data.siteEmail !== undefined)
            update.siteEmail = data.siteEmail.trim();
        if (data.brandMarkType !== undefined) {
            update.brandMarkType = data.brandMarkType === 'text' ? 'text' : 'image';
        }
        if (data.brandMarkText !== undefined) {
            update.brandMarkText = data.brandMarkText.trim().slice(0, 8) || brand_defaults_1.MSTYLE_BRAND_DEFAULTS.brandMarkText;
        }
        if (data.brandShowName !== undefined)
            update.brandShowName = !!data.brandShowName;
        if (data.brandNameBeforeMark !== undefined)
            update.brandNameBeforeMark = !!data.brandNameBeforeMark;
        if (data.uiIconSelectChevron !== undefined) {
            update.uiIconSelectChevron = data.uiIconSelectChevron.trim() || brand_defaults_1.MSTYLE_BRAND_DEFAULTS.uiIconSelectChevron;
        }
        if (data.themePrimary !== undefined) {
            update.themePrimary = this.normalizeHexColor(data.themePrimary, brand_defaults_1.MSTYLE_BRAND_DEFAULTS.themePrimary);
        }
        if (data.themePrimaryHover !== undefined) {
            update.themePrimaryHover = this.normalizeHexColor(data.themePrimaryHover, brand_defaults_1.MSTYLE_BRAND_DEFAULTS.themePrimaryHover);
        }
        if (data.uiLabels !== undefined) {
            update.uiLabels = (0, ui_labels_defaults_1.deepMergeUiLabels)(data.uiLabels);
        }
        if (data.smsRegistrationEnabled !== undefined) {
            update.smsRegistrationEnabled = !!data.smsRegistrationEnabled;
        }
        if (data.smsRegistrationDisabledMessage !== undefined) {
            const message = data.smsRegistrationDisabledMessage.trim();
            update.smsRegistrationDisabledMessage = message
                || brand_defaults_1.MSTYLE_BRAND_DEFAULTS.smsRegistrationDisabledMessage;
        }
        if (data.smsRegistrationCodeText !== undefined) {
            const text = data.smsRegistrationCodeText.trim();
            update.smsRegistrationCodeText = text.includes('{code}')
                ? text
                : brand_defaults_1.MSTYLE_BRAND_DEFAULTS.smsRegistrationCodeText;
        }
        const doc = await this.appSettingsModel
            .findOneAndUpdate({ key: SETTINGS_KEY }, { $set: update }, { new: true, upsert: true })
            .lean();
        return this.map(doc);
    }
    map(doc) {
        const legacyIcon = doc?.siteIcon?.trim() || '';
        const siteIconLight = doc?.siteIconLight?.trim() || legacyIcon || brand_defaults_1.MSTYLE_BRAND_DEFAULTS.siteIconLight;
        const siteIconDark = doc?.siteIconDark?.trim() || legacyIcon || brand_defaults_1.MSTYLE_BRAND_DEFAULTS.siteIconDark;
        return {
            siteName: doc?.siteName?.trim() || brand_defaults_1.MSTYLE_BRAND_DEFAULTS.siteName,
            siteIcon: siteIconLight,
            siteIconLight,
            siteIconDark,
            siteTagline: doc?.siteTagline?.trim() || brand_defaults_1.MSTYLE_BRAND_DEFAULTS.siteTagline,
            sitePhone: doc?.sitePhone?.trim() || brand_defaults_1.MSTYLE_BRAND_DEFAULTS.sitePhone,
            siteEmail: doc?.siteEmail?.trim() || brand_defaults_1.MSTYLE_BRAND_DEFAULTS.siteEmail,
            brandMarkType: doc?.brandMarkType === 'text' ? 'text' : 'image',
            brandMarkText: doc?.brandMarkText?.trim() || brand_defaults_1.MSTYLE_BRAND_DEFAULTS.brandMarkText,
            brandShowName: doc?.brandShowName !== false,
            brandNameBeforeMark: doc?.brandNameBeforeMark !== false,
            uiIconSelectChevron: doc?.uiIconSelectChevron?.trim() || brand_defaults_1.MSTYLE_BRAND_DEFAULTS.uiIconSelectChevron,
            themePrimary: this.normalizeHexColor(doc?.themePrimary, brand_defaults_1.MSTYLE_BRAND_DEFAULTS.themePrimary),
            themePrimaryHover: this.normalizeHexColor(doc?.themePrimaryHover, brand_defaults_1.MSTYLE_BRAND_DEFAULTS.themePrimaryHover),
            uiLabels: (0, ui_labels_defaults_1.deepMergeUiLabels)(doc?.uiLabels),
            smsRegistrationEnabled: doc?.smsRegistrationEnabled !== false,
            smsRegistrationDisabledMessage: doc?.smsRegistrationDisabledMessage?.trim()
                || brand_defaults_1.MSTYLE_BRAND_DEFAULTS.smsRegistrationDisabledMessage,
            smsRegistrationCodeText: doc?.smsRegistrationCodeText?.trim()?.includes('{code}')
                ? doc.smsRegistrationCodeText.trim()
                : brand_defaults_1.MSTYLE_BRAND_DEFAULTS.smsRegistrationCodeText,
        };
    }
    normalizeHexColor(value, fallback) {
        const trimmed = value?.trim() || '';
        return /^#[0-9A-Fa-f]{6}$/.test(trimmed) ? trimmed.toLowerCase() : fallback;
    }
};
exports.SiteSettingsService = SiteSettingsService;
exports.SiteSettingsService = SiteSettingsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(app_settings_schema_1.AppSettings.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], SiteSettingsService);
//# sourceMappingURL=site-settings.service.js.map