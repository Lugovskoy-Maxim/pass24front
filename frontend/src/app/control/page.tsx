'use client';

import { Suspense, useEffect, useState, useCallback, FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { LogIn, LogOut, Users, CheckCircle, Clock, AlertCircle, Search } from 'lucide-react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { RECEPTION_SECTIONS, ReceptionPassCard } from '@/components/ReceptionPassCard';
import { useToast } from '@/components/Toast';
import { api, Pass } from '@/lib/api';

function ControlPageContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [passes, setPasses] = useState<Pass[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, active: 0, completed: 0, approved: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResult, setLookupResult] = useState<Pass | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError('');
    api.getJournal(date)
      .then((data) => {
        setPasses(data.passes);
        setStats(data.stats);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const runLookup = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLookupLoading(true);
    setLookupResult(null);
    try {
      const { pass } = await api.lookupPass(trimmed);
      setLookupResult(pass);
      setLookupQuery(trimmed);
      toast(`Найден пропуск ${pass.passNumber}`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Пропуск не найден', 'error');
    } finally {
      setLookupLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const passFromUrl = searchParams.get('pass');
    if (passFromUrl) {
      runLookup(passFromUrl);
    }
  }, [searchParams, runLookup]);

  const handleLookup = async (e: FormEvent) => {
    e.preventDefault();
    await runLookup(lookupQuery);
  };

  const handleApprove = async (id: string) => {
    setActionId(id);
    try {
      await api.updateStatus(id, 'approved');
      toast('Пропуск одобрен', 'success');
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
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
      toast('Пропуск отклонён', 'success');
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    } finally {
      setActionId(null);
    }
  };

  const handleCheckIn = async (id: string) => {
    setActionId(id);
    try {
      await api.checkIn(id);
      toast('Посетитель пропущен', 'success');
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    } finally {
      setActionId(null);
    }
  };

  const handleCheckOut = async (id: string) => {
    setActionId(id);
    try {
      await api.checkOut(id);
      toast('Выход зафиксирован', 'success');
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    } finally {
      setActionId(null);
    }
  };

  const renderActions = (pass: Pass) => {
    if (pass.status === 'pending') {
      return (
        <>
          <button
            className="btn btn-success flex-1"
            disabled={actionId === pass.id}
            onClick={() => handleApprove(pass.id)}
          >
            Одобрить
          </button>
          <input
            className="input text-sm sm:max-w-xs"
            placeholder="Причина отклонения"
            value={rejectReason[pass.id] || ''}
            onChange={(e) => setRejectReason((prev) => ({ ...prev, [pass.id]: e.target.value }))}
          />
          <button
            className="btn btn-danger shrink-0"
            disabled={actionId === pass.id || !rejectReason[pass.id]?.trim()}
            onClick={() => handleReject(pass.id)}
          >
            Отклонить
          </button>
        </>
      );
    }
    if (pass.status === 'approved') {
      return (
        <button
          className="btn btn-success w-full sm:w-auto sm:min-w-[200px]"
          disabled={actionId === pass.id}
          onClick={() => handleCheckIn(pass.id)}
        >
          <LogIn className="w-4 h-4" />
          Пропустить на вход
        </button>
      );
    }
    if (pass.status === 'active') {
      return (
        <button
          className="btn btn-primary w-full sm:w-auto sm:min-w-[200px]"
          disabled={actionId === pass.id}
          onClick={() => handleCheckOut(pass.id)}
        >
          <LogOut className="w-4 h-4" />
          Зафиксировать выход
        </button>
      );
    }
    return null;
  };

  const passesByStatus = (status: Pass['status']) => passes.filter((p) => p.status === status);

  const scrollToSection = (status: Pass['status']) => {
    const el = document.getElementById(`reception-section-${status}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const statCards: { key: Pass['status'] | 'total'; label: string; value: number; icon: typeof Users; iconClass: string; borderClass: string; scrollTo?: Pass['status'] }[] = [
    { key: 'total', label: 'Всего', value: stats.total, icon: Users, iconClass: 'text-[var(--primary)]', borderClass: '' },
    { key: 'pending', label: 'Новые', value: stats.pending, icon: AlertCircle, iconClass: 'text-amber-600', borderClass: 'border-b-amber-500', scrollTo: 'pending' },
    { key: 'approved', label: 'Ожидают', value: stats.approved, icon: Clock, iconClass: 'text-blue-600', borderClass: 'border-b-blue-500', scrollTo: 'approved' },
    { key: 'active', label: 'В здании', value: stats.active, icon: LogIn, iconClass: 'text-emerald-600', borderClass: 'border-b-emerald-500', scrollTo: 'active' },
    { key: 'completed', label: 'Выехали', value: stats.completed, icon: CheckCircle, iconClass: 'text-slate-500', borderClass: 'border-b-slate-400', scrollTo: 'completed' },
  ];

  return (
    <ProtectedLayout anyPermissions={['passes.reception', 'passes.lookup', 'admin.panel']}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Панель ресепшн</h1>
          <p className="text-[var(--muted)]">Журнал посетителей на выбранную дату</p>
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
            placeholder="Поиск по номеру пропуска (PS-2026-1234)"
            value={lookupQuery}
            onChange={(e) => setLookupQuery(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={lookupLoading || !lookupQuery.trim()}>
          {lookupLoading ? 'Поиск...' : 'Найти'}
        </button>
      </form>

      {lookupResult && (
        <div className="mb-6 animate-slide-up">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-[var(--muted)]">Результат поиска</p>
            <button type="button" className="btn btn-secondary text-sm" onClick={() => setLookupResult(null)}>
              Закрыть
            </button>
          </div>
          <ReceptionPassCard pass={lookupResult} highlight actions={renderActions(lookupResult)} />
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
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
        <div className="mb-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md flex items-center justify-between">
          {loadError}
          <button className="btn btn-secondary text-xs" onClick={load}>Повторить</button>
        </div>
      )}

      {loading ? (
        <div className="card p-8 text-center text-[var(--muted)]">Загрузка журнала...</div>
      ) : passes.length === 0 ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          На выбранную дату пропусков нет
        </div>
      ) : (
        <div className="space-y-8">
          {RECEPTION_SECTIONS.map(({ key, title, icon: Icon, iconClass, dimmed }) => {
            const sectionPasses = passesByStatus(key);
            if (sectionPasses.length === 0) return null;

            return (
              <section key={key} id={`reception-section-${key}`} className="scroll-mt-4">
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Icon className={`w-5 h-5 ${iconClass}`} />
                  {title}
                  <span className="text-sm font-normal text-[var(--muted)]">({sectionPasses.length})</span>
                </h2>
                <div className="grid gap-4">
                  {sectionPasses.map((pass) => (
                    <ReceptionPassCard
                      key={pass.id}
                      pass={pass}
                      dimmed={dimmed}
                      actions={renderActions(pass)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
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