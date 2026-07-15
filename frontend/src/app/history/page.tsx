'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, History } from 'lucide-react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { PassListCard } from '@/components/PassListCard';
import { PageError } from '@/components/PageError';
import { api, Pass, getErrorMessage } from '@/lib/api';
import { useConfig } from '@/hooks/useConfig';
import { getUiLabels } from '@/lib/ui-labels';
import { HistoryQuery, historyTitle } from '@/lib/visit-history';
import { getHomePath } from '@/lib/permissions';
import { useAuth } from '@/lib/auth';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';

function parseHistoryQuery(params: URLSearchParams): HistoryQuery | null {
  const scope = params.get('scope') as HistoryQuery['scope'] | null;
  if (!scope || !['visitor', 'office', 'company', 'bc'].includes(scope)) return null;
  return {
    scope,
    visitorName: params.get('visitorName') || undefined,
    visitorPhone: params.get('visitorPhone') || undefined,
    visitorPassportSeries: params.get('visitorPassportSeries') || undefined,
    visitorPassportNumber: params.get('visitorPassportNumber') || undefined,
    officeId: params.get('officeId') || undefined,
    officeLabel: params.get('officeLabel') || undefined,
    companyName: params.get('companyName') || undefined,
    propertyId: params.get('propertyId') || undefined,
    bcName: params.get('bcName') || undefined,
  };
}

function HistoryPageContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const config = useConfig();
  const labels = getUiLabels(config);
  const query = useMemo(() => parseHistoryQuery(searchParams), [searchParams]);

  const [passes, setPasses] = useState<Pass[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadErrorCause, setLoadErrorCause] = useState<unknown>(null);

  const load = useCallback((options?: { silent?: boolean }) => {
    if (!query) return Promise.resolve();
    const silent = options?.silent;
    if (!silent) {
      setLoading(true);
      setLoadError('');
    }
    return api.getPassHistory(query)
      .then(({ passes: data }) => setPasses(data))
      .catch((err) => {
        if (!silent) {
          setLoadErrorCause(err);
          setLoadError(getErrorMessage(err, 'Ошибка загрузки'));
        }
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }, [query]);

  useEffect(() => { load(); }, [load]);

  useAutoRefresh(() => load({ silent: true }), { enabled: !!query });

  if (!query) {
    return (
      <ProtectedLayout anyPermissions={['passes.view_all', 'passes.reception', 'admin.panel']}>
        <div className="card p-8 text-center text-[var(--muted)]">
          Укажите параметры истории: посетитель, офис, компания или бизнес-центр
        </div>
      </ProtectedLayout>
    );
  }

  const title = historyTitle(query);
  const subtitle = query.scope === 'visitor'
    ? 'Все визиты по совпадению ФИО, телефона или паспорта'
    : query.scope === 'office'
      ? 'Все пропуска в этот офис'
      : query.scope === 'company'
        ? 'Все пропуска для компании'
        : 'Все пропуска в бизнес-центре';

  return (
    <ProtectedLayout anyPermissions={['passes.view_all', 'passes.reception', 'admin.panel']}>
      <div className="mb-6">
        <Link href={getHomePath(user)} className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--accent)] mb-3">
          <ArrowLeft className="w-4 h-4" />
          Назад
        </Link>
        <div className="flex items-center gap-3">
          <History className="w-6 h-6 text-[var(--muted)]" />
          <div>
            <h1 className="page-title">История проходов</h1>
            <p className="text-sm text-[var(--muted)] mt-1">{subtitle}</p>
            <p className="text-sm font-medium mt-1">{title}</p>
          </div>
        </div>
      </div>

      {loadError && (
        <PageError className="mb-4" message={loadError} error={loadErrorCause} onRetry={load} retryLabel={labels.buttons.retry} />
      )}

      {loading ? (
        <div className="card p-8 text-center text-[var(--muted)]">{labels.passes.loading}</div>
      ) : passes.length === 0 ? (
        <div className="card p-8 text-center text-[var(--muted)]">Визиты не найдены</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-[var(--muted)] mb-1 px-1">Найдено: {passes.length}</p>
          {passes.map((pass) => (
            <PassListCard
              key={pass.id}
              pass={pass}
              labels={labels}
              showCreator
              href={`/passes?id=${pass.id}`}
            />
          ))}
        </div>
      )}
    </ProtectedLayout>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<ProtectedLayout anyPermissions={['passes.view_all', 'passes.reception', 'admin.panel']}><div className="animate-pulse text-[var(--muted)] p-8">Загрузка...</div></ProtectedLayout>}>
      <HistoryPageContent />
    </Suspense>
  );
}