'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Ban } from 'lucide-react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { PassCard } from '@/components/PassCard';
import { PassCardBase } from '@/components/PassCardBase';
import { PassPrintCard } from '@/components/PassPrintCard';
import { SharePassActions } from '@/components/SharePassActions';
import { useAuth } from '@/lib/auth';
import { useDebounce } from '@/hooks/useDebounce';
import { useConfig } from '@/hooks/useConfig';
import { useToast } from '@/components/Toast';
import { api, Pass, PassStatus } from '@/lib/api';
import { canViewAllPasses, canViewPasses, hasPermission } from '@/lib/permissions';
import { getStatusLabel, getUiLabels } from '@/lib/ui-labels';

const ALL_STATUSES: PassStatus[] = ['pending', 'approved', 'active', 'completed', 'rejected', 'expired', 'cancelled'];

export default function PassesPage() {
  const { user } = useAuth();
  const router = useRouter();
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
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const labels = getUiLabels(config);
  const canViewPassesList = canViewPasses(user);
  const canViewAll = canViewAllPasses(user);
  const canApprove = hasPermission(user, 'passes.approve');
  const canReception = hasPermission(user, 'passes.reception');
  const canCancelPass = (pass: Pass) =>
    pass.isOwner && ['pending', 'approved'].includes(pass.status);

  const canSharePass = (pass: Pass) => !['cancelled', 'rejected', 'expired'].includes(pass.status);

  useEffect(() => {
    if (user && !canViewPassesList && hasPermission(user, 'passes.templates')) {
      router.replace('/templates');
    }
  }, [user, canViewPassesList, router]);
  const canPrint = selected && ['approved', 'active'].includes(selected.status);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError('');
    api.getPasses({
      status: statusFilter || undefined,
      search: debouncedSearch || undefined,
      date: dateFilter || undefined,
    })
      .then(({ passes: data }) => {
        setPasses(data);
        setSelected((prev) => (prev ? data.find((p) => p.id === prev.id) || prev : null));
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [statusFilter, debouncedSearch, dateFilter]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (id: string, action: 'approve' | 'reject' | 'checkin' | 'checkout' | 'cancel', reason?: string) => {
    setActionLoading(true);
    try {
      let updated: Pass;
      if (action === 'approve') ({ pass: updated } = await api.updateStatus(id, 'approved'));
      else if (action === 'reject') ({ pass: updated } = await api.updateStatus(id, 'rejected', reason));
      else if (action === 'cancel') ({ pass: updated } = await api.updateStatus(id, 'cancelled'));
      else if (action === 'checkin') ({ pass: updated } = await api.checkIn(id));
      else ({ pass: updated } = await api.checkOut(id));
      setPasses((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setSelected(updated);
      setRejectReason('');
      const toastMsg = action === 'approve' ? labels.toasts.approved
        : action === 'reject' ? labels.toasts.rejected
        : action === 'checkin' ? labels.toasts.checkedIn
        : action === 'checkout' ? labels.toasts.checkedOut
        : labels.toasts.actionDone;
      toast(toastMsg, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const renderDetailActions = (pass: Pass) => (
    <div className="w-full space-y-3">
      {canApprove && pass.status === 'pending' && (
        <>
          <button className="btn btn-success w-full" disabled={actionLoading} onClick={() => handleAction(pass.id, 'approve')}>
            {labels.buttons.approve}
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
      {canReception && pass.status === 'approved' && (
        <button className="btn btn-success w-full" disabled={actionLoading} onClick={() => handleAction(pass.id, 'checkin')}>
          {labels.buttons.checkInBuilding}
        </button>
      )}
      {canReception && pass.status === 'active' && (
        <button className="btn btn-primary w-full" disabled={actionLoading} onClick={() => handleAction(pass.id, 'checkout')}>
          {labels.buttons.checkOut}
        </button>
      )}
      {canSharePass(pass) && (
        <SharePassActions passIdOrNumber={pass.id} passNumber={pass.passNumber} />
      )}
      {canCancelPass(pass) && (
        <button className="btn btn-danger w-full" disabled={actionLoading} onClick={() => handleAction(pass.id, 'cancel')}>
          {labels.buttons.cancelRequest}
        </button>
      )}
    </div>
  );

  if (user && !canViewPassesList) return null;

  return (
    <ProtectedLayout anyPermissions={['passes.view_own', 'passes.view_all', 'admin.panel']}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">{labels.pages.passesTitle}</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            {canViewAll ? labels.pages.passesSubtitleAll : labels.pages.passesSubtitleOwn}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
            <input
              className="input pl-9"
              placeholder={labels.passes.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <input className="input w-auto" type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
          <select className="input w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">{labels.passes.allStatuses}</option>
            {ALL_STATUSES.map((status) => (
              <option key={status} value={status}>{getStatusLabel(status, labels)}</option>
            ))}
          </select>
        </div>
      </div>

      {loadError && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md flex items-center justify-between">
          {loadError}
          <button className="btn btn-secondary text-xs" onClick={load}>{labels.buttons.retry}</button>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          {loading ? (
            <div className="card p-8 text-center text-[var(--muted)]">{labels.passes.loading}</div>
          ) : passes.length === 0 ? (
            <div className="card p-8 text-center text-[var(--muted)]">{labels.passes.notFound}</div>
          ) : (
            passes.map((pass) => (
              <PassCard
                key={pass.id}
                pass={pass}
                showCreator={canViewAll}
                onClick={() => setSelected(pass)}
                highlight={selected?.id === pass.id}
                actions={
                  <div className="w-full space-y-2">
                    {canSharePass(pass) && (
                      <SharePassActions passIdOrNumber={pass.id} passNumber={pass.passNumber} compact />
                    )}
                    {canCancelPass(pass) && (
                      <button
                        type="button"
                        className="btn btn-danger text-xs py-1.5"
                        disabled={actionLoading}
                        onClick={() => handleAction(pass.id, 'cancel')}
                      >
                        <Ban className="w-3.5 h-3.5" />
                        {labels.buttons.cancel}
                      </button>
                    )}
                  </div>
                }
              />
            ))
          )}
        </div>

        {selected && (
          <div className="lg:sticky lg:top-20 h-fit space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{labels.passes.detailTitle}</h2>
              <button
                className="p-1.5 rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-slate-100"
                onClick={() => setSelected(null)}
                aria-label={labels.passes.close}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {canPrint && (
              <PassPrintCard pass={selected} businessCenterName={selected.businessCenterName || config?.businessCenterName} />
            )}

            <PassCardBase
              pass={selected}
              labels={labels}
              variant="full"
              showTimeline
              showCreator={canViewAll}
              actions={renderDetailActions(selected)}
            />
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}