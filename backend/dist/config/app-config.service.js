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
exports.AppConfigService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const property_schema_1 = require("../schemas/property.schema");
const enums_1 = require("../schemas/enums");
const site_settings_service_1 = require("../site-settings/site-settings.service");
let AppConfigService = class AppConfigService {
    siteSettingsService;
    propertyModel;
    constructor(siteSettingsService, propertyModel) {
        this.siteSettingsService = siteSettingsService;
        this.propertyModel = propertyModel;
    }
    async getPublicConfig() {
        const site = await this.siteSettingsService.get();
        const property = await this.propertyModel
            .findOne({ type: enums_1.PropertyType.BUSINESS_CENTER, isActive: true })
            .sort({ createdAt: 1 })
            .lean();
        const s = property?.settings || {};
        return {
            siteName: site.siteName,
            siteIcon: site.siteIcon,
            siteTagline: site.siteTagline,
            sitePhone: site.sitePhone,
            siteEmail: site.siteEmail,
            brandMarkType: site.brandMarkType,
            brandMarkText: site.brandMarkText,
            brandShowName: site.brandShowName,
            brandNameBeforeMark: site.brandNameBeforeMark,
            uiIconSelectChevron: site.uiIconSelectChevron,
            businessCenterName: property?.name || site.siteName,
            workingHoursFrom: s.working_hours_from || '08:00',
            workingHoursTo: s.working_hours_to || '20:00',
            contactPhone: s.contact_phone || site.sitePhone,
            contactEmail: s.contact_email || site.siteEmail,
            receptionFloor: s.reception_floor || '1',
            uiLabels: site.uiLabels,
        };
    }
};
exports.AppConfigService = AppConfigService;
exports.AppConfigService = AppConfigService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, mongoose_1.InjectModel)(property_schema_1.Property.name)),
    __metadata("design:paramtypes", [site_settings_service_1.SiteSettingsService,
        mongoose_2.Model])
], AppConfigService);
//# sourceMappingURL=app-config.service.js.map