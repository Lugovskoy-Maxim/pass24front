'use client';

import { useEffect, useState, useCallback, FormEvent } from 'react';
import { LogIn, LogOut, Users, CheckCircle, Clock, AlertCircle, Search } from 'lucide-react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { PassCard } from '@/components/PassCard';
import { StatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/components/Toast';
import { api, Pass } from '@/lib/api';

export default function ControlPage() {
  const { toast } = useToast();
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

  const handleLookup = async (e: FormEvent) => {
    e.preventDefault();
    const q = lookupQuery.trim();
    if (!q) return;
    setLookupLoading(true);
    setLookupResult(null);
    try {
      const { pass } = await api.lookupPass(q);
      setLookupResult(pass);
      toast(`Найден пропуск ${pass.passNumber}`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Пропуск не найден', 'error');
    } finally {
      setLookupLoading(false);
    }
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

  const pending = passes.filter((p) => p.status === 'pending');
  const approved = passes.filter((p) => p.status === 'approved');
  const active = passes.filter((p) => p.status === 'active');
  const completed = passes.filter((p) => p.status === 'completed');

  return (
    <ProtectedLayout anyPermissions={['passes.reception', 'passes.lookup']}>
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
            placeholder="Быстрый поиск по номеру пропуска (20260619-0001)"
            value={lookupQuery}
            onChange={(e) => setLookupQuery(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={lookupLoading || !lookupQuery.trim()}>
          {lookupLoading ? 'Поиск...' : 'Найти'}
        </button>
      </form>

      {lookupResult && (
        <div className="card p-4 mb-6 border-[var(--primary)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Результат поиска</h3>
            <StatusBadge status={lookupResult.status} />
          </div>
          <PassCard pass={lookupResult} />
          <div className="mt-3 flex gap-2">
            {lookupResult.status === 'approved' && (
              <button className="btn btn-success text-sm" disabled={actionId === lookupResult.id} onClick={() => handleCheckIn(lookupResult.id)}>
                <LogIn className="w-4 h-4" /> Пропустить
              </button>
            )}
            {lookupResult.status === 'active' && (
              <button className="btn btn-primary text-sm" disabled={actionId === lookupResult.id} onClick={() => handleCheckOut(lookupResult.id)}>
                <LogOut className="w-4 h-4" /> Выезд
              </button>
            )}
            <button className="btn btn-secondary text-sm" onClick={() => setLookupResult(null)}>Закрыть</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
        <div className="card p-3 text-center">
          <Users className="w-5 h-5 mx-auto mb-1 text-[var(--primary)]" />
          <div className="text-xl font-bold">{stats.total}</div>
          <div className="text-xs text-[var(--muted)]">Всего</div>
        </div>
        <div className="card p-3 text-center">
          <AlertCircle className="w-5 h-5 mx-auto mb-1 text-amber-600" />
          <div className="text-xl font-bold">{stats.pending}</div>
          <div className="text-xs text-[var(--muted)]">Новые</div>
        </div>
        <div className="card p-3 text-center">
          <Clock className="w-5 h-5 mx-auto mb-1 text-blue-600" />
          <div className="text-xl font-bold">{stats.approved}</div>
          <div className="text-xs text-[var(--muted)]">Ожидают</div>
        </div>
        <div className="card p-3 text-center">
          <LogIn className="w-5 h-5 mx-auto mb-1 text-emerald-600" />
          <div className="text-xl font-bold">{stats.active}</div>
          <div className="text-xs text-[var(--muted)]">В здании</div>
        </div>
        <div className="card p-3 text-center">
          <CheckCircle className="w-5 h-5 mx-auto mb-1 text-slate-500" />
          <div className="text-xl font-bold">{stats.completed}</div>
          <div className="text-xs text-[var(--muted)]">Выехали</div>
        </div>
      </div>

      {loadError && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md flex items-center justify-between">
          {loadError}
          <button className="btn btn-secondary text-xs" onClick={load}>Повторить</button>
        </div>
      )}

      {loading ? (
        <div className="card p-8 text-center text-[var(--muted)]">Загрузка журнала...</div>
      ) : (
        <div className="space-y-8">
          {pending.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                На рассмотрении ({pending.length})
              </h2>
              <div className="grid gap-3">
                {pending.map((pass) => (
                  <PassCard
                    key={pass.id}
                    pass={pass}
                    actions={
                      <div className="flex flex-col gap-2 w-full">
                        <button
                          className="btn btn-success text-sm"
                          disabled={actionId === pass.id}
                          onClick={() => handleApprove(pass.id)}
                        >
                          Одобрить
                        </button>
                        <input
                          className="input text-sm"
                          placeholder="Причина отклонения"
                          value={rejectReason[pass.id] || ''}
                          onChange={(e) => setRejectReason((prev) => ({ ...prev, [pass.id]: e.target.value }))}
                        />
                        <button
                          className="btn btn-danger text-sm"
                          disabled={actionId === pass.id || !rejectReason[pass.id]?.trim()}
                          onClick={() => handleReject(pass.id)}
                        >
                          Отклонить
                        </button>
                      </div>
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {approved.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                Ожидают въезда ({approved.length})
              </h2>
              <div className="grid gap-3">
                {approved.map((pass) => (
                  <PassCard
                    key={pass.id}
                    pass={pass}
                    actions={
                      <button
                        className="btn btn-success text-sm"
                        disabled={actionId === pass.id}
                        onClick={() => handleCheckIn(pass.id)}
                      >
                        <LogIn className="w-4 h-4" />
                        Пропустить
                      </button>
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {active.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <LogIn className="w-5 h-5 text-emerald-600" />
                В здании ({active.length})
              </h2>
              <div className="grid gap-3">
                {active.map((pass) => (
                  <PassCard
                    key={pass.id}
                    pass={pass}
                    actions={
                      <button
                        className="btn btn-primary text-sm"
                        disabled={actionId === pass.id}
                        onClick={() => handleCheckOut(pass.id)}
                      >
                        <LogOut className="w-4 h-4" />
                        Выезд
                      </button>
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {completed.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-slate-500" />
                Завершённые ({completed.length})
              </h2>
              <div className="grid gap-3 opacity-75">
                {completed.map((pass) => (
                  <PassCard key={pass.id} pass={pass} />
                ))}
              </div>
            </section>
          )}

          {passes.length === 0 && (
            <div className="card p-8 text-center text-[var(--muted)]">
              На выбранную дату пропусков нет
            </div>
          )}
        </div>
      )}
    </ProtectedLayout>
  );
}