'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LogOut, Plus, List, ClipboardList, Settings, Bookmark } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useConfig } from '@/hooks/useConfig';
import { SiteBrand } from '@/components/SiteBrand';
import { ROLE_LABELS, formatTenantOffices } from '@/lib/api';
import { canUseReception, canViewPasses, hasPermission } from '@/lib/permissions';

export function Header() {
  const { user, logout } = useAuth();
  const config = useConfig();
  const pathname = usePathname();

  if (!user) return null;

  const links = [
    { href: '/dashboard', label: 'Главная', icon: Home, show: true },
    { href: '/templates', label: 'Шаблоны', icon: Bookmark, show: hasPermission(user, 'passes.templates') },
    { href: '/passes', label: 'Пропуска', icon: List, show: canViewPasses(user) },
    {
      href: '/passes/new',
      label: 'Заказать',
      icon: Plus,
      show: hasPermission(user, 'passes.create') && !hasPermission(user, 'passes.templates'),
    },
    { href: '/control', label: 'Ресепшн', icon: ClipboardList, show: canUseReception(user) },
    { href: '/admin', label: 'Админ', icon: Settings, show: hasPermission(user, 'admin.panel') },
  ].filter((l) => l.show);

  return (
    <header className="bg-white border-b border-[var(--border)] sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-[var(--primary)]">
            <SiteBrand config={config} size="sm" className="max-w-[200px] sm:max-w-none" />
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {links.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  pathname === href || (href !== '/dashboard' && href !== '/admin' && pathname.startsWith(href))
                  || (href === '/admin' && pathname.startsWith('/admin'))
                    ? 'bg-blue-50 text-[var(--primary)] font-medium'
                    : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-slate-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden md:block">
            <div className="text-sm font-medium">{user.full_name}</div>
            <div className="text-xs text-[var(--muted)]">
              {ROLE_LABELS[user.role]}
              {user.company && ` · ${user.company}`}
              {user.offices?.length
                ? ` · ${formatTenantOffices(user.offices)}`
                : user.office && ` · оф. ${user.office}`}
            </div>
          </div>
          <button onClick={logout} className="btn btn-secondary p-2" title="Выйти">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}