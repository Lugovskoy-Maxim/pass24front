import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessConfigService } from '../access/access-config.service';
import { PERMISSIONS_ALL_KEY, PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private accessConfigService: AccessConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const anyRequired = this.mergePermissions(context, PERMISSIONS_KEY);
    const allRequired = this.mergePermissions(context, PERMISSIONS_ALL_KEY);

    if (!anyRequired.length && !allRequired.length) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user?.role) throw new ForbiddenException('Нет доступа');

    const permissions = await this.accessConfigService.getPermissionsForRole(user.role);

    if (allRequired.length && !allRequired.every((p) => permissions.includes(p))) {
      throw new ForbiddenException('Недостаточно прав');
    }

    if (anyRequired.length && !anyRequired.some((p) => permissions.includes(p))) {
      throw new ForbiddenException('Недостаточно прав');
    }

    return true;
  }

  private mergePermissions(context: ExecutionContext, key: string): string[] {
    const handler = this.reflector.get<string[]>(key, context.getHandler()) || [];
    const cls = this.reflector.get<string[]>(key, context.getClass()) || [];
    return [...new Set([...cls, ...handler])];
  }
}