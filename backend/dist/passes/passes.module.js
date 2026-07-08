"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PassesModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("../auth/auth.module");
const auth_database_module_1 = require("../database/auth-database.module");
const database_module_1 = require("../database/database.module");
const schemas_1 = require("../schemas");
const pass_templates_controller_1 = require("./pass-templates.controller");
const pass_templates_service_1 = require("./pass-templates.service");
const passes_controller_1 = require("./passes.controller");
const passes_public_controller_1 = require("./passes-public.controller");
const passes_service_1 = require("./passes.service");
let PassesModule = class PassesModule {
};
exports.PassesModule = PassesModule;
exports.PassesModule = PassesModule = __decorate([
    (0, common_1.Module)({
        imports: [
            database_module_1.DatabaseModule.forFeature(),
            auth_database_module_1.AuthDatabaseModule.forFeature([{ name: schemas_1.User.name, schema: schemas_1.UserSchema }]),
            auth_module_1.AuthModule,
        ],
        controllers: [passes_controller_1.PassesController, passes_public_controller_1.PassesPublicController, pass_templates_controller_1.PassTemplatesController],
        providers: [passes_service_1.PassesService, pass_templates_service_1.PassTemplatesService],
        exports: [passes_service_1.PassesService, pass_templates_service_1.PassTemplatesService],
    })
], PassesModule);
//# sourceMappingURL=passes.module.js.map