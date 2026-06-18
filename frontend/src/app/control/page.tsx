'use client';

import { useEffect, useState, useCallback } from 'react';
import { LogIn, LogOut, Users, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { PassCard } from '@/components/PassCard';
import { api, Pass } from '@/lib/api';

export default function ControlPage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [passes, setPasses] = useState<Pass[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, active: 0, completed: 0, approved: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

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

  const handleApprove = async (id: string) => {
    setActionId(id);
    try {
      await api.updateStatus(id, 'approved');
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
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
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setActionId(null);
    }
  };

  const handleCheckIn = async (id: string) => {
    setActionId(id);
    try {
      await api.checkIn(id);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setActionId(null);
    }
  };

  const handleCheckOut = async (id: string) => {
    setActionId(id);
    try {
      await api.checkOut(id);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setActionId(null);
    }
  };

  const pending = passes.filter((p) => p.status === 'pending');
  const approved = passes.filter((p) => p.status === 'approved');
  const active = passes.filter((p) => p.status === 'active');
  const completed = passes.filter((p) => p.status === 'completed');

  return (
    <ProtectedLayout roles={['security', 'admin']}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Контроль КПП</h1>
          <p className="text-[var(--muted)]">Журнал пропусков на выбранную дату</p>
        </div>
        <input
          className="input w-auto"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

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
          <div className="text-xs text-[var(--muted)]">На территории</div>
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
                На территории ({active.length})
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