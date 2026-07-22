/**
 * UI-права и маршрутизация по ролям (зеркало backend permissions).
 * Источник permissions — JWT/me (AccessConfigService на бэке).
 * canViewAllPasses=false для всей company (owner+employee): список компании
 * строится на бэке через team filter, не через permission view_all.
 */
import { ROLE_LABELS, User } from './api';

export function isTenantOwner(user: User | null | undefined): boolean {
  return !!user?.is_tenant_owner;
}

export function isTenantEmployee(user: User | null | undefined): boolean {
  return !!user?.parent_tenant_id;
}

export function isTenantCompanyUser(user: User | null | undefined): boolean {
  return isTenantOwner(user) || isTenantEmployee(user);
}

/** Owner после регистрации, is_active=false — ждёт админа (не путать с отключённым employee). */
export function isAwaitingAdminApproval(user: User | null | undefined): boolean {
  return !!user && user.is_active === false && isTenantOwner(user);
}

export function getUserRoleLabel(user: User | null | undefined): string {
  if (!user) return '';
  return user.role_label || ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] || user.role;
}

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
  if (isTenantCompanyUser(user)) return false;
  return hasPermission(user, 'passes.view_all') || isAdminPanelUser(user);
}

export function canViewPassCharts(user: User | null | undefined): boolean {
  return !isTenantCompanyUser(user);
}

/**
 * Можно ли заказывать пропуска.
 * Сотрудник/владелец компании — только если у компании есть закреплённые офисы;
 * иначе кнопка «Заказать» скрыта и форма недоступна.
 */
export function canOrderPasses(user: User | null | undefined): boolean {
  if (!hasPermission(user, 'passes.create')) return false;
  // Компания (owner + employee): только в свои офисы; без офисов — нельзя
  if (isTenantCompanyUser(user)) {
    return (user?.offices?.length ?? 0) > 0;
  }
  return true;
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
  if (isAwaitingAdminApproval(user)) return '/profile';
  if (user.role === 'security' && canUseReception(user)) return '/control';
  if (canViewPasses(user)) return '/passes';
  if (canOrderPasses(user)) return '/passes/new';
  if (canUseReception(user)) return '/control';
  if (isAdminPanelUser(user)) return '/admin';
  return '/profile';
}