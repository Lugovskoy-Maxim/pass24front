'use client';

import { useEffect, useState } from 'react';
import { Users, FileText, Building2, TrendingUp } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { api, AdminDashboard, AUDIT_LABELS, STATUS_LABELS } from '@/lib/api';

function formatPrice(n: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.admin.dashboard()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  }, []);

  if (error) {
    return (
      <AdminLayout title="Обзор системы">
        <div className="text-red-600 bg-red-50 p-4 rounded-md">{error}</div>
      </AdminLayout>
    );
  }

  if (!data) {
    return (
      <AdminLayout title="Обзор системы">
        <div className="animate-pulse text-[var(--muted)]">Загрузка...</div>
      </AdminLayout>
    );
  }

  const { stats, recentActivity, settings } = data;

  return (
    <AdminLayout title="Обзор системы">
      <p className="text-[var(--muted)] -mt-4 mb-6">{settings.complex_name}</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="card p-4">
          <Users className="w-5 h-5 text-[var(--primary)] mb-2" />
          <div className="text-2xl font-bold">{stats.users.total}</div>
          <div className="text-sm text-[var(--muted)]">Пользователей</div>
        </div>
        <div className="card p-4">
          <FileText className="w-5 h-5 text-blue-600 mb-2" />
          <div className="text-2xl font-bold">{stats.passes.total}</div>
          <div className="text-sm text-[var(--muted)]">Всего заявок</div>
        </div>
        <div className="card p-4">
          <Building2 className="w-5 h-5 text-emerald-600 mb-2" />
          <div className="text-2xl font-bold">{stats.revenue.complexes}</div>
          <div className="text-sm text-[var(--muted)]">ЖК на обслуживании</div>
        </div>
        <div className="card p-4">
          <TrendingUp className="w-5 h-5 text-amber-600 mb-2" />
          <div className="text-2xl font-bold">{formatPrice(stats.revenue.monthlyTotal)}</div>
          <div className="text-sm text-[var(--muted)]">MRR (месяц)</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="font-semibold mb-4">Пользователи по ролям</h2>
          <div className="space-y-2">
            {Object.entries(stats.users.byRole).map(([role, count]) => (
              <div key={role} className="flex justify-between text-sm">
                <span className="text-[var(--muted)]">
                  {role === 'resident' ? 'Жители' : role === 'security' ? 'Охрана' : 'Админы'}
                </span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-4">Заявки по статусам</h2>
          <div className="space-y-2">
            {Object.entries(stats.passes.byStatus).map(([status, count]) => (
              <div key={status} className="flex justify-between text-sm">
                <span className="text-[var(--muted)]">{STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-[var(--border)] flex justify-between text-sm">
            <span className="text-[var(--muted)]">Сегодня / за неделю</span>
            <span className="font-medium">{stats.passes.today} / {stats.passes.week}</span>
          </div>
        </div>

        <div className="card p-5 lg:col-span-2">
          <h2 className="font-semibold mb-4">Последние действия</h2>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Действий пока нет</p>
          ) : (
            <div className="space-y-2">
              {recentActivity.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between text-sm py-2 border-b border-[var(--border)] last:border-0">
                  <div>
                    <span className="font-medium">{AUDIT_LABELS[entry.action] || entry.action}</span>
                    <span className="text-[var(--muted)]"> · {entry.userName || 'Система'}</span>
                  </div>
                  <span className="text-xs text-[var(--muted)]">
                    {new Date(entry.createdAt).toLocaleString('ru-RU')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}