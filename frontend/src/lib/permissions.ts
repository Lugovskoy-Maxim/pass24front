import { User } from './api';

export function hasPermission(user: User | null | undefined, permission: string): boolean {
  return !!user?.permissions?.includes(permission);
}

export function hasAnyPermission(user: User | null | undefined, ...permissions: string[]): boolean {
  if (!user?.permissions) return false;
  return permissions.some((p) => user.permissions!.includes(p));
}

export function hasAllPermissions(user: User | null | undefined, ...permissions: string[]): boolean {
  if (!user?.permissions) return false;
  return permissions.every((p) => user.permissions!.includes(p));
}