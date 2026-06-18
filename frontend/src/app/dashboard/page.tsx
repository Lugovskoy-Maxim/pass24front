'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, ClipboardList, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { PassCard } from '@/components/PassCard';
import { useAuth } from '@/lib/auth';
import { api, Pass } from '@/lib/api';

export default function DashboardPage() {
  const { user } = useAuth();
  const [passes, setPasses] = useState<Pass[]>([]);
  const [stats, setStats] = useState({ pending: 0, active: 0, today: 0 });
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    api.getPasses()
      .then(({ passes: data }) => {
        setPasses(data.slice(0, 5));
        const today = new Date().toISOString().slice(0, 10);
        setStats({
          pending: data.filter((p) => p.status === 'pending').length,
          active: data.filter((p) => p.status === 'active').length,
          today: data.filter((p) => p.visitDate === today).length,
        });
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="card p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600" />
          <div>
            <div className="text-2xl font-bold">{stats.pending}</div>
            <div className="text-sm text-[var(--muted)]">На рассмотрении</div>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          <div>
            <div className="text-2xl font-bold">{stats.active}</div>
            <div className="text-sm text-[var(--muted)]">Сейчас в здании</div>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <Clock className="w-5 h-5 text-blue-600" />
          <div>
            <div className="text-2xl font-bold">{stats.today}</div>
            <div className="text-sm text-[var(--muted)]">Сегодня</div>
          </div>
        </div>
      </div>

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