'use client';

import { Suspense, useEffect, useState, useCallback, FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { LogIn, LogOut, Users, CheckCircle, Clock, AlertCircle, Search, X } from 'lucide-react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { PassListCard } from '@/components/PassListCard';
import { PassDetailPanel } from '@/components/PassDetailPanel';
import { getReceptionSections } from '@/components/ReceptionPassCard';
import { useToast } from '@/components/Toast';
import { useConfig } from '@/hooks/useConfig';
import { api, Pass, getErrorMessage } from '@/lib/api';
import { PageError } from '@/components/PageError';
import { useOverdueGuests } from '@/hooks/useOverdueGuests';
import { OverdueGuestsAlert } from '@/components/OverdueGuestsAlert';
import { canSeeOverdueAlerts } from '@/lib/permissions';
import { useAuth } from '@/lib/auth';
import { getGuestOverdueKind, getUiLabels } from '@/lib/ui-labels';

function ControlPageContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const config = useConfig();
  const labels = getUiLabels(config);
  const showOverdueAlerts = canSeeOverdueAlerts(user);
  const { passes: overduePasses } = useOverdueGuests(showOverdueAlerts);
  const receptionSections = getReceptionSections(labels);
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
    if (loading) return;
    setSelected((prev) => {
      if (prev) return passes.find((p) => p.id === prev.id) || passes[0] || null;
      return passes[0] || null;
    });
  }, [passes, loading]);

  const runLookup = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
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
      if (!inJournal && pass.visitDate !== date) {
        setDate(pass.visitDate);
      }
    } catch (err) {
      toast(getErrorMessage(err, 'Пропуск не найден'), 'error');
    } finally {
      setLookupLoading(false);
    }
  }, [toast, labels, passes, date]);

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
    const updated = data.find((p) => p.id === id);
    if (updated) setSelected(updated);
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

  const passesByStatus = (status: Pass['status']) => passes.filter((p) => p.status === status);
  const scrollToSection = (status: Pass['status']) => {
    const el = document.getElementById(`reception-section-${status}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const first = passesByStatus(status)[0];
    if (first) setSelected(first);
  };

  const statCards: { key: Pass['status'] | 'total'; label: string; value: number; icon: typeof Users; iconClass: string; borderClass: string; scrollTo?: Pass['status'] }[] = [
    { key: 'total', label: labels.reception.statTotal, value: stats.total, icon: Users, iconClass: 'text-[var(--primary)]', borderClass: '' },
    { key: 'pending', label: labels.reception.statPending, value: stats.pending, icon: AlertCircle, iconClass: 'text-amber-600', borderClass: 'border-b-amber-500', scrollTo: 'pending' },
    { key: 'approved', label: labels.reception.statApproved, value: stats.approved, icon: Clock, iconClass: 'text-[var(--accent)]', borderClass: 'border-b-[var(--accent)]', scrollTo: 'approved' },
    { key: 'active', label: labels.reception.statActive, value: stats.active, icon: LogIn, iconClass: 'text-emerald-600', borderClass: 'border-b-emerald-500', scrollTo: 'active' },
    { key: 'completed', label: labels.reception.statCompleted, value: stats.completed, icon: CheckCircle, iconClass: 'text-[var(--muted)]', borderClass: 'border-b-[var(--border-strong)]', scrollTo: 'completed' },
  ];

  return (
    <ProtectedLayout anyPermissions={['passes.reception', 'passes.lookup', 'admin.panel']}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">{labels.pages.receptionTitle}</h1>
          <p className="text-[var(--muted)]">{labels.pages.receptionSubtitle}</p>
        </div>
        <input
          className="input w-auto"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <form onSubmit={handleLookup} className="card p-4 mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
          <input
            className="input pl-9 font-mono"
            placeholder={labels.reception.lookupPlaceholder}
            value={lookupQuery}
            onChange={(e) => setLookupQuery(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={lookupLoading || !lookupQuery.trim()}>
          {lookupLoading ? '...' : labels.buttons.lookup}
        </button>
      </form>

      {showOverdueAlerts && (
        <OverdueGuestsAlert
          passes={overduePasses}
          labels={labels}
          linkHref="/control"
          linkLabel={labels.reception.sectionActive}
          className="mb-6"
        />
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {statCards.map(({ key, label, value, icon: Icon, iconClass, borderClass, scrollTo }) => {
          const clickable = scrollTo && value > 0;
          const Tag = clickable ? 'button' : 'div';
          return (
            <Tag
              key={key}
              type={clickable ? 'button' : undefined}
              onClick={clickable ? () => scrollToSection(scrollTo) : undefined}
              className={[
                'card p-3 text-center',
                borderClass ? `border-b-2 ${borderClass}` : '',
                clickable ? 'cursor-pointer hover:shadow-md transition-shadow' : '',
              ].filter(Boolean).join(' ')}
            >
              <Icon className={`w-5 h-5 mx-auto mb-1 ${iconClass}`} />
              <div className="text-xl font-bold">{value}</div>
              <div className="text-xs text-[var(--muted)]">{label}</div>
            </Tag>
          );
        })}
      </div>

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
        <div>
          {loading ? (
            <div className="card p-8 text-center text-[var(--muted)]">{labels.reception.journalLoading}</div>
          ) : passes.length === 0 ? (
            <div className="card p-8 text-center text-[var(--muted)]">{labels.reception.journalEmpty}</div>
          ) : (
            <div className="space-y-5">
              {receptionSections.map(({ key, title, icon: Icon, iconClass }) => {
                const sectionPasses = passesByStatus(key);
                if (sectionPasses.length === 0) return null;

                return (
                  <section key={key} id={`reception-section-${key}`} className="scroll-mt-4">
                    <h2 className="text-sm font-semibold mb-2 flex items-center gap-2 text-[var(--muted)] uppercase tracking-wide">
                      <Icon className={`w-4 h-4 ${iconClass}`} />
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
          <div className="lg:sticky lg:top-20 space-y-3">
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