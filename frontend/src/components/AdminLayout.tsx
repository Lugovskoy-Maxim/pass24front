'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, ScrollText, ArrowLeft, Shield, DoorOpen, KeyRound, Globe,
} from 'lucide-react';
import { ProtectedLayout } from './ProtectedLayout';
import { useAuth } from '@/lib/auth';
import { getHomePath, hasPermission } from '@/lib/permissions';

const NAV = [
  { href: '/admin', label: 'Обзор', icon: LayoutDashboard, exact: true },
  { href: '/admin/users', label: 'Пользователи', icon: Users, permission: 'admin.users' },
  { href: '/admin/offices', label: 'Офисы', icon: DoorOpen, permission: 'admin.offices' },
  { href: '/admin/permissions', label: 'Права и пропуска', icon: KeyRound, permission: 'admin.permissions' },
  { href: '/admin/audit', label: 'Журнал действий', icon: ScrollText },
  { href: '/admin/site', label: 'Базовые настройки', icon: Globe, permission: 'admin.settings' },
];

export function AdminLayout({ children, title }: { children: React.ReactNode; title: string }) {
  const pathname = usePathname();
  const { user } = useAuth();

  const links = NAV.filter((item) => !item.permission || hasPermission(user, item.permission));

  return (
    <ProtectedLayout permissions={['admin.panel']}>
      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="lg:w-56 shrink-0">
          <div className="card p-4 sticky top-20">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[var(--border)]">
              <Shield className="w-5 h-5 text-[var(--primary)]" />
              <span className="font-semibold text-sm">Администрирование</span>
            </div>
            <nav className="space-y-1">
              {links.map(({ href, label, icon: Icon, exact }) => {
                const active = exact ? pathname === href : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-2 px-3 py-2 rounded text-sm ${
                      active ? 'nav-link-light-active' : 'nav-link-light'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </Link>
                );
              })}
            </nav>
            <Link
              href={getHomePath(user)}
              className="flex items-center gap-2 px-3 py-2 mt-4 text-sm text-[var(--muted)] hover:text-[var(--accent)]"
            >
              <ArrowLeft className="w-4 h-4" />
              К приложению
            </Link>
          </div>
        </aside>
        <div className="flex-1 min-w-0">
          <h1 className="page-title mb-6">{title}</h1>
          {children}
        </div>
      </div>
    </ProtectedLayout>
  );
}