'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, ClipboardList, Bookmark, Car, Truck, Wrench, User } from 'lucide-react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { PassCard } from '@/components/PassCard';
import { useAuth } from '@/lib/auth';
import {
  api, Pass, PassStats, PassTemplate, TYPE_LABELS, PassType, formatTenantOffices,
} from '@/lib/api';
import { hasAnyPermission, hasPermission } from '@/lib/permissions';

const TYPE_ICONS: Record<PassType, typeof User> = {
  visitor: User,
  parking: Car,
  delivery: Truck,
  contractor: Wrench,
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [passes, setPasses] = useState<Pass[]>([]);
  const [templates, setTemplates] = useState<PassTemplate[]>([]);
  const [stats, setStats] = useState<PassStats | null>(null);
  const [loadError, setLoadError] = useState('');

  const isTenantTemplates = hasPermission(user, 'passes.templates') && !hasAnyPermission(user, 'passes.view_own', 'passes.view_all');

  useEffect(() => {
    if (isTenantTemplates) {
      api.getPassTemplates()
        .then(({ templates: data }) => setTemplates(data.slice(0, 6)))
        .catch((err) => setLoadError(err instanceof Error ? err.message : 'Ошибка загрузки'));
      return;
    }

    Promise.all([api.getPasses(), api.getStats()])
      .then(([{ passes: data }, statsData]) => {
        setPasses(data.slice(0, 5));
        setStats(statsData);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Ошибка загрузки'));
  }, [isTenantTemplates]);

  const canCreate = hasPermission(user, 'passes.create');
  const canReception = hasAnyPermission(user, 'passes.reception', 'passes.lookup');
  const canTemplates = hasPermission(user, 'passes.templates');

  return (
    <ProtectedLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Добро пожаловать, {user?.full_name?.split(' ')[0]}</h1>
        <p className="text-[var(--muted)]">
          {user?.company ? `${user.company}` : 'Управление пропусками'}
          {user?.offices?.length
            ? ` · ${formatTenantOffices(user.offices)}`
            : user?.office && ` · офис ${user.office}`}
        </p>
      </div>

      {!isTenantTemplates && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="card p-4 flex items-center gap-3">
              <div className="text-2xl font-bold">{stats?.byStatus.pending ?? '—'}</div>
              <div className="text-sm text-[var(--muted)]">На рассмотрении</div>
            </div>
            <div className="card p-4 flex items-center gap-3">
              <div className="text-2xl font-bold">{stats?.byStatus.active ?? '—'}</div>
              <div className="text-sm text-[var(--muted)]">Сейчас в здании</div>
            </div>
            <div className="card p-4 flex items-center gap-3">
              <div className="text-2xl font-bold">{stats?.todayCount ?? '—'}</div>
              <div className="text-sm text-[var(--muted)]">Сегодня</div>
            </div>
          </div>

          {stats && Object.keys(stats.todayByType).length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {(Object.entries(TYPE_LABELS) as [PassType, string][]).map(([type, label]) => {
                const count = stats.todayByType[type] || 0;
                if (count === 0) return null;
                const Icon = TYPE_ICONS[type];
                return (
                  <div key={type} className="card p-3 flex items-center gap-2">
                    <Icon className="w-4 h-4 text-[var(--primary)]" />
                    <div>
                      <div className="text-lg font-bold">{count}</div>
                      <div className="text-xs text-[var(--muted)]">{label}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {loadError && <div className="mb-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{loadError}</div>}

      <div className="flex gap-3 mb-6">
        {canTemplates && (
          <Link href="/templates" className="btn btn-primary">
            <Bookmark className="w-4 h-4" />
            Шаблоны пропусков
          </Link>
        )}
        {canCreate && !isTenantTemplates && (
          <Link href="/passes/new" className="btn btn-primary">
            <Plus className="w-4 h-4" />
            Заказать пропуск
          </Link>
        )}
        {canReception && (
          <Link href="/control" className="btn btn-secondary">
            <ClipboardList className="w-4 h-4" />
            Панель ресепшн
          </Link>
        )}
      </div>

      {isTenantTemplates ? (
        <>
          <h2 className="text-lg font-semibold mb-4">Быстрый заказ</h2>
          {templates.length === 0 ? (
            <div className="card p-8 text-center text-[var(--muted)]">
              Создайте шаблон посетителя или импортируйте из прошлых пропусков.
              <div className="mt-4">
                <Link href="/templates" className="btn btn-secondary">Перейти к шаблонам</Link>
              </div>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {templates.map((template) => (
                <div key={template.id} className="card p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{template.name}</div>
                    <div className="text-sm text-[var(--muted)]">{template.visitorName} · {TYPE_LABELS[template.passType]}</div>
                  </div>
                  <Link href={`/passes/new?template=${template.id}`} className="btn btn-primary text-sm shrink-0">
                    Заказать
                  </Link>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <h2 className="text-lg font-semibold mb-4">Последние пропуска</h2>
          {passes.length === 0 ? (
            <div className="card p-8 text-center text-[var(--muted)]">
              Пропусков пока нет. Закажите пропуск для посетителя или курьера.
            </div>
          ) : (
            <div className="grid gap-3">
              {passes.map((pass) => <PassCard key={pass.id} pass={pass} />)}
            </div>
          )}
        </>
      )}
    </ProtectedLayout>
  );
}