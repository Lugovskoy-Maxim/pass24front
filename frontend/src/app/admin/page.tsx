'use client';

import { useEffect, useState } from 'react';
import { Users, FileText, Building2, Sparkles } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { useToast } from '@/components/Toast';
import { api, AdminDashboard, AUDIT_LABELS, STATUS_LABELS } from '@/lib/api';

const ROLE_NAMES: Record<string, string> = {
  tenant: 'Арендаторы',
  security: 'Ресепшн',
  admin: 'Админы',
};

export default function AdminDashboardPage() {
  const { toast } = useToast();
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState('');
  const [seeding, setSeeding] = useState(false);

  const load = () => {
    api.admin.dashboard().then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  };

  useEffect(() => { load(); }, []);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const result = await api.admin.seedTestData();
      toast(result.message, 'success');
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ошибка', 'error');
    } finally {
      setSeeding(false);
    }
  };

  if (error) {
    return <AdminLayout title="Обзор БЦ"><div className="text-red-600 bg-red-50 p-4 rounded-md">{error}</div></AdminLayout>;
  }
  if (!data) {
    return <AdminLayout title="Обзор БЦ"><div className="animate-pulse text-[var(--muted)]">Загрузка...</div></AdminLayout>;
  }

  const { stats, recentActivity, settings } = data;

  return (
    <AdminLayout title="Обзор БЦ">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 -mt-4 mb-6">
        <p className="text-[var(--muted)]">{settings.business_center_name}</p>
        <button className="btn btn-secondary text-sm" onClick={handleSeed} disabled={seeding}>
          <Sparkles className="w-4 h-4" />
          {seeding ? 'Создание...' : 'Создать тестовые БЦ и арендаторов'}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <div className="card p-4">
          <Users className="w-5 h-5 text-[var(--primary)] mb-2" />
          <div className="text-2xl font-bold">{stats.users.total}</div>
          <div className="text-sm text-[var(--muted)]">Пользователей</div>
        </div>
        <div className="card p-4">
          <FileText className="w-5 h-5 text-blue-600 mb-2" />
          <div className="text-2xl font-bold">{stats.passes.total}</div>
          <div className="text-sm text-[var(--muted)]">Всего пропусков</div>
        </div>
        <div className="card p-4">
          <Building2 className="w-5 h-5 text-emerald-600 mb-2" />
          <div className="text-2xl font-bold">{stats.businessCenters}</div>
          <div className="text-sm text-[var(--muted)]">Бизнес-центров</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="font-semibold mb-4">Пользователи по ролям</h2>
          <div className="space-y-2">
            {Object.entries(stats.users.byRole).map(([role, count]) => (
              <div key={role} className="flex justify-between text-sm">
                <span className="text-[var(--muted)]">{ROLE_NAMES[role] || role}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-4">Пропуска по статусам</h2>
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
                  <span className="text-xs text-[var(--muted)]">{new Date(entry.createdAt).toLocaleString('ru-RU')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}