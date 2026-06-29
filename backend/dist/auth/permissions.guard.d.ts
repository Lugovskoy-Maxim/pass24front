import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessConfigService } from '../access/access-config.service';
export declare class PermissionsGuard implements CanActivate {
    private reflector;
    private accessConfigService;
    constructor(reflector: Reflector, accessConfigService: AccessConfigService);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private mergePermissions;
}
