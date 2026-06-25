"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequireAllPermissions = exports.RequirePermissions = exports.PERMISSIONS_ALL_KEY = exports.PERMISSIONS_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.PERMISSIONS_KEY = 'permissions';
exports.PERMISSIONS_ALL_KEY = 'permissions_all';
const RequirePermissions = (...permissions) => (0, common_1.SetMetadata)(exports.PERMISSIONS_KEY, permissions);
exports.RequirePermissions = RequirePermissions;
const RequireAllPermissions = (...permissions) => (0, common_1.SetMetadata)(exports.PERMISSIONS_ALL_KEY, permissions);
exports.RequireAllPermissions = RequireAllPermissions;
//# sourceMappingURL=permissions.decorator.js.map