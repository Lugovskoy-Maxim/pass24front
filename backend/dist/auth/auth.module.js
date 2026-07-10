"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const passport_1 = require("@nestjs/passport");
const config_1 = require("@nestjs/config");
const mongoose_1 = require("@nestjs/mongoose");
const auth_controller_1 = require("./auth.controller");
const auth_service_1 = require("./auth.service");
const jwt_strategy_1 = require("./jwt.strategy");
const permissions_guard_1 = require("./permissions.guard");
const auth_database_module_1 = require("../database/auth-database.module");
const access_config_module_1 = require("../access/access-config.module");
const schemas_1 = require("../schemas");
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({
        imports: [
            access_config_module_1.AccessConfigModule,
            auth_database_module_1.AuthDatabaseModule.forFeature([
                { name: schemas_1.User.name, schema: schemas_1.UserSchema },
                { name: schemas_1.RegistrationPending.name, schema: schemas_1.RegistrationPendingSchema },
            ]),
            mongoose_1.MongooseModule.forFeature([
                { name: schemas_1.Office.name, schema: schemas_1.OfficeSchema },
                { name: schemas_1.Property.name, schema: schemas_1.PropertySchema },
            ]),
            passport_1.PassportModule.register({ defaultStrategy: 'jwt' }),
            jwt_1.JwtModule.registerAsync({
                imports: [config_1.ConfigModule],
                useFactory: (config) => ({
                    secret: config.get('JWT_SECRET') || 'dev-secret',
                    signOptions: { expiresIn: (config.get('JWT_EXPIRES_IN') || '7d') },
                }),
                inject: [config_1.ConfigService],
            }),
        ],
        controllers: [auth_controller_1.AuthController],
        providers: [auth_service_1.AuthService, jwt_strategy_1.JwtStrategy, permissions_guard_1.PermissionsGuard],
        exports: [auth_service_1.AuthService, jwt_1.JwtModule, permissions_guard_1.PermissionsGuard],
    })
], AuthModule);
//# sourceMappingURL=auth.module.js.map