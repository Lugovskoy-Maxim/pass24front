'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, CreditCard, ScrollText, Settings, ArrowLeft, Shield,
} from 'lucide-react';
import { ProtectedLayout } from './ProtectedLayout';

const NAV = [
  { href: '/admin', label: 'Обзор', icon: LayoutDashboard, exact: true },
  { href: '/admin/users', label: 'Пользователи', icon: Users },
  { href: '/admin/pricing', label: 'Тарифы', icon: CreditCard },
  { href: '/admin/audit', label: 'Журнал действий', icon: ScrollText },
  { href: '/admin/settings', label: 'Настройки', icon: Settings },
];

export function AdminLayout({ children, title }: { children: React.ReactNode; title: string }) {
  const pathname = usePathname();

  return (
    <ProtectedLayout roles={['admin']}>
      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="lg:w-56 shrink-0">
          <div className="card p-4 sticky top-20">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[var(--border)]">
              <Shield className="w-5 h-5 text-[var(--primary)]" />
              <span className="font-semibold text-sm">Администрирование</span>
            </div>
            <nav className="space-y-1">
              {NAV.map(({ href, label, icon: Icon, exact }) => {
                const active = exact ? pathname === href : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                      active
                        ? 'bg-blue-50 text-[var(--primary)] font-medium'
                        : 'text-[var(--muted)] hover:bg-slate-50 hover:text-[var(--text)]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </Link>
                );
              })}
            </nav>
            <Link
              href="/dashboard"
              className="flex items-center gap-2 px-3 py-2 mt-4 text-sm text-[var(--muted)] hover:text-[var(--text)]"
            >
              <ArrowLeft className="w-4 h-4" />
              К приложению
            </Link>
          </div>
        </aside>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold mb-6">{title}</h1>
          {children}
        </div>
      </div>
    </ProtectedLayout>
  );
}