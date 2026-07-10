'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Inbox, Plus, Search, X } from 'lucide-react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { PassListCard } from '@/components/PassListCard';
import { PassDetailPanel } from '@/components/PassDetailPanel';
import { PassPrintCard } from '@/components/PassPrintCard';
import { SharePassActions } from '@/components/SharePassActions';
import { useAuth } from '@/lib/auth';
import { useDebounce } from '@/hooks/useDebounce';
import { useConfig } from '@/hooks/useConfig';
import { useToast } from '@/components/Toast';
import { api, Pass, PassStatus, getErrorMessage } from '@/lib/api';
import { PageError } from '@/components/PageError';
import { canOrderPasses, canViewAllPasses, canViewPasses, hasPermission } from '@/lib/permissions';
import { isAwaitingEntry } from '@/lib/pass-entry';
import { passRequiresCheckout } from '@/lib/pass-checkout';



import { getStatusLabel, getUiLabels, UiLabels } from '@/lib/ui-labels';
// Графики временно отключены
// import { PassesStatsBar } from '@/components/PassesStatsBar';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

const ALL_STATUSES: PassStatus[] = ['pending', 'approved', 'active', 'completed', 'rejected', 'expired', 'cancelled'];

function formatPassCount(count: number, labels: UiLabels): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} ${labels.passes.countOne}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${count} ${labels.passes.countFew}`;
  return `${count} ${labels.passes.countMany}`;
}

function PassesPageContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const config = useConfig();
  const { toast } = useToast();
  const [passes, setPasses] = useState<Pass[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [selected, setSelected] = useState<Pass | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadErrorCause, setLoadErrorCause] = useState<unknown>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const labels = getUiLabels(config);

  const canViewPassesList = canViewPasses(user);
  const canCreate = canOrderPasses(user);
  const canViewAll = canViewAllPasses(user);
  const canReception = hasPermission(user, 'passes.reception');
  const showCreatorInfo = canViewAll || canReception;
  const canCancelPass = (pass: Pass) =>
    pass.isOwner && isAwaitingEntry(pass.status);

  const canSharePass = (pass: Pass) => !['cancelled', 'rejected', 'expired'].includes(pass.status);

  useEffect(() => {
    if (user && !canViewPassesList && hasPermission(user, 'passes.templates')) {
      router.replace('/templates');
    }
  }, [user, canViewPassesList, router]);

  const canPrint = selected && (isAwaitingEntry(selected.status) || selected.status === 'active');

  const load = useCallback(() => {
    setLoading(true);
    setLoadError('');
    return api.getPasses({
      status: statusFilter || undefined,
      search: debouncedSearch || undefined,
      date: dateFilter || undefined,
    })
      .then(({ passes: data }) => {
        setPasses(data);
        return data;
      })
      .catch((err) => {
        setLoadErrorCause(err);
        setLoadError(getErrorMessage(err, 'Ошибка загрузки'));
        return [] as Pass[];
      })
      .finally(() => setLoading(false));
  }, [statusFilter, debouncedSearch, dateFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (loading) return;
    const idFromUrl = searchParams.get('id');
    setSelected((prev) => {
      if (idFromUrl) {
        const fromUrl = passes.find((p) => p.id === idFromUrl);
        if (fromUrl) return fromUrl;
      }
      if (prev) {
        const updated = passes.find((p) => p.id === prev.id);
        if (updated) return updated;
      }
      return passes[0] || null;
    });
  }, [passes, loading, searchParams]);

  const handleAction = async (id: string, action: 'reject' | 'checkin' | 'checkout' | 'cancel', reason?: string) => {
    setActionLoading(true);
    try {
      let updated: Pass;
      if (action === 'reject') ({ pass: updated } = await api.updateStatus(id, 'rejected', reason));
      else if (action === 'cancel') ({ pass: updated } = await api.updateStatus(id, 'cancelled'));
      else if (action === 'checkin') ({ pass: updated } = await api.checkIn(id));
      else ({ pass: updated } = await api.checkOut(id));
      setPasses((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setSelected(updated);
      setRejectReason('');
      const toastMsg = action === 'reject' ? labels.toasts.rejected
        : action === 'checkin' ? labels.toasts.checkedIn
        : action === 'checkout' ? labels.toasts.checkedOut
        : labels.toasts.actionDone;
      toast(toastMsg, 'success');
    } catch (err) {
      toast(getErrorMessage(err, 'Ошибка'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const renderDetailActions = (pass: Pass) => (
    <>
      {canReception && isAwaitingEntry(pass.status) && (
        <>
          <button className="btn btn-success w-full" disabled={actionLoading} onClick={() => handleAction(pass.id, 'checkin')}>
            {labels.buttons.checkInBuilding}
          </button>
          <input
            className="input"
            placeholder={labels.reception.rejectPlaceholder}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <button
            className="btn btn-danger w-full"
            disabled={actionLoading || !rejectReason.trim()}
            onClick={() => handleAction(pass.id, 'reject', rejectReason)}
          >
            {labels.buttons.reject}
          </button>
        </>
      )}
      {canReception && pass.status === 'active' && passRequiresCheckout(pass) && (
        <button className="btn btn-primary w-full" disabled={actionLoading} onClick={() => handleAction(pass.id, 'checkout')}>
          {labels.buttons.checkOut}
        </button>
      )}
      {canSharePass(pass) && (
        <SharePassActions passIdOrNumber={pass.id} passNumber={pass.passNumber} enableEmailShare />
      )}
      {canCancelPass(pass) && (
        <button className="btn btn-danger w-full" disabled={actionLoading} onClick={() => handleAction(pass.id, 'cancel')}>
          {labels.buttons.cancelRequest}
        </button>
      )}
    </>
  );

  if (user && !canViewPassesList) return null;

  return (
    <ProtectedLayout anyPermissions={['passes.view_own', 'passes.view_all', 'admin.panel']}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 min-w-0">
          <div>
            <h1 className="page-title">{labels.pages.passesTitle}</h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              {canViewAll ? labels.pages.passesSubtitleAll : labels.pages.passesSubtitleOwn}
            </p>
          </div>
          {canCreate && (
            <Link href="/passes/new" className="btn btn-primary shrink-0 self-start sm:self-center">
              <Plus className="w-4 h-4" />
              {labels.buttons.order}
            </Link>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
            <input
              className="input input--icon-left"
              placeholder={labels.passes.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <input className="input input--auto" type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
          <div className="select-wrap select-wrap--auto">
            <select className="input input--auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">{labels.passes.allStatuses}</option>
              {ALL_STATUSES.map((status) => (
                <option key={status} value={status}>{getStatusLabel(status, labels)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Графики временно отключены
      {canViewPassCharts(user) && <PassesStatsBar />}
      */}

      {loadError && (
        <PageError
          className="mb-4"
          message={loadError}
          error={loadErrorCause}
          onRetry={() => load()}
          retryLabel={labels.buttons.retry}
        />
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] gap-5 items-start">
        <div className="min-w-0">
          {loading ? (
            <ListSkeleton rows={5} />
          ) : passes.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={Inbox}
                title={labels.passes.notFound}
                description={canCreate ? 'Закажите первый пропуск для посетителя или курьера' : undefined}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-[var(--muted)] mb-1 px-1">{formatPassCount(passes.length, labels)}</p>
              {passes.map((pass) => (
                <PassListCard
                  key={pass.id}
                  pass={pass}
                  labels={labels}
                  selected={selected?.id === pass.id}
                  showCreator={showCreatorInfo}
                  onClick={() => setSelected(pass)}
                />
              ))}
            </div>
          )}
        </div>

        {selected && (
          <div className="lg:sticky lg:top-20 space-y-3 min-w-0 max-w-full">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-base font-semibold text-[var(--muted)] uppercase tracking-wide text-[11px]">
                {labels.passes.detailTitle}
              </h2>
              <button
                className="p-1.5 rounded-md text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--m-block)] lg:hidden"
                onClick={() => setSelected(null)}
                aria-label={labels.passes.close}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {canPrint && (
              <PassPrintCard pass={selected} businessCenterName={selected.businessCenterName || config?.businessCenterName} />
            )}

            <PassDetailPanel
              pass={selected}
              labels={labels}
              showCreator={showCreatorInfo}
              actions={renderDetailActions(selected)}
              onPassUpdated={(updated) => {
                setPasses((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
                setSelected(updated);
              }}
            />
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}

export default function PassesPage() {
  return (
    <Suspense fallback={<ProtectedLayout anyPermissions={['passes.view_own', 'passes.view_all', 'admin.panel']}><div className="animate-pulse text-[var(--muted)] p-8">Загрузка...</div></ProtectedLayout>}>
      <PassesPageContent />
    </Suspense>
  );
}