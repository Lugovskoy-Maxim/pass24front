'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, ClipboardList, Bookmark, Car, Truck, Wrench, User } from 'lucide-react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { PassListCard } from '@/components/PassListCard';
import { useAuth } from '@/lib/auth';
import { useConfig } from '@/hooks/useConfig';
import {
  api, Pass, PassStats, PassTemplate, TYPE_LABELS, PassType, formatTenantOffices, getErrorMessage,
} from '@/lib/api';
import { PageError } from '@/components/PageError';


import { canUseReception, canViewAllPasses, canViewPasses, hasPermission } from '@/lib/permissions';
import { getAccentStatClass } from '@/lib/pass-status';
import { getUiLabels } from '@/lib/ui-labels';

const TYPE_ICONS: Record<PassType, typeof User> = {
  visitor: User,
  parking: Car,
  delivery: Truck,
  contractor: Wrench,
};

export default function DashboardPage() {
  const { user } = useAuth();
  const config = useConfig();
  const labels = getUiLabels(config);
  const [passes, setPasses] = useState<Pass[]>([]);
  const [templates, setTemplates] = useState<PassTemplate[]>([]);
  const [stats, setStats] = useState<PassStats | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loadErrorCause, setLoadErrorCause] = useState<unknown>(null);

  const isTenantTemplates = hasPermission(user, 'passes.templates') && !canViewPasses(user);

  const loadDashboard = () => {
    setLoadError('');
    setLoadErrorCause(null);
    if (isTenantTemplates) {
      return api.getPassTemplates()
        .then(({ templates: data }) => setTemplates(data.slice(0, 6)))
        .catch((err) => {
          setLoadErrorCause(err);
          setLoadError(getErrorMessage(err, 'Ошибка загрузки'));
        });
    }

    return Promise.all([api.getPasses(), api.getStats()])
      .then(([{ passes: data }, statsData]) => {
        setPasses(data.slice(0, 5));
        setStats(statsData);
      })
      .catch((err) => {
        setLoadErrorCause(err);
        setLoadError(getErrorMessage(err, 'Ошибка загрузки'));
      });
  };

  useEffect(() => {
    loadDashboard();
  }, [isTenantTemplates]);


  const canCreate = hasPermission(user, 'passes.create');
  const canReception = canUseReception(user);
  const showAllPasses = canViewAllPasses(user);
  const canTemplates = hasPermission(user, 'passes.templates');

  return (
    <ProtectedLayout>
      <div className="mb-6">
        <h1 className="page-title">
          {labels.pages.dashboardWelcome}, {user?.full_name?.split(' ')[0]}
        </h1>
        <p className="text-[var(--muted)]">
          {user?.company ? `${user.company}` : labels.pages.dashboardManagePasses}
          {user?.offices?.length
            ? ` · ${formatTenantOffices(user.offices)}`
            : user?.office && ` · ${labels.card.officePrefix} ${user.office}`}
        </p>
      </div>

      {!isTenantTemplates && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {([
              { key: 'pending' as const, value: stats?.byStatus.pending, label: labels.dashboard.statPending },
              { key: 'active' as const, value: stats?.byStatus.active, label: labels.dashboard.statActive },
              { key: 'total' as const, value: stats?.todayCount, label: labels.dashboard.statToday },
            ]).map(({ key, value, label }) => (
                <div
                  key={key}
                  className={`card p-4 flex items-center gap-3 ${getAccentStatClass(key)}`}
                >
                  <div className={`text-2xl font-bold accent-stat__value--${key}`}>{value ?? '—'}</div>
                  <div className="text-sm text-[var(--muted)]">{label}</div>
                </div>
            ))}
          </div>

          {stats && Object.keys(stats.todayByType).length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {(Object.entries(TYPE_LABELS) as [PassType, string][]).map(([type, label]) => {
                const count = stats.todayByType[type] || 0;
                if (count === 0) return null;
                const Icon = TYPE_ICONS[type];
                return (
                  <div key={type} className="card p-3 flex items-center gap-2">
                    <Icon className="w-4 h-4 text-[var(--muted)]" />
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

      {loadError && (
        <PageError
          className="mb-6"
          message={loadError}
          error={loadErrorCause}
          onRetry={loadDashboard}
          retryLabel={labels.buttons.retry}
        />
      )}

      <div className="flex gap-3 mb-6 flex-wrap">
        {canTemplates && (
          <Link href="/templates" className="btn btn-primary">
            <Bookmark className="w-4 h-4" />
            {labels.pages.templatesTitle}
          </Link>
        )}
        {canCreate && !isTenantTemplates && (
          <Link href="/passes/new" className="btn btn-primary">
            <Plus className="w-4 h-4" />
            {labels.buttons.order}
          </Link>
        )}
        {canReception && (
          <Link href="/control" className="btn btn-secondary">
            <ClipboardList className="w-4 h-4" />
            {labels.pages.receptionTitle}
          </Link>
        )}
      </div>

      {isTenantTemplates ? (
        <>
          <h2 className="text-lg font-semibold mb-4">{labels.dashboard.quickOrderTitle}</h2>
          {templates.length === 0 ? (
            <div className="card p-8 text-center text-[var(--muted)]">
              {labels.dashboard.quickOrderEmpty}
              <div className="mt-4">
                <Link href="/templates" className="btn btn-secondary">{labels.dashboard.goToTemplates}</Link>
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
                    {labels.buttons.orderShort}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              {showAllPasses ? labels.pages.dashboardRecentAll : labels.pages.dashboardRecentOwn}
            </h2>
            {showAllPasses && (
              <Link href="/passes" className="text-sm text-link hover:underline">{labels.buttons.allPasses}</Link>
            )}
          </div>
          {passes.length === 0 ? (
            <div className="card p-8 text-center text-[var(--muted)]">
              {labels.dashboard.emptyPasses}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {passes.map((pass) => (
                <PassListCard
                  key={pass.id}
                  pass={pass}
                  labels={labels}
                  showCreator={showAllPasses}
                  href={`/passes?id=${pass.id}`}
                />
              ))}
            </div>
          )}
        </>
      )}
    </ProtectedLayout>
  );
}