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
exports.JwtStrategy = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const passport_jwt_1 = require("passport-jwt");
const config_1 = require("@nestjs/config");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const access_config_service_1 = require("../access/access-config.service");
const auth_database_constants_1 = require("../database/auth-database.constants");
const schemas_1 = require("../schemas");
let JwtStrategy = class JwtStrategy extends (0, passport_1.PassportStrategy)(passport_jwt_1.Strategy) {
    configService;
    userModel;
    accessConfigService;
    constructor(configService, userModel, accessConfigService) {
        super({
            jwtFromRequest: passport_jwt_1.ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get('JWT_SECRET') || 'dev-secret',
        });
        this.configService = configService;
        this.userModel = userModel;
        this.accessConfigService = accessConfigService;
    }
    async validate(payload) {
        const user = await this.userModel.findById(payload.sub);
        if (!user || user.isActive === false) {
            throw new common_1.UnauthorizedException();
        }
        const permissions = await this.accessConfigService.getPermissionsForRole(user.role || 'tenant');
        return {
            userId: payload.sub,
            email: payload.email,
            role: user.role || payload.role,
            fullName: user.fullName,
            parentTenantId: user.parentTenantId?.toString(),
            permissions,
        };
    }
};
exports.JwtStrategy = JwtStrategy;
exports.JwtStrategy = JwtStrategy = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, mongoose_1.InjectModel)(schemas_1.User.name, auth_database_constants_1.AUTH_CONNECTION)),
    __metadata("design:paramtypes", [config_1.ConfigService,
        mongoose_2.Model,
        access_config_service_1.AccessConfigService])
], JwtStrategy);
//# sourceMappingURL=jwt.strategy.js.map