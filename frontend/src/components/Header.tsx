'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LogOut, Plus, List, ClipboardList, Settings, Bookmark, User } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useConfig } from '@/hooks/useConfig';
import { SiteBrand } from '@/components/SiteBrand';
import { ROLE_LABELS, formatTenantOffices } from '@/lib/api';
import { canSeeOverdueAlerts, canUseReception, canViewPasses, hasPermission } from '@/lib/permissions';
import { getUiLabels } from '@/lib/ui-labels';
import { useOverdueGuests } from '@/hooks/useOverdueGuests';
import { OverdueGuestsAlert } from '@/components/OverdueGuestsAlert';

export function Header() {
  const { user, logout } = useAuth();
  const config = useConfig();
  const pathname = usePathname();

  if (!user) return null;

  const L = getUiLabels(config);
  const showOverdueAlerts = canSeeOverdueAlerts(user);
  const { passes: overduePasses } = useOverdueGuests(showOverdueAlerts);

  const links = [
    { href: '/dashboard', label: L.nav.dashboard, icon: Home, show: true },
    { href: '/templates', label: L.nav.templates, icon: Bookmark, show: hasPermission(user, 'passes.templates') },
    { href: '/passes', label: L.nav.passes, icon: List, show: canViewPasses(user) },
    {
      href: '/passes/new',
      label: L.nav.orderPass,
      icon: Plus,
      show: hasPermission(user, 'passes.create') && !hasPermission(user, 'passes.templates'),
    },
    { href: '/control', label: L.nav.reception, icon: ClipboardList, show: canUseReception(user) },
    { href: '/profile', label: 'Профиль', icon: User, show: user.role === 'tenant' },
    { href: '/admin', label: L.nav.admin, icon: Settings, show: hasPermission(user, 'admin.panel') },
  ].filter((l) => l.show);

  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{ background: 'var(--header-bg)', borderColor: 'var(--header-border)' }}
    >
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" style={{ color: 'var(--header-text)' }}>
            <SiteBrand config={config} size="sm" variant="dark" className="max-w-[200px] sm:max-w-none" />
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {links.map(({ href, label, icon: Icon }) => {
              const active =
                pathname === href
                || (href !== '/dashboard' && href !== '/admin' && pathname.startsWith(href))
                || (href === '/admin' && pathname.startsWith('/admin'));
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm ${active ? 'nav-link-active' : 'nav-link'}`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {showOverdueAlerts && overduePasses.length > 0 && (
            <OverdueGuestsAlert passes={overduePasses} labels={L} compact />
          )}
          <div className="text-right hidden md:block" style={{ color: 'var(--header-text)' }}>
            <div className="text-sm font-medium">
              {user.role === 'tenant' ? (
                <Link href="/profile" className="hover:opacity-80 hover:underline">
                  {user.full_name}
                </Link>
              ) : user.full_name}
            </div>
            <div className="text-xs" style={{ color: 'var(--header-muted)' }}>
              {ROLE_LABELS[user.role]}
              {user.company && ` · ${user.company}`}
              {user.offices?.length
                ? ` · ${formatTenantOffices(user.offices)}`
                : user.office && ` · оф. ${user.office}`}
            </div>
          </div>
          <button
            onClick={logout}
            className="p-2 rounded transition-colors"
            style={{
              color: 'var(--header-muted)',
              border: '1px solid var(--header-border)',
              background: 'rgba(255,255,255,0.04)',
            }}
            title={L.nav.logout}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
      {showOverdueAlerts && overduePasses.length > 0 && (
        <div className="border-t border-amber-700/30 bg-amber-950/40">
          <div className="max-w-6xl mx-auto px-4 py-2">
            <OverdueGuestsAlert passes={overduePasses} labels={L} className="!p-3 !mb-0 !border-amber-700/30" />
          </div>
        </div>
      )}
    </header>
  );
}