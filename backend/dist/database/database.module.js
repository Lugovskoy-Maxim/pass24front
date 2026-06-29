"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const mongoose_1 = require("@nestjs/mongoose");
const schemas_1 = require("../schemas");
const seed_service_1 = require("./seed.service");
const test_data_seed_service_1 = require("./test-data-seed.service");
const ALL_FEATURES = [
    { name: schemas_1.Property.name, schema: schemas_1.PropertySchema },
    { name: schemas_1.Office.name, schema: schemas_1.OfficeSchema },
    { name: schemas_1.User.name, schema: schemas_1.UserSchema },
    { name: schemas_1.Vehicle.name, schema: schemas_1.VehicleSchema },
    { name: schemas_1.Pass.name, schema: schemas_1.PassSchema },
    { name: schemas_1.PassTemplate.name, schema: schemas_1.PassTemplateSchema },
    { name: schemas_1.PassRequest.name, schema: schemas_1.PassRequestSchema },
    { name: schemas_1.AccessEvent.name, schema: schemas_1.AccessEventSchema },
    { name: schemas_1.Authorization.name, schema: schemas_1.AuthorizationSchema },
    { name: schemas_1.AuditLog.name, schema: schemas_1.AuditLogSchema },
    { name: schemas_1.AppSettings.name, schema: schemas_1.AppSettingsSchema },
];
let DatabaseModule = class DatabaseModule {
    static forFeature() {
        return mongoose_1.MongooseModule.forFeature(ALL_FEATURES);
    }
    static forFeatureOnly(models) {
        return mongoose_1.MongooseModule.forFeature(models);
    }
};
exports.DatabaseModule = DatabaseModule;
exports.DatabaseModule = DatabaseModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forRootAsync({
                imports: [config_1.ConfigModule],
                useFactory: (configService) => {
                    const uri = configService.get('MONGODB_URI') || 'mongodb://localhost:27017/pass24';
                    console.log(`🔌 Connecting to MongoDB at: ${uri.replace(/:[^:]*@/, ':****@')}`);
                    return {
                        uri,
                        serverSelectionTimeoutMS: 5000,
                        socketTimeoutMS: 45000,
                    };
                },
                inject: [config_1.ConfigService],
            }),
            mongoose_1.MongooseModule.forFeature([
                { name: schemas_1.User.name, schema: schemas_1.UserSchema },
                { name: schemas_1.Property.name, schema: schemas_1.PropertySchema },
                { name: schemas_1.Office.name, schema: schemas_1.OfficeSchema },
            ]),
        ],
        providers: [seed_service_1.SeedService, test_data_seed_service_1.TestDataSeedService],
        exports: [mongoose_1.MongooseModule, test_data_seed_service_1.TestDataSeedService],
    })
], DatabaseModule);
//# sourceMappingURL=database.module.js.map