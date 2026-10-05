import {
  ClipboardList,
  List,
  MessageSquare,
  Plus,
  Settings,
  User as UserIcon,
} from 'lucide-react';
import type { BcConfig, User } from './api';
import {
  canOrderPasses,
  canUseReception,
  canUseTenantServiceRequests,
  canViewPasses,
  hasPermission,
} from './permissions';
import { getUiLabels } from './ui-labels';

/** Общие разделы для верхнего меню и мобильной панели. */
export function getPrimaryNavigation(user: User, config: BcConfig | null) {
  const labels = getUiLabels(config).nav;
  return [
    {
      href: '/passes',
      label: labels.passes,
      icon: List,
      show: canViewPasses(user),
    },
    {
      href: '/passes/new',
      label: labels.orderPass,
      icon: Plus,
      show: canOrderPasses(user),
      accent: true,
    },
    {
      href: '/control',
      label: labels.reception,
      icon: ClipboardList,
      show: canUseReception(user),
    },
    { href: '/profile', label: labels.profile, icon: UserIcon, show: true },
    {
      href: '/requests',
      label: 'Обращения',
      icon: MessageSquare,
      show: canUseTenantServiceRequests(user, config),
    },
    {
      href: '/admin',
      label: labels.admin,
      icon: Settings,
      show: hasPermission(user, 'admin.panel'),
    },
  ].filter((item) => item.show);
}

export function isNavigationActive(pathname: string, href: string): boolean {
  if (
    href === '/passes' &&
    (pathname === '/passes/new' || pathname.startsWith('/passes/new/'))
  ) {
    return false;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
