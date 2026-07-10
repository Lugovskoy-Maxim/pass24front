import { SYSTEM_ROLES } from '../access/access.constants';

export function isTenantOwner(user?: { role?: string; parentTenantId?: unknown }) {
  return user?.role === 'tenant' && !user?.parentTenantId;
}

export function isTenantEmployee(user?: { parentTenantId?: unknown }) {
  return !!user?.parentTenantId;
}

export function isTenantCompanyUser(user?: { role?: string; parentTenantId?: unknown }) {
  return user?.role === 'tenant' || !!user?.parentTenantId;
}

export const EMPLOYEE_ROLE_EXCLUSIONS = new Set<string>(SYSTEM_ROLES);

export function isEmployeeAssignableRole(role: string) {
  return !!role && !EMPLOYEE_ROLE_EXCLUSIONS.has(role);
}