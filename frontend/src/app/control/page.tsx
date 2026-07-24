'use client';

import { Suspense, useEffect, useState, useCallback, useRef, FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { BarChart3, LogIn, LogOut, Users, CheckCircle, Clock, AlertCircle, Search, X } from 'lucide-react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { PassListCard } from '@/components/PassListCard';
import { PassDetailPanel } from '@/components/PassDetailPanel';
import { getReceptionSections } from '@/components/ReceptionPassCard';
import { useToast } from '@/components/Toast';
import { useConfig } from '@/hooks/useConfig';
import { api, Pass, getErrorMessage } from '@/lib/api';
import { PageError } from '@/components/PageError';
import { useElementInView } from '@/hooks/useElementInView';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useOverdueGuests } from '@/hooks/useOverdueGuests';
import { OverdueGuestsAlert } from '@/components/OverdueGuestsAlert';
import { canSeeOverdueAlerts } from '@/lib/permissions';
import { useAuth } from '@/lib/auth';
import { getGuestOverdueKind, getUiLabels } from '@/lib/ui-labels';
import { isAwaitingEntry } from '@/lib/pass-entry';
import { passRequiresCheckout } from '@/lib/pass-checkout';
import { getAccentStatClass, getSectionHeadingClass } from '@/lib/pass-status';
// Графики временно отключены
// import { StatusDonutChart } from '@/components/charts/StatusDonutChart';
// import { ChartLegend } from '@/components/charts/ChartLegend';
// import { statusChartColor } from '@/lib/chart-colors';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
function ControlPageContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const config = useConfig();
  const labels = getUiLabels(config);
  const showOverdueAlerts = canSeeOverdueAlerts(user);
  const { passes: overduePasses, refresh: refreshOverdue } = useOverdueGuests(showOverdueAlerts);
  const overdueIds = new Set(overduePasses.map((pass) => pass.id));
  const receptionSections = getReceptionSections(labels);
  const searchParams = useSearchParams();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [journalSearch, setJournalSearch] = useState('');
  const journalSearchRef = useRef('');
  const [passes, setPasses] = useState<Pass[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, active: 0, completed: 0, approved: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadErrorCause, setLoadErrorCause] = useState<unknown>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [rejectOpenId, setRejectOpenId] = useState<string | null>(null);
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [selected, setSelected] = useState<Pass | null>(null);
  const [overdueSectionEl, setOverdueSectionEl] = useState<HTMLElement | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const overdueSectionInView = useElementInView(overdueSectionEl);

  const load = useCallback((options?: { silent?: boolean }) => {
    const silent = options?.silent;
    if (!silent) {
      setLoading(true);
      setLoadError('');
    }
    return api.getJournal(date, journalSearchRef.current || undefined)
      .then((data) => {
        setPasses(data.passes);
        setStats(data.stats);
        return data.passes;
      })
      .catch((err) => {
        if (!silent) {
          setLoadErrorCause(err);
          setLoadError(getErrorMessage(err, 'Ошибка загрузки'));
        }
        return [] as Pass[];
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }, [date]);

  useEffect(() => { load(); }, [load]);

  useAutoRefresh(() => load({ silent: true }), { enabled: !actionId && !lookupLoading });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#reception-section-overdue') return;
    const timer = window.setTimeout(() => {
      document.getElementById('reception-section-overdue')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [loading, overduePasses.length]);

  useEffect(() => {
    if (loading) return;
    setSelected((prev) => {
      if (prev) {
        return passes.find((p) => p.id === prev.id)
          || overduePasses.find((p) => p.id === prev.id)
          || null;
      }
      return overduePasses[0] || passes[0] || null;
    });
  }, [passes, overduePasses, loading]);

  const runLookup = useCallback(async (q: string) => {
    const trimmed = q.trim();
    setJournalSearch(trimmed);
    journalSearchRef.current = trimmed;
    if (!trimmed) {
      setSelected(null);
      await load();
      return;
    }

    setLookupLoading(true);
    try {
      const data = await api.getJournal(date, trimmed);
      setPasses(data.passes);
      setStats(data.stats);

      if (data.passes.length > 0) {
        setSelected(data.passes[0]);
        toast(`Найдено: ${data.passes.length}`, 'success');
        return;
      }

      const isPassNumber = /^(Pass-|PS-)/i.test(trimmed);
      if (isPassNumber) {
        try {
          const { pass } = await api.lookupPass(trimmed);
          setSelected(pass);
          const overdueKind = getGuestOverdueKind(pass);
          if (overdueKind === 'past_end_time') {
            toast(labels.toasts.guestPastEndTime.replace('{time}', pass.visitTimeTo || ''), 'warning');
          } else if (overdueKind === 'past_date') {
            toast(labels.toasts.guestStillInside, 'warning');
          } else {
            toast(`${labels.toasts.passFound}: ${pass.passNumber}`, 'success');
          }
          const isOverdueGuest = pass.status === 'active' && getGuestOverdueKind(pass) !== null;
          if (!isOverdueGuest && pass.visitDate !== date) {
            setDate(pass.visitDate);
          }
          return;
        } catch {
          // fall through to not-found toast
        }
      }

      toast('По запросу ничего не найдено', 'warning');
      setSelected(null);
    } catch (err) {
      toast(getErrorMessage(err, 'Ошибка поиска'), 'error');
    } finally {
      setLookupLoading(false);
    }
  }, [toast, labels, date, load]);

  useEffect(() => {
    const passFromUrl = searchParams.get('pass');
    if (passFromUrl) runLookup(passFromUrl);
  }, [searchParams, runLookup]);

  const handleLookup = async (e: FormEvent) => {
    e.preventDefault();
    await runLookup(lookupQuery);
  };

  const refreshAfterAction = async (id: string) => {
    const data = await load();
    const freshOverdue = showOverdueAlerts ? await refreshOverdue() : overduePasses;
    const updated = data.find((p) => p.id === id) || freshOverdue.find((p) => p.id === id);
    if (updated) setSelected(updated);
    else setSelected(freshOverdue.find((p) => p.id !== id) || data[0] || null);
  };

  const handleReject = async (id: string) => {
    const reason = rejectReason[id]?.trim();
    if (!reason) return;
    setActionId(id);
    try {
      await api.updateStatus(id, 'rejected', reason);
      setRejectReason((prev) => ({ ...prev, [id]: '' }));
      setRejectOpenId(null);
      toast(labels.toasts.rejected, 'success');
      await refreshAfterAction(id);
    } catch (err) {
      toast(getErrorMessage(err, 'Не удалось выполнить действие'), 'error');
    } finally {
      setActionId(null);
    }
  };

  const handleCheckIn = async (id: string) => {
    setActionId(id);
    try {
      await api.checkIn(id);
      toast(labels.toasts.checkedIn, 'success');
      await refreshAfterAction(id);
    } catch (err) {
      toast(getErrorMessage(err, 'Не удалось выполнить действие'), 'error');
    } finally {
      setActionId(null);
    }
  };

  const handleCheckOut = async (id: string) => {
    setActionId(id);
    try {
      await api.checkOut(id);
      toast(labels.toasts.checkedOut, 'success');
      await refreshAfterAction(id);
    } catch (err) {
      toast(getErrorMessage(err, 'Не удалось выполнить действие'), 'error');
    } finally {
      setActionId(null);
    }
  };

  /** Compact actions for list cards: main info | actions | office */
  const renderCardActions = (pass: Pass) => {
    if (isAwaitingEntry(pass.status)) {
      const rejecting = rejectOpenId === pass.id;
      return (
        <>
          <button
            type="button"
            className="btn btn-success btn-sm"
            disabled={actionId === pass.id}
            onClick={() => handleCheckIn(pass.id)}
            title={labels.buttons.checkIn}
          >
            <LogIn className="w-3.5 h-3.5" />
            {labels.buttons.checkIn}
          </button>
          {rejecting ? (
            <>
              <input
                className="input"
                placeholder="Причина отказа"
                value={rejectReason[pass.id] || ''}
                onChange={(e) => setRejectReason((prev) => ({ ...prev, [pass.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && rejectReason[pass.id]?.trim()) {
                    e.preventDefault();
                    handleReject(pass.id);
                  }
                  if (e.key === 'Escape') setRejectOpenId(null);
                }}
                autoFocus
              />
              <div className="flex gap-1">
                <button
                  type="button"
                  className="btn btn-danger btn-sm flex-1"
                  disabled={actionId === pass.id || !rejectReason[pass.id]?.trim()}
                  onClick={() => handleReject(pass.id)}
                >
                  {labels.buttons.reject}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={actionId === pass.id}
                  onClick={() => setRejectOpenId(null)}
                  aria-label={labels.buttons.cancel}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={actionId === pass.id}
              onClick={() => {
                setRejectOpenId(pass.id);
                setSelected(pass);
              }}
              title={labels.buttons.reject}
            >
              {labels.buttons.reject}
            </button>
          )}
        </>
      );
    }
    if (pass.status === 'active' && passRequiresCheckout(pass)) {
      return (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={actionId === pass.id}
          onClick={() => handleCheckOut(pass.id)}
          title={labels.buttons.checkOut}
        >
          <LogOut className="w-3.5 h-3.5" />
          {labels.buttons.checkOut}
        </button>
      );
    }
    return null;
  };

  const renderDetailActions = (pass: Pass) => {
    if (isAwaitingEntry(pass.status)) {
      return (
        <>
          <button
            type="button"
            className="btn btn-success w-full"
            disabled={actionId === pass.id}
            onClick={() => handleCheckIn(pass.id)}
          >
            <LogIn className="w-4 h-4" />
            {labels.buttons.checkIn}
          </button>
          <input
            className="input"
            placeholder={labels.reception.rejectPlaceholder}
            value={rejectReason[pass.id] || ''}
            onChange={(e) => setRejectReason((prev) => ({ ...prev, [pass.id]: e.target.value }))}
          />
          <button
            type="button"
            className="btn btn-danger w-full"
            disabled={actionId === pass.id || !rejectReason[pass.id]?.trim()}
            onClick={() => handleReject(pass.id)}
          >
            {labels.buttons.reject}
          </button>
        </>
      );
    }
    if (pass.status === 'active' && passRequiresCheckout(pass)) {
      return (
        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={actionId === pass.id}
          onClick={() => handleCheckOut(pass.id)}
        >
          <LogOut className="w-4 h-4" />
          {labels.buttons.checkOut}
        </button>
      );
    }
    return null;
  };

  const passesByStatus = (status: Pass['status']) => {
    const filtered = status === 'approved'
      ? passes.filter((p) => isAwaitingEntry(p.status))
      : passes.filter((p) => p.status === status);
    if (status === 'active' && showOverdueAlerts) {
      return filtered.filter((p) => !overdueIds.has(p.id));
    }
    return filtered;
  };

  const scrollToSection = (sectionId: string, selectFirst?: () => Pass | undefined) => {
    const el = document.getElementById(sectionId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const first = selectFirst?.();
    if (first) setSelected(first);
  };

  const scrollToOverdueSection = () => {
    scrollToSection('reception-section-overdue', () => overduePasses[0]);
  };

  const overdueCount = showOverdueAlerts ? overduePasses.length : 0;
  const activeInBuildingCount = showOverdueAlerts
    ? passesByStatus('active').length
    : stats.active;

  // Графики временно отключены
  // const journalChartData = [
  //   { key: 'pending', label: labels.reception.statPending, value: stats.pending, colorKey: 'pending' },
  //   { key: 'approved', label: labels.reception.statApproved, value: stats.approved, colorKey: 'approved' },
  //   { key: 'active', label: labels.reception.statActive, value: activeInBuildingCount, colorKey: 'active' },
  //   { key: 'completed', label: labels.reception.statCompleted, value: stats.completed, colorKey: 'completed' },
  // ];
  // const journalLegend = journalChartData.map((d) => ({
  //   ...d,
  //   color: statusChartColor(d.colorKey as PassStatus),
  // }));

  const statCards: {
    key: Pass['status'] | 'total' | 'overdue';
    label: string;
    value: number;
    icon: typeof Users;
    onClick?: () => void;
  }[] = [
    { key: 'total', label: labels.reception.statTotal, value: stats.total, icon: Users },
    ...(showOverdueAlerts && overdueCount > 0
      ? [{
          key: 'overdue' as const,
          label: labels.reception.statOverdue,
          value: overdueCount,
          icon: AlertCircle,
          onClick: scrollToOverdueSection,
        }]
      : []),
    { key: 'approved', label: labels.reception.statApproved, value: stats.approved, icon: Clock, onClick: () => scrollToSection('reception-section-approved', () => passesByStatus('approved')[0]) },
    { key: 'active', label: labels.reception.statActive, value: activeInBuildingCount, icon: LogIn, onClick: () => scrollToSection('reception-section-active', () => passesByStatus('active')[0]) },
    { key: 'completed', label: labels.reception.statCompleted, value: stats.completed, icon: CheckCircle, onClick: () => scrollToSection('reception-section-completed', () => passesByStatus('completed')[0]) },
  ];

  return (
    <ProtectedLayout anyPermissions={['passes.reception', 'passes.lookup', 'admin.panel']}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="page-title">{labels.pages.receptionTitle}</h1>
          <p className="text-[var(--muted)] text-sm mt-0.5">{labels.pages.receptionSubtitle}</p>
        </div>
        <input
          className="input input--auto"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Дата журнала"
        />
      </div>

      <form onSubmit={handleLookup} className="card p-3 sm:p-4 mb-5 flex flex-col sm:flex-row gap-2.5 sm:gap-3 sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)] pointer-events-none" />
          <input
            className="input input--icon-left font-mono"
            placeholder={labels.reception.lookupPlaceholder}
            value={lookupQuery}
            onChange={(e) => setLookupQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2 shrink-0">
          {lookupQuery.trim() && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setLookupQuery('');
                journalSearchRef.current = '';
                setJournalSearch('');
                setSelected(null);
                load();
              }}
              aria-label="Очистить поиск"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button type="submit" className="btn btn-primary flex-1 sm:flex-none" disabled={lookupLoading || !lookupQuery.trim()}>
            {lookupLoading ? '...' : labels.buttons.lookup}
          </button>
        </div>
      </form>

      {showOverdueAlerts && overdueCount > 0 && !overdueSectionInView && (
        <OverdueGuestsAlert
          passes={overduePasses}
          labels={labels}
          onActionClick={scrollToOverdueSection}
          className="mb-5"
        />
      )}

      <div className="mb-5">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setStatsOpen((open) => !open)}
          aria-expanded={statsOpen}
        >
          <BarChart3 className="w-4 h-4" />
          {statsOpen ? labels.reception.hideStats : labels.reception.showStats}
        </button>

        {statsOpen && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mt-3">
            {statCards.map(({ key, label, value, icon: Icon, onClick }) => {
              const clickable = !!onClick && value > 0;
              const Tag = clickable ? 'button' : 'div';
              return (
                <Tag
                  key={key}
                  type={clickable ? 'button' : undefined}
                  onClick={clickable ? onClick : undefined}
                  className={[
                    'card p-2.5 text-center transition-transform',
                    getAccentStatClass(key),
                    clickable ? 'cursor-pointer accent-stat--interactive hover:-translate-y-0.5' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <Icon className={`w-4 h-4 mx-auto mb-1 accent-stat__icon--${key}`} />
                  <div className={`text-lg font-bold leading-none accent-stat__value--${key}`}>{value}</div>
                  <div className="text-[11px] text-[var(--muted)] mt-0.5">{label}</div>
                </Tag>
              );
            })}
          </div>
        )}
      </div>

      {/* Графики временно отключены
      {stats.total > 0 && (
        <div className="card p-4 mb-6 grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4 items-center">
          <div>
            <h2 className="text-sm font-semibold mb-1">Журнал на {new Date(date + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</h2>
            <p className="text-xs text-[var(--muted)]">Распределение пропусков по статусам</p>
            <ChartLegend items={journalLegend} />
          </div>
          <StatusDonutChart data={journalChartData} height={160} innerRadius={40} />
        </div>
      )}
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

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] gap-4 lg:gap-5 items-start">
        <div className="min-w-0">
          {loading ? (
            <ListSkeleton rows={4} />
          ) : passes.length === 0 && overdueCount === 0 ? (
            <div className="card">
              <EmptyState
                icon={Users}
                title={labels.reception.journalEmpty}
                description="Выберите другую дату или найдите пропуск по номеру / ФИО"
              />
            </div>
          ) : (
            <div className="space-y-4">
              {showOverdueAlerts && overduePasses.length > 0 && (
                <section id="reception-section-overdue" ref={setOverdueSectionEl} className="scroll-mt-4">
                  <h2 className={`text-xs font-semibold mb-2 flex items-center gap-2 uppercase tracking-wide ${getSectionHeadingClass('overdue')}`}>
                    <AlertCircle className="w-3.5 h-3.5" />
                    {labels.reception.sectionOverdue}
                    <span className="font-normal normal-case opacity-80">({overduePasses.length})</span>
                  </h2>
                  <div className="flex flex-col gap-2 rounded-lg border theme-alert-subtle p-2">
                    {overduePasses.map((pass) => (
                      <PassListCard
                        key={pass.id}
                        pass={pass}
                        labels={labels}
                        selected={selected?.id === pass.id}
                        onClick={() => setSelected(pass)}
                        actions={renderCardActions(pass)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {receptionSections.map(({ key, title, icon: Icon }) => {
                const sectionPasses = passesByStatus(key);
                if (sectionPasses.length === 0) return null;

                return (
                  <section key={key} id={`reception-section-${key}`} className="scroll-mt-4">
                    <h2
                      className={`text-xs font-semibold mb-2 flex items-center gap-2 uppercase tracking-wide ${getSectionHeadingClass(key)}`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      {title}
                      <span className="font-normal normal-case opacity-70">({sectionPasses.length})</span>
                    </h2>
                    <div className="flex flex-col gap-2">
                      {sectionPasses.map((pass) => (
                        <PassListCard
                          key={pass.id}
                          pass={pass}
                          labels={labels}
                          selected={selected?.id === pass.id}
                          onClick={() => setSelected(pass)}
                          actions={renderCardActions(pass)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        {selected && (
          <div className="lg:sticky lg:top-20 space-y-2 min-w-0 max-w-full">
            <div className="flex items-center justify-between px-1">
              <h2 className="font-semibold text-[var(--muted)] uppercase tracking-wide text-[11px]">
                {labels.reception.selectedPass}
              </h2>
              <button
                type="button"
                className="p-1.5 rounded-md text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--m-block)] lg:hidden"
                onClick={() => setSelected(null)}
                aria-label={labels.passes.close}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <PassDetailPanel
              pass={selected}
              labels={labels}
              showCreator
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

export default function ControlPage() {
  return (
    <Suspense fallback={<ProtectedLayout anyPermissions={['passes.reception', 'passes.lookup', 'admin.panel']}><div className="animate-pulse text-[var(--muted)]">Загрузка...</div></ProtectedLayout>}>
      <ControlPageContent />
    </Suspense>
  );
}