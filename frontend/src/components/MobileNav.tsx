'use client';

/**
 * Нижняя навигация (sm only, .mobile-nav).
 * Пункты зависят от permissions; max 5. HelpFaq/PWA учитывают высоту nav.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useConfig } from '@/hooks/useConfig';
import { getPrimaryNavigation, isNavigationActive } from '@/lib/navigation';

export function MobileNav() {
  const { user } = useAuth();
  const config = useConfig();
  const pathname = usePathname();

  if (!user) return null;

  const items = getPrimaryNavigation(user, config).slice(0, 5);

  return (
    <nav className="mobile-nav" aria-label="Основное меню">
      {items.map(({ href, label, icon: Icon, accent }) => {
        const active = isNavigationActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
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
