'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, LogOut, Plus, List, ClipboardList } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { ROLE_LABELS } from '@/lib/api';

export function Header() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const isSecurity = user.role === 'security' || user.role === 'admin';

  const links = [
    { href: '/dashboard', label: 'Главная', icon: Shield },
    { href: '/passes', label: 'Заявки', icon: List },
    ...(user.role === 'resident' || user.role === 'admin'
      ? [{ href: '/passes/new', label: 'Новый пропуск', icon: Plus }]
      : []),
    ...(isSecurity ? [{ href: '/control', label: 'Контроль КПП', icon: ClipboardList }] : []),
  ];

  return (
    <header className="bg-white border-b border-[var(--border)] sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold text-[var(--primary)]">
            <Shield className="w-6 h-6" />
            <span>PASS24</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {links.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
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
              {user.apartment && ` · кв. ${user.apartment}`}
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