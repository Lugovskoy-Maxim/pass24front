'use client';

import { useEffect, useState, useCallback } from 'react';
import { LogIn, LogOut, Users, CheckCircle, Clock } from 'lucide-react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { PassCard } from '@/components/PassCard';
import { api, Pass } from '@/lib/api';

export default function ControlPage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [passes, setPasses] = useState<Pass[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, completed: 0, approved: 0 });
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.getJournal(date)
      .then((data) => {
        setPasses(data.passes);
        setStats(data.stats);
      })
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const handleCheckIn = async (id: string) => {
    setActionId(id);
    try {
      const { pass } = await api.checkIn(id);
      setPasses((prev) => prev.map((p) => (p.id === id ? pass : p)));
      setStats((s) => ({ ...s, active: s.active + 1, approved: s.approved - 1 }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setActionId(null);
    }
  };

  const handleCheckOut = async (id: string) => {
    setActionId(id);
    try {
      const { pass } = await api.checkOut(id);
      setPasses((prev) => prev.map((p) => (p.id === id ? pass : p)));
      setStats((s) => ({ ...s, active: s.active - 1, completed: s.completed + 1 }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setActionId(null);
    }
  };

  const approved = passes.filter((p) => p.status === 'approved');
  const active = passes.filter((p) => p.status === 'active');
  const completed = passes.filter((p) => p.status === 'completed');

  return (
    <ProtectedLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Контроль КПП</h1>
          <p className="text-[var(--muted)]">Журнал пропусков на сегодня</p>
        </div>
        <input
          className="input w-auto"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="card p-3 text-center">
          <Users className="w-5 h-5 mx-auto mb-1 text-[var(--primary)]" />
          <div className="text-xl font-bold">{stats.total}</div>
          <div className="text-xs text-[var(--muted)]">Всего</div>
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

      {loading ? (
        <div className="card p-8 text-center text-[var(--muted)]">Загрузка журнала...</div>
      ) : (
        <div className="space-y-8">
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