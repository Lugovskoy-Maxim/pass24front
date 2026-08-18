'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Database, Globe, Link2, MessageSquare, SlidersHorizontal, Terminal, Webhook } from 'lucide-react';

const ITEMS = [
  { href: '/admin/settings', label: 'Обзор', exact: true, icon: SlidersHorizontal },
  { href: '/admin/site', label: 'Сайт', icon: Globe },
  { href: '/admin/mysql', label: 'Подключение', exact: true, icon: Database },
  { href: '/admin/mysql/links', label: 'Связи', icon: Link2 },
  { href: '/admin/mysql/tickets', label: 'Заявки', icon: MessageSquare },
  { href: '/admin/integration', label: 'API', icon: Webhook },
  { href: '/admin/api-console', label: 'Прогон', icon: Terminal },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-2 mb-6">
      {ITEMS.map(({ href, label, exact, icon: Icon }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`btn text-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
