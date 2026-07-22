'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Download, Inbox, Plus, Printer, Search, Table2 } from 'lucide-react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { PassListCard } from '@/components/PassListCard';
import { PassDetailModal } from '@/components/PassDetailModal';
import { PassDetailPanel } from '@/components/PassDetailPanel';
import { PassPrintCard } from '@/components/PassPrintCard';
import { SharePassActions } from '@/components/SharePassActions';
import { useAuth } from '@/lib/auth';
import { useDebounce } from '@/hooks/useDebounce';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
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
import { PassExportPanel } from '@/components/PassExportPanel';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

const ALL_STATUSES: PassStatus[] = ['pending', 'approved', 'active', 'completed', 'rejected', 'expired', 'cancelled'];
const PAGE_SIZE = 50;

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
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const visibleCountRef = useRef(0);
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
  const [exportOpen, setExportOpen] = useState(false);

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
    if (user && !canViewPassesList && canCreate) {
      router.replace('/passes/new');
    }
  }, [user, canViewPassesList, canCreate, router]);

  const canPrintPass = (pass: Pass) => isAwaitingEntry(pass.status) || pass.status === 'active';

  const load = useCallback((options?: { silent?: boolean; append?: boolean }) => {
    const silent = options?.silent;
    const append = options?.append;
    if (!silent && !append) {
      setLoading(true);
      setLoadError('');
    }
    const visibleCount = visibleCountRef.current;
    const offset = append ? visibleCount : 0;
    const limit = append ? PAGE_SIZE : (silent && visibleCount > PAGE_SIZE ? visibleCount : PAGE_SIZE);
    return api.getPasses({
      status: statusFilter || undefined,
      search: debouncedSearch || undefined,
      date: dateFilter || undefined,
      limit,
      offset,
    })
      .then((data) => {
        setPasses((prev) => (append ? [...prev, ...data.passes] : data.passes));
        setTotal(data.total);
        setHasMore(data.hasMore);
        return data.passes;
      })
      .catch((err) => {
        if (!silent && !append) {
          setLoadErrorCause(err);
          setLoadError(getErrorMessage(err, 'Ошибка загрузки'));
        }
        return [] as Pass[];
      })
      .finally(() => {
        if (!silent && !append) setLoading(false);
      });
  }, [statusFilter, debouncedSearch, dateFilter]);

  useEffect(() => {
    visibleCountRef.current = passes.length;
  }, [passes.length]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      await load({ append: true });
    } finally {
      setLoadingMore(false);
    }
  }, [load, loadingMore, hasMore]);

  useEffect(() => { load(); }, [load]);

  useAutoRefresh(() => load({ silent: true }), { enabled: !actionLoading });

  const closeDetail = useCallback(() => {
    setSelected(null);
    if (searchParams.get('id')) {
      router.replace('/passes');
    }
  }, [router, searchParams]);

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
      return prev;
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
      {canPrintPass(pass) && (
        <button type="button" className="btn btn-secondary w-full" onClick={() => window.print()}>
          <Printer className="w-4 h-4" />
          {labels.print.printButton}
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

  // Нельзя return null до ProtectedLayout — иначе редирект/проверка прав не сработает
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
          <Link href="/passes/report" className="btn btn-secondary shrink-0">
            <Table2 className="w-4 h-4" />
            Отчёт
          </Link>
          <button
            type="button"
            className="btn btn-secondary shrink-0"
            onClick={() => setExportOpen(true)}
          >
            <Download className="w-4 h-4" />
            {labels.buttons.export}
          </button>
        </div>
      </div>

      <PassExportPanel
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        initialFilters={{
          status: statusFilter,
          date: dateFilter,
          search: debouncedSearch,
        }}
      />

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
            <p className="text-xs text-[var(--muted)] mb-1 px-1">
              {passes.length < total
                ? `Показано ${passes.length} из ${total}`
                : formatPassCount(passes.length, labels)}
            </p>
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
            {hasMore && (
              <button
                type="button"
                className="btn btn-secondary w-full sm:w-auto self-center mt-2"
                disabled={loadingMore}
                onClick={loadMore}
              >
                {loadingMore ? '...' : labels.buttons.loadMore}
              </button>
            )}
          </div>
        )}
      </div>

      <PassDetailModal
        open={!!selected}
        title={labels.passes.detailTitle}
        closeLabel={labels.passes.close}
        onClose={closeDetail}
      >
        {selected && (
          <div className="space-y-3">
            {canPrintPass(selected) && (
              <div className="print-pass-host" aria-hidden="true">
                <PassPrintCard
                  pass={selected}
                  businessCenterName={selected.businessCenterName || config?.businessCenterName}
                  hidePrintButton
                />
              </div>
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
      </PassDetailModal>
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