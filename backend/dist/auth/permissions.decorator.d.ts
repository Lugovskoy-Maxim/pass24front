export declare const PERMISSIONS_KEY = "permissions";
export declare const PERMISSIONS_ALL_KEY = "permissions_all";
export declare const RequirePermissions: (...permissions: string[]) => import("@nestjs/common").CustomDecorator<string>;
export declare const RequireAllPermissions: (...permissions: string[]) => import("@nestjs/common").CustomDecorator<string>;
