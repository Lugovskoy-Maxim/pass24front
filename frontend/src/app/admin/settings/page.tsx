'use client';

import Link from 'next/link';
import { Database, Globe, Link2, Webhook } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { SettingsNav } from '@/components/SettingsNav';

export default function AdminSettingsPage() {
  return (
    <AdminLayout title="Настройки">
      <SettingsNav />
      <p className="text-[var(--muted)] -mt-2 mb-6">
        Сайт, подключение к WordPress и связи с уже существующими БЦ и офисами.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        <Link href="/admin/site" className="card p-5 hover:bg-[var(--surface-muted)]">
          <Globe className="w-5 h-5 text-[var(--primary)] mb-2" />
          <div className="font-semibold">Сайт</div>
          <p className="text-sm text-[var(--muted)] mt-1">
            Бренд, цвета, SMS, FAQ. Путь: /admin/site
          </p>
        </Link>
        <Link
          href="/admin/mysql"
          className="card p-5 hover:bg-[var(--surface-muted)]"
        >
          <Database className="w-5 h-5 text-[var(--primary)] mb-2" />
          <div className="font-semibold">MySQL</div>
          <p className="text-sm text-[var(--muted)] mt-1">
            Подключение, поля сайта, автопроверка. Путь: /admin/mysql
          </p>
        </Link>
        <Link
          href="/admin/mysql/links"
          className="card p-5 hover:bg-[var(--surface-muted)]"
        >
          <Link2 className="w-5 h-5 text-[var(--primary)] mb-2" />
          <div className="font-semibold">Связи</div>
          <p className="text-sm text-[var(--muted)] mt-1">
            Подтвердить автопары или связать вручную, потом обновить.
          </p>
        </Link>
        <Link
          href="/admin/integration"
          className="card p-5 hover:bg-[var(--surface-muted)]"
        >
          <Webhook className="w-5 h-5 text-[var(--primary)] mb-2" />
          <div className="font-semibold">API Mstyle</div>
          <p className="text-sm text-[var(--muted)] mt-1">
            58 маршрутов: запрос, успех, ошибки, curl.
          </p>
        </Link>
      </div>
    </AdminLayout>
  );
}
