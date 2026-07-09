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

export function isAdminPanelUser(user: User | null | undefined): boolean {
  return hasPermission(user, 'admin.panel');
}

export function canViewPasses(user: User | null | undefined): boolean {
  return hasAnyPermission(user, 'passes.view_own', 'passes.view_all') || isAdminPanelUser(user);
}

export function canViewAllPasses(user: User | null | undefined): boolean {
  if (user?.role === 'tenant') return false;
  return hasPermission(user, 'passes.view_all') || isAdminPanelUser(user);
}

export function canViewPassCharts(user: User | null | undefined): boolean {
  return user?.role !== 'tenant';
}

/** Арендатор без назначенного офиса не может заказывать пропуска. */
export function canOrderPasses(user: User | null | undefined): boolean {
  if (!hasPermission(user, 'passes.create')) return false;
  if (user?.role !== 'tenant') return true;
  return (user.offices?.length ?? 0) > 0;
}

export function canUseReception(user: User | null | undefined): boolean {
  return hasAnyPermission(user, 'passes.reception', 'passes.lookup') || isAdminPanelUser(user);
}

/** Одобрение и дополнение пропуска после сканирования QR */
export function canManageTicketScan(user: User | null | undefined): boolean {
  return hasAnyPermission(user, 'passes.approve', 'passes.reception') || isAdminPanelUser(user);
}

export function canSeeOverdueAlerts(user: User | null | undefined): boolean {
  return canUseReception(user) || canViewAllPasses(user);
}

/** Стартовая страница после входа — без дублирующей «Главной». */
export function getHomePath(user: User | null | undefined): string {
  if (!user) return '/login';
  if (canViewPasses(user)) return '/passes';
  if (hasPermission(user, 'passes.templates')) return '/templates';
  if (canUseReception(user)) return '/control';
  if (isAdminPanelUser(user)) return '/admin';
  return '/profile';
}