import { ALL_PERMISSIONS } from './access.constants';

export const TENANT_EMPLOYEE_ASSIGNABLE_PERMISSIONS = [
  'passes.create',
  'passes.templates',
  'passes.view_own',
] as const;

export const DEFAULT_TENANT_EMPLOYEE_CATEGORY_PERMISSIONS = [
  'passes.create',
  'passes.view_own',
] as const;

export const TENANT_EMPLOYEE_ASSIGNABLE_PERMISSION_META = ALL_PERMISSIONS.filter((item) =>
  (TENANT_EMPLOYEE_ASSIGNABLE_PERMISSIONS as readonly string[]).includes(item.key),
);

export function sanitizeTenantEmployeePermissions(permissions?: string[]): string[] {
  const allowed = new Set<string>(TENANT_EMPLOYEE_ASSIGNABLE_PERMISSIONS);
  return [...new Set((permissions || []).filter((key) => allowed.has(key)))];
}