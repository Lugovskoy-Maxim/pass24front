'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, Filter } from 'lucide-react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { PassCard } from '@/components/PassCard';
import { useAuth } from '@/lib/auth';
import { api, Pass, PassStatus, STATUS_LABELS } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';

export default function PassesPage() {
  const { user } = useAuth();
  const [passes, setPasses] = useState<Pass[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<Pass | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const isSecurity = user?.role === 'security' || user?.role === 'admin';

  const load = useCallback(() => {
    setLoading(true);
    api.getPasses({ status: statusFilter || undefined, search: search || undefined })
      .then(({ passes: data }) => setPasses(data))
      .finally(() => setLoading(false));
  }, [statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (id: string, action: 'approve' | 'reject' | 'checkin' | 'checkout', reason?: string) => {
    setActionLoading(true);
    try {
      let updated: Pass;
      if (action === 'approve') {
        ({ pass: updated } = await api.updateStatus(id, 'approved'));
      } else if (action === 'reject') {
        ({ pass: updated } = await api.updateStatus(id, 'rejected', reason));
      } else if (action === 'checkin') {
        ({ pass: updated } = await api.checkIn(id));
      } else {
        ({ pass: updated } = await api.checkOut(id));
      }
      setPasses((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setSelected(updated);
      setRejectReason('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <ProtectedLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">Заявки на пропуска</h1>
        <div className="flex gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
            <input
              className="input pl-9"
              placeholder="Поиск..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input w-auto"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Все статусы</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          {loading ? (
            <div className="card p-8 text-center text-[var(--muted)]">Загрузка...</div>
          ) : passes.length === 0 ? (
            <div className="card p-8 text-center text-[var(--muted)]">Заявки не найдены</div>
          ) : (
            passes.map((pass) => (
              <PassCard
                key={pass.id}
                pass={pass}
                onClick={() => setSelected(pass)}
              />
            ))
          )}
        </div>

        {selected && (
          <div className="card p-5 lg:sticky lg:top-20 h-fit">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Детали заявки</h2>
              <StatusBadge status={selected.status} />
            </div>

            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--muted)]">Номер</dt>
                <dd className="font-mono font-medium">{selected.passNumber}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--muted)]">Гость</dt>
                <dd>{selected.guestName}</dd>
              </div>
              {selected.guestPhone && (
                <div className="flex justify-between">
                  <dt className="text-[var(--muted)]">Телефон</dt>
                  <dd>{selected.guestPhone}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-[var(--muted)]">Дата визита</dt>
                <dd>{selected.visitDate} {selected.visitTimeFrom && `${selected.visitTimeFrom}–${selected.visitTimeTo}`}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--muted)]">Адрес</dt>
                <dd>кв. {selected.apartment}{selected.building && `, ${selected.building}`}</dd>
              </div>
              {selected.vehiclePlate && (
                <div className="flex justify-between">
                  <dt className="text-[var(--muted)]">Автомобиль</dt>
                  <dd className="font-mono">{selected.vehiclePlate} {selected.vehicleModel}</dd>
                </div>
              )}
              {selected.comment && (
                <div>
                  <dt className="text-[var(--muted)] mb-1">Комментарий</dt>
                  <dd className="bg-slate-50 p-2 rounded">{selected.comment}</dd>
                </div>
              )}
              {selected.rejectionReason && (
                <div>
                  <dt className="text-[var(--muted)] mb-1">Причина отклонения</dt>
                  <dd className="text-red-600">{selected.rejectionReason}</dd>
                </div>
              )}
              {selected.checkedInAt && (
                <div className="flex justify-between">
                  <dt className="text-[var(--muted)]">Въезд</dt>
                  <dd>{new Date(selected.checkedInAt).toLocaleString('ru')}</dd>
                </div>
              )}
              {selected.checkedOutAt && (
                <div className="flex justify-between">
                  <dt className="text-[var(--muted)]">Выезд</dt>
                  <dd>{new Date(selected.checkedOutAt).toLocaleString('ru')}</dd>
                </div>
              )}
            </dl>

            {isSecurity && (
              <div className="mt-5 pt-4 border-t border-[var(--border)] space-y-3">
                {selected.status === 'pending' && (
                  <>
                    <button
                      className="btn btn-success w-full"
                      disabled={actionLoading}
                      onClick={() => handleAction(selected.id, 'approve')}
                    >
                      Одобрить
                    </button>
                    <input
                      className="input"
                      placeholder="Причина отклонения"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                    <button
                      className="btn btn-danger w-full"
                      disabled={actionLoading || !rejectReason}
                      onClick={() => handleAction(selected.id, 'reject', rejectReason)}
                    >
                      Отклонить
                    </button>
                  </>
                )}
                {selected.status === 'approved' && (
                  <button
                    className="btn btn-success w-full"
                    disabled={actionLoading}
                    onClick={() => handleAction(selected.id, 'checkin')}
                  >
                    Пропустить на территорию
                  </button>
                )}
                {selected.status === 'active' && (
                  <button
                    className="btn btn-primary w-full"
                    disabled={actionLoading}
                    onClick={() => handleAction(selected.id, 'checkout')}
                  >
                    Зафиксировать выезд
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}