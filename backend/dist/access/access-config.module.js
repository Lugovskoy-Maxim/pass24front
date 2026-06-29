"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccessConfigModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const access_config_schema_1 = require("../schemas/access-config.schema");
const access_config_service_1 = require("./access-config.service");
let AccessConfigModule = class AccessConfigModule {
};
exports.AccessConfigModule = AccessConfigModule;
exports.AccessConfigModule = AccessConfigModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([{ name: access_config_schema_1.AccessConfig.name, schema: access_config_schema_1.AccessConfigSchema }]),
        ],
        providers: [access_config_service_1.AccessConfigService],
        exports: [access_config_service_1.AccessConfigService],
    })
], AccessConfigModule);
//# sourceMappingURL=access-config.module.js.map