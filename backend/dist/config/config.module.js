"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigModule = void 0;
const common_1 = require("@nestjs/common");
const database_module_1 = require("../database/database.module");
const property_schema_1 = require("../schemas/property.schema");
const app_config_service_1 = require("./app-config.service");
const config_controller_1 = require("./config.controller");
let ConfigModule = class ConfigModule {
};
exports.ConfigModule = ConfigModule;
exports.ConfigModule = ConfigModule = __decorate([
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule.forFeatureOnly([{ name: property_schema_1.Property.name, schema: property_schema_1.PropertySchema }])],
        controllers: [config_controller_1.ConfigController],
        providers: [app_config_service_1.AppConfigService],
    })
], ConfigModule);
//# sourceMappingURL=config.module.js.map