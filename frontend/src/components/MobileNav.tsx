'use client';

/**
 * Нижняя навигация (sm only, .mobile-nav).
 * Пункты зависят от permissions; max 5. HelpFaq/PWA учитывают высоту nav.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { List, Plus, ClipboardList, User, Settings } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useConfig } from '@/hooks/useConfig';
import { canOrderPasses, canUseReception, canViewPasses, getHomePath, hasPermission } from '@/lib/permissions';
import { getUiLabels } from '@/lib/ui-labels';

export function MobileNav() {
  const { user } = useAuth();
  const config = useConfig();
  const pathname = usePathname();

  if (!user) return null;

  const L = getUiLabels(config);
  const homePath = getHomePath(user);

  const items = [
    { href: '/passes', label: L.nav.passes, icon: List, show: canViewPasses(user) },
    { href: '/passes/new', label: L.nav.orderPass, icon: Plus, show: canOrderPasses(user), accent: true },
    { href: '/control', label: L.nav.reception, icon: ClipboardList, show: canUseReception(user) },
    { href: '/profile', label: L.nav.profile, icon: User, show: true },
    { href: '/admin', label: L.nav.admin, icon: Settings, show: hasPermission(user, 'admin.panel') },
  ].filter((i) => i.show).slice(0, 5);

  return (
    <nav className="mobile-nav" aria-label="Основное меню">
      {items.map(({ href, label, icon: Icon, accent }) => {
        const active =
          pathname === href
          || (href !== '/admin' && href !== homePath && pathname.startsWith(href))
          || (href === '/admin' && pathname.startsWith('/admin'));
        return (
          <Link
            key={href}
            href={href}
            className={`mobile-nav__item ${active ? 'mobile-nav__item--active' : ''} ${accent ? 'mobile-nav__item--accent' : ''}`}
          >
            <Icon className="w-5 h-5" strokeWidth={active ? 2.25 : 2} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}