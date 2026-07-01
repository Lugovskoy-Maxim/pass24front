'use client';

import { Suspense, useEffect, useState, useCallback, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogIn, LogOut, Users, CheckCircle, Clock, AlertCircle, Search, X } from 'lucide-react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { PassListCard } from '@/components/PassListCard';
import { PassDetailPanel } from '@/components/PassDetailPanel';
import { getReceptionSections } from '@/components/ReceptionPassCard';
import { useToast } from '@/components/Toast';
import { useConfig } from '@/hooks/useConfig';
import { api, Pass, getErrorMessage } from '@/lib/api';
import { PageError } from '@/components/PageError';
import { useElementInView } from '@/hooks/useElementInView';
import { useOverdueGuests } from '@/hooks/useOverdueGuests';
import { OverdueGuestsAlert } from '@/components/OverdueGuestsAlert';
import { canSeeOverdueAlerts } from '@/lib/permissions';
import { buildHistoryHref } from '@/lib/visit-history';
import { useAuth } from '@/lib/auth';
import { getGuestOverdueKind, getUiLabels } from '@/lib/ui-labels';
import { getAccentStatClass, getSectionHeadingClass } from '@/lib/pass-status';
import { StatusDonutChart } from '@/components/charts/StatusDonutChart';
import { ChartLegend } from '@/components/charts/ChartLegend';
import { statusChartColor } from '@/lib/chart-colors';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { PassStatus } from '@/lib/api';

function ControlPageContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const config = useConfig();
  const labels = getUiLabels(config);
  const showOverdueAlerts = canSeeOverdueAlerts(user);
  const { passes: overduePasses, refresh: refreshOverdue } = useOverdueGuests(showOverdueAlerts);
  const overdueIds = new Set(overduePasses.map((pass) => pass.id));
  const receptionSections = getReceptionSections(labels);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [passes, setPasses] = useState<Pass[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, active: 0, completed: 0, approved: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadErrorCause, setLoadErrorCause] = useState<unknown>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [selected, setSelected] = useState<Pass | null>(null);
  const [overdueSectionEl, setOverdueSectionEl] = useState<HTMLElement | null>(null);
  const overdueSectionInView = useElementInView(overdueSectionEl);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError('');
    return api.getJournal(date)
      .then((data) => {
        setPasses(data.passes);
        setStats(data.stats);
        return data.passes;
      })
      .catch((err) => {
        setLoadErrorCause(err);
        setLoadError(getErrorMessage(err, 'Ошибка загрузки'));
        return [] as Pass[];
      })
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(() => { load(); }, [load]);

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
    if (!trimmed) return;

    const isPassNumber = /^PS-/i.test(trimmed);
    if (!isPassNumber) {
      const digits = trimmed.replace(/\D/g, '');
      const isPhone = digits.length >= 7;
      router.push(buildHistoryHref({
        scope: 'visitor',
        ...(isPhone ? { visitorPhone: trimmed } : { visitorName: trimmed }),
      }));
      return;
    }

    setLookupLoading(true);
    try {
      const { pass } = await api.lookupPass(trimmed);
      setLookupQuery(trimmed);
      setSelected(pass);
      const overdueKind = getGuestOverdueKind(pass);
      if (overdueKind === 'past_end_time') {
        toast(labels.toasts.guestPastEndTime.replace('{time}', pass.visitTimeTo || ''), 'warning');
      } else if (overdueKind === 'past_date') {
        toast(labels.toasts.guestStillInside, 'warning');
      } else {
        toast(`${labels.toasts.passFound}: ${pass.passNumber}`, 'success');
      }
      const inJournal = passes.some((p) => p.id === pass.id);
      const isOverdueGuest = pass.status === 'active' && getGuestOverdueKind(pass) !== null;
      if (!inJournal && !isOverdueGuest && pass.visitDate !== date) {
        setDate(pass.visitDate);
      }
    } catch (err) {
      toast(getErrorMessage(err, 'Пропуск не найден'), 'error');
    } finally {
      setLookupLoading(false);
    }
  }, [toast, labels, passes, date, router]);

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

  const handleApprove = async (id: string) => {
    setActionId(id);
    try {
      await api.updateStatus(id, 'approved');
      toast(labels.toasts.approved, 'success');
      await refreshAfterAction(id);
    } catch (err) {
      toast(getErrorMessage(err, 'Ошибка'), 'error');
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (id: string) => {
    const reason = rejectReason[id]?.trim();
    if (!reason) return;
    setActionId(id);
    try {
      await api.updateStatus(id, 'rejected', reason);
      setRejectReason((prev) => ({ ...prev, [id]: '' }));
      toast(labels.toasts.rejected, 'success');
      await refreshAfterAction(id);
    } catch (err) {
      toast(getErrorMessage(err, 'Ошибка'), 'error');
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
      toast(getErrorMessage(err, 'Ошибка'), 'error');
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
      toast(getErrorMessage(err, 'Ошибка'), 'error');
    } finally {
      setActionId(null);
    }
  };

  const renderActions = (pass: Pass) => {
    if (pass.status === 'pending') {
      return (
        <>
          <button
            className="btn btn-success w-full"
            disabled={actionId === pass.id}
            onClick={() => handleApprove(pass.id)}
          >
            {labels.buttons.approve}
          </button>
          <input
            className="input"
            placeholder={labels.reception.rejectPlaceholder}
            value={rejectReason[pass.id] || ''}
            onChange={(e) => setRejectReason((prev) => ({ ...prev, [pass.id]: e.target.value }))}
          />
          <button
            className="btn btn-danger w-full"
            disabled={actionId === pass.id || !rejectReason[pass.id]?.trim()}
            onClick={() => handleReject(pass.id)}
          >
            {labels.buttons.reject}
          </button>
        </>
      );
    }
    if (pass.status === 'approved') {
      return (
        <button
          className="btn btn-success w-full"
          disabled={actionId === pass.id}
          onClick={() => handleCheckIn(pass.id)}
        >
          <LogIn className="w-4 h-4" />
          {labels.buttons.checkIn}
        </button>
      );
    }
    if (pass.status === 'active') {
      return (
        <button
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
    const filtered = passes.filter((p) => p.status === status);
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

  const journalChartData = [
    { key: 'pending', label: labels.reception.statPending, value: stats.pending, colorKey: 'pending' },
    { key: 'approved', label: labels.reception.statApproved, value: stats.approved, colorKey: 'approved' },
    { key: 'active', label: labels.reception.statActive, value: activeInBuildingCount, colorKey: 'active' },
    { key: 'completed', label: labels.reception.statCompleted, value: stats.completed, colorKey: 'completed' },
  ];
  const journalLegend = journalChartData.map((d) => ({
    ...d,
    color: statusChartColor(d.colorKey as PassStatus),
  }));

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
    { key: 'pending', label: labels.reception.statPending, value: stats.pending, icon: AlertCircle, onClick: () => scrollToSection('reception-section-pending', () => passesByStatus('pending')[0]) },
    { key: 'approved', label: labels.reception.statApproved, value: stats.approved, icon: Clock, onClick: () => scrollToSection('reception-section-approved', () => passesByStatus('approved')[0]) },
    { key: 'active', label: labels.reception.statActive, value: activeInBuildingCount, icon: LogIn, onClick: () => scrollToSection('reception-section-active', () => passesByStatus('active')[0]) },
    { key: 'completed', label: labels.reception.statCompleted, value: stats.completed, icon: CheckCircle, onClick: () => scrollToSection('reception-section-completed', () => passesByStatus('completed')[0]) },
  ];

  return (
    <ProtectedLayout anyPermissions={['passes.reception', 'passes.lookup', 'admin.panel']}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">{labels.pages.receptionTitle}</h1>
          <p className="text-[var(--muted)]">{labels.pages.receptionSubtitle}</p>
        </div>
        <input
          className="input input--auto"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <form onSubmit={handleLookup} className="card p-4 mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
          <input
            className="input input--icon-left font-mono"
            placeholder="Номер пропуска, ФИО, телефон или паспорт"
            value={lookupQuery}
            onChange={(e) => setLookupQuery(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={lookupLoading || !lookupQuery.trim()}>
          {lookupLoading ? '...' : labels.buttons.lookup}
        </button>
      </form>

      {showOverdueAlerts && overdueCount > 0 && !overdueSectionInView && (
        <OverdueGuestsAlert
          passes={overduePasses}
          labels={labels}
          onActionClick={scrollToOverdueSection}
          className="mb-6"
        />
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {statCards.map(({ key, label, value, icon: Icon, onClick }) => {
          const clickable = !!onClick && value > 0;
          const Tag = clickable ? 'button' : 'div';
          return (
            <Tag
              key={key}
              type={clickable ? 'button' : undefined}
              onClick={clickable ? onClick : undefined}
              className={[
                'card p-3 text-center',
                getAccentStatClass(key),
                clickable ? 'cursor-pointer accent-stat--interactive' : '',
              ].filter(Boolean).join(' ')}
            >
              <Icon className={`w-5 h-5 mx-auto mb-1 accent-stat__icon--${key}`} />
              <div className={`text-xl font-bold accent-stat__value--${key}`}>{value}</div>
              <div className="text-xs text-[var(--muted)]">{label}</div>
            </Tag>
          );
        })}
      </div>

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
            <div className="space-y-5">
              {showOverdueAlerts && overduePasses.length > 0 && (
                <section id="reception-section-overdue" ref={setOverdueSectionEl} className="scroll-mt-4">
                  <h2 className={`text-sm font-semibold mb-2 flex items-center gap-2 uppercase tracking-wide ${getSectionHeadingClass('overdue')}`}>
                    <AlertCircle className="w-4 h-4" />
                    {labels.reception.sectionOverdue}
                    <span className="font-normal normal-case opacity-80">({overduePasses.length})</span>
                  </h2>
                  <div className="flex flex-col gap-1.5 rounded-lg border theme-alert-subtle p-2">
                    {overduePasses.map((pass) => (
                      <PassListCard
                        key={pass.id}
                        pass={pass}
                        labels={labels}
                        selected={selected?.id === pass.id}
                        onClick={() => setSelected(pass)}
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
                      className={`text-sm font-semibold mb-2 flex items-center gap-2 uppercase tracking-wide ${getSectionHeadingClass(key)}`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {title}
                      <span className="font-normal normal-case">({sectionPasses.length})</span>
                    </h2>
                    <div className="flex flex-col gap-1.5">
                      {sectionPasses.map((pass) => (
                        <PassListCard
                          key={pass.id}
                          pass={pass}
                          labels={labels}
                          selected={selected?.id === pass.id}
                          onClick={() => setSelected(pass)}
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
          <div className="lg:sticky lg:top-20 space-y-3 min-w-0 max-w-full">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-base font-semibold text-[var(--muted)] uppercase tracking-wide text-[11px]">
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
              actions={renderActions(selected)}
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