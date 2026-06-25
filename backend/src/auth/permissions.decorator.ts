import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const PERMISSIONS_ALL_KEY = 'permissions_all';

/** Достаточно одного из перечисленных прав */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Нужны все перечисленные права */
export const RequireAllPermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_ALL_KEY, permissions);