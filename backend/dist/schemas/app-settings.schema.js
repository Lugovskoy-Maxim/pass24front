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
exports.AppSettingsSchema = exports.AppSettings = void 0;
const mongoose_1 = require("@nestjs/mongoose");
let AppSettings = class AppSettings {
    key;
    siteName;
    siteIcon;
    siteIconLight;
    siteIconDark;
    siteTagline;
    sitePhone;
    siteEmail;
    brandMarkType;
    brandMarkText;
    brandShowName;
    brandNameBeforeMark;
    uiIconSelectChevron;
    themePrimary;
    themePrimaryHover;
    uiLabels;
    smsRegistrationEnabled;
    smsRegistrationDisabledMessage;
    smsRegistrationCodeText;
};
exports.AppSettings = AppSettings;
__decorate([
    (0, mongoose_1.Prop)({ required: true, unique: true, default: 'global' }),
    __metadata("design:type", String)
], AppSettings.prototype, "key", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'M-STYLE' }),
    __metadata("design:type", String)
], AppSettings.prototype, "siteName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '/brand/mstyle-logo-light.svg' }),
    __metadata("design:type", String)
], AppSettings.prototype, "siteIcon", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '/brand/mstyle-logo-light.svg' }),
    __metadata("design:type", String)
], AppSettings.prototype, "siteIconLight", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '/brand/mstyle-logo.svg' }),
    __metadata("design:type", String)
], AppSettings.prototype, "siteIconDark", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'Пропуска для арендаторов бизнес-центра' }),
    __metadata("design:type", String)
], AppSettings.prototype, "siteTagline", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '+7 495 663-00-00' }),
    __metadata("design:type", String)
], AppSettings.prototype, "sitePhone", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'renta@mstyle.ru' }),
    __metadata("design:type", String)
], AppSettings.prototype, "siteEmail", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'image' }),
    __metadata("design:type", String)
], AppSettings.prototype, "brandMarkType", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'M' }),
    __metadata("design:type", String)
], AppSettings.prototype, "brandMarkText", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: true }),
    __metadata("design:type", Boolean)
], AppSettings.prototype, "brandShowName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: true }),
    __metadata("design:type", Boolean)
], AppSettings.prototype, "brandNameBeforeMark", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'chevron-down' }),
    __metadata("design:type", String)
], AppSettings.prototype, "uiIconSelectChevron", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '#eb711c' }),
    __metadata("design:type", String)
], AppSettings.prototype, "themePrimary", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '#d55700' }),
    __metadata("design:type", String)
], AppSettings.prototype, "themePrimaryHover", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object, default: {} }),
    __metadata("design:type", Object)
], AppSettings.prototype, "uiLabels", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: true }),
    __metadata("design:type", Boolean)
], AppSettings.prototype, "smsRegistrationEnabled", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'Скоро функция будет работать' }),
    __metadata("design:type", String)
], AppSettings.prototype, "smsRegistrationDisabledMessage", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'Код подтверждения регистрации: {code}. Действует 15 минут.' }),
    __metadata("design:type", String)
], AppSettings.prototype, "smsRegistrationCodeText", void 0);
exports.AppSettings = AppSettings = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true, collection: 'app_settings' })
], AppSettings);
exports.AppSettingsSchema = mongoose_1.SchemaFactory.createForClass(AppSettings);
//# sourceMappingURL=app-settings.schema.js.map