'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import Link from 'next/link';
import {
  Users,
  FileText,
  Building2,
  Sparkles,
  List,
  ScrollText,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { useToast } from '@/components/Toast';
import { useConfig } from '@/hooks/useConfig';
import {
  api,
  AdminDashboard,
  AUDIT_LABELS,
  formatAuditEntity,
  getErrorMessage,
} from '@/lib/api';
import { PageError } from '@/components/PageError';
import { getUiLabels } from '@/lib/ui-labels';
import { CardSkeleton } from '@/components/ui/Skeleton';

export default function AdminDashboardPage() {
  const config = useConfig();
  const labels = getUiLabels(config);
  const { toast } = useToast();
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState('');
  const [errorCause, setErrorCause] = useState<unknown>(null);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback((options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setError('');
      setErrorCause(null);
    }
    return api.admin
      .dashboard()
      .then(setData)
      .catch((e) => {
        if (!options?.silent) {
          setErrorCause(e);
          setError(getErrorMessage(e, 'Ошибка загрузки'));
        }
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useAutoRefresh(() => load({ silent: true }));

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const result = await api.admin.seedTestData();
      toast(result.message, 'success');
      load();
    } catch (e) {
      toast(getErrorMessage(e, 'Не удалось выполнить действие'), 'error');
    } finally {
      setSeeding(false);
    }
  };

  if (error) {
    return (
      <AdminLayout title="Обзор БЦ">
        <PageError
          message={error}
          error={errorCause}
          onRetry={load}
          retryLabel={labels.buttons.retry}
        />
      </AdminLayout>
    );
  }
  if (!data) {
    return (
      <AdminLayout title="Обзор БЦ">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <CardSkeleton lines={2} />
          <CardSkeleton lines={2} />
          <CardSkeleton lines={2} />
        </div>
      </AdminLayout>
    );
  }

  const { stats, recentActivity, businessCenterNames } = data;

  return (
    <AdminLayout title="Обзор БЦ">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 -mt-4 mb-6">
        <p className="text-[var(--muted)]">
          {businessCenterNames.length === 0
            ? 'Бизнес-центры создаются в разделе «Офисы»'
            : businessCenterNames.join(' · ')}
        </p>
        <button
          className="btn btn-secondary text-sm"
          onClick={handleSeed}
          disabled={seeding}
        >
          <Sparkles className="w-4 h-4" />
          {seeding ? 'Создание...' : 'Создать тестовые БЦ и арендаторов'}
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <Link href="/passes" className="btn btn-secondary text-sm">
          <List className="w-4 h-4" />
          {labels.buttons.allPasses}
        </Link>
        <Link href="/admin/audit" className="btn btn-secondary text-sm">
          <ScrollText className="w-4 h-4" />
          {labels.buttons.auditLog}
        </Link>
      </div>

      {(stats.registrationPending ?? 0) > 0 && (
        <Link
          href="/admin/users?category=tenants&highlight=registration"
          className="card p-4 mb-6 flex flex-col sm:flex-row sm:items-center gap-3 border-2 border-[var(--status-pending-border)] bg-[var(--status-pending-soft)] hover:brightness-[0.98] transition"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <AlertCircle className="w-8 h-8 text-[var(--status-pending)] shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-[var(--text)]">
                Новые заявки на регистрацию: {stats.registrationPending}
              </div>
              <p className="text-sm text-[var(--muted)] mt-0.5">
                Подтвердите или отклоните арендаторов — доступ пока закрыт
              </p>
            </div>
          </div>
          <span className="btn btn-primary text-sm shrink-0 self-start sm:self-center">
            <Clock className="w-4 h-4" />
            Открыть заявки
          </span>
        </Link>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <div className="card p-4 stat-card">
          <Users className="w-5 h-5 text-[var(--primary)] mb-2" />
          <div className="text-2xl font-bold tabular-nums">
            {stats.users.total}
          </div>
          <div className="text-sm text-[var(--muted)]">Пользователей</div>
        </div>
        <div className="card p-4 stat-card">
          <FileText className="w-5 h-5 text-[var(--accent)] mb-2" />
          <div className="text-2xl font-bold tabular-nums">
            {stats.passes.total}
          </div>
          <div className="text-sm text-[var(--muted)]">Всего пропусков</div>
        </div>
        <div className="card p-4 stat-card col-span-2 lg:col-span-1">
          <Building2 className="w-5 h-5 text-emerald-600 mb-2" />
          <div className="text-2xl font-bold tabular-nums">
            {stats.businessCenters}
          </div>
          <div className="text-sm text-[var(--muted)]">Бизнес-центров</div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Последние действия пользователей</h2>
          <Link
            href="/admin/audit"
            className="text-sm text-[var(--primary)] hover:underline"
          >
            {labels.buttons.fullAudit}
          </Link>
        </div>
        {recentActivity.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Действий пока нет</p>
        ) : (
          <div className="space-y-1">
            {recentActivity.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between text-sm py-2.5 border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-muted)] -mx-2 px-2 rounded transition-colors"
              >
                <div className="min-w-0">
                  <span className="font-medium">
                    {AUDIT_LABELS[entry.action] || entry.action}
                  </span>
                  <span className="text-[var(--muted)]">
                    {' '}
                    · {entry.userName || 'Система'}
                  </span>
                  <span className="text-[var(--muted)] text-xs block sm:inline sm:ml-1">
                    — {formatAuditEntity(entry)}
                  </span>
                </div>
                <span className="text-xs text-[var(--muted)] shrink-0 ml-2 tabular-nums">
                  {new Date(entry.createdAt).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
