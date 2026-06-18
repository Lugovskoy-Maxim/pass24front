'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, ClipboardList, Clock, CheckCircle, AlertCircle, Car, Truck, Wrench, User } from 'lucide-react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { PassCard } from '@/components/PassCard';
import { useAuth } from '@/lib/auth';
import { api, Pass, PassStats, TYPE_LABELS, PassType } from '@/lib/api';

const TYPE_ICONS: Record<PassType, typeof User> = {
  visitor: User,
  parking: Car,
  delivery: Truck,
  contractor: Wrench,
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [passes, setPasses] = useState<Pass[]>([]);
  const [stats, setStats] = useState<PassStats | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    Promise.all([api.getPasses(), api.getStats()])
      .then(([{ passes: data }, statsData]) => {
        setPasses(data.slice(0, 5));
        setStats(statsData);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Ошибка загрузки'));
  }, []);

  const isSecurity = user?.role === 'security' || user?.role === 'admin';

  return (
    <ProtectedLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Добро пожаловать, {user?.full_name?.split(' ')[0]}</h1>
        <p className="text-[var(--muted)]">
          {user?.company ? `${user.company}` : 'Управление пропусками'}
          {user?.office && ` · офис ${user.office}`}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600" />
          <div>
            <div className="text-2xl font-bold">{stats?.byStatus.pending ?? '—'}</div>
            <div className="text-sm text-[var(--muted)]">На рассмотрении</div>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          <div>
            <div className="text-2xl font-bold">{stats?.byStatus.active ?? '—'}</div>
            <div className="text-sm text-[var(--muted)]">Сейчас в здании</div>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <Clock className="w-5 h-5 text-blue-600" />
          <div>
            <div className="text-2xl font-bold">{stats?.todayCount ?? '—'}</div>
            <div className="text-sm text-[var(--muted)]">Сегодня</div>
          </div>
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

      {loadError && <div className="mb-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{loadError}</div>}

      <div className="flex gap-3 mb-6">
        {(user?.role === 'tenant' || user?.role === 'admin') && (
          <Link href="/passes/new" className="btn btn-primary">
            <Plus className="w-4 h-4" />
            Заказать пропуск
          </Link>
        )}
        {isSecurity && (
          <Link href="/control" className="btn btn-secondary">
            <ClipboardList className="w-4 h-4" />
            Панель ресепшн
          </Link>
        )}
      </div>

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
    </ProtectedLayout>
  );
}