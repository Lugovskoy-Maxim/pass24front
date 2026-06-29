"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SiteSettingsModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const app_settings_schema_1 = require("../schemas/app-settings.schema");
const site_settings_service_1 = require("./site-settings.service");
let SiteSettingsModule = class SiteSettingsModule {
};
exports.SiteSettingsModule = SiteSettingsModule;
exports.SiteSettingsModule = SiteSettingsModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([{ name: app_settings_schema_1.AppSettings.name, schema: app_settings_schema_1.AppSettingsSchema }]),
        ],
        providers: [site_settings_service_1.SiteSettingsService],
        exports: [site_settings_service_1.SiteSettingsService],
    })
], SiteSettingsModule);
//# sourceMappingURL=site-settings.module.js.map