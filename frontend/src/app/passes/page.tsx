'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { PassCard } from '@/components/PassCard';
import { useAuth } from '@/lib/auth';
import { useDebounce } from '@/hooks/useDebounce';
import { api, Pass, STATUS_LABELS } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';

export default function PassesPage() {
  const { user } = useAuth();
  const [passes, setPasses] = useState<Pass[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<Pass | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const isSecurity = user?.role === 'security' || user?.role === 'admin';
  const isOwner = selected && user && (selected.createdBy === user.id || user.role === 'admin');

  const load = useCallback(() => {
    setLoading(true);
    setLoadError('');
    api.getPasses({ status: statusFilter || undefined, search: debouncedSearch || undefined })
      .then(({ passes: data }) => {
        setPasses(data);
        setSelected((prev) => (prev ? data.find((p) => p.id === prev.id) || prev : null));
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [statusFilter, debouncedSearch]);

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
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <ProtectedLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">Пропуска</h1>
        <div className="flex gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
            <input className="input pl-9" placeholder="Поиск..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Все статусы</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {loadError && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md flex items-center justify-between">
          {loadError}
          <button className="btn btn-secondary text-xs" onClick={load}>Повторить</button>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          {loading ? (
            <div className="card p-8 text-center text-[var(--muted)]">Загрузка...</div>
          ) : passes.length === 0 ? (
            <div className="card p-8 text-center text-[var(--muted)]">Пропуска не найдены</div>
          ) : (
            passes.map((pass) => <PassCard key={pass.id} pass={pass} onClick={() => setSelected(pass)} />)
          )}
        </div>

        {selected && (
          <div className="card p-5 lg:sticky lg:top-20 h-fit">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Детали пропуска</h2>
              <div className="flex items-center gap-2">
                <StatusBadge status={selected.status} />
                <button className="p-1 text-[var(--muted)] hover:text-[var(--text)]" onClick={() => setSelected(null)} aria-label="Закрыть">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)] shrink-0">Номер</dt>
                <dd className="font-mono font-medium text-right">{selected.passNumber}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)] shrink-0">Посетитель</dt>
                <dd className="text-right">{selected.visitorName}</dd>
              </div>
              {selected.companyName && (
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted)] shrink-0">Компания</dt>
                  <dd className="text-right">{selected.companyName}</dd>
                </div>
              )}
              {selected.visitPurpose && (
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted)] shrink-0">Цель визита</dt>
                  <dd className="text-right">{selected.visitPurpose}</dd>
                </div>
              )}
              {selected.visitorPhone && (
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted)] shrink-0">Телефон</dt>
                  <dd className="text-right">{selected.visitorPhone}</dd>
                </div>
              )}
              {selected.creatorName && isSecurity && (
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted)] shrink-0">Заказал</dt>
                  <dd className="text-right">{selected.creatorName}{selected.creatorCompany && ` (${selected.creatorCompany})`}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)] shrink-0">Дата визита</dt>
                <dd className="text-right">{selected.visitDate} {selected.visitTimeFrom && `${selected.visitTimeFrom}–${selected.visitTimeTo}`}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)] shrink-0">Офис</dt>
                <dd className="text-right">оф. {selected.office}{selected.floor && `, ${selected.floor} эт.`}</dd>
              </div>
              {selected.vehiclePlate && (
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted)] shrink-0">Автомобиль</dt>
                  <dd className="font-mono text-right">{selected.vehiclePlate} {selected.vehicleModel}</dd>
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
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted)] shrink-0">Вход</dt>
                  <dd className="text-right">{new Date(selected.checkedInAt).toLocaleString('ru-RU')}</dd>
                </div>
              )}
              {selected.checkedOutAt && (
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted)] shrink-0">Выход</dt>
                  <dd className="text-right">{new Date(selected.checkedOutAt).toLocaleString('ru-RU')}</dd>
                </div>
              )}
            </dl>

            <div className="mt-5 pt-4 border-t border-[var(--border)] space-y-3">
              {isSecurity && selected.status === 'pending' && (
                <>
                  <button className="btn btn-success w-full" disabled={actionLoading} onClick={() => handleAction(selected.id, 'approve')}>Одобрить</button>
                  <input className="input" placeholder="Причина отклонения" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                  <button className="btn btn-danger w-full" disabled={actionLoading || !rejectReason.trim()} onClick={() => handleAction(selected.id, 'reject', rejectReason)}>Отклонить</button>
                </>
              )}
              {isSecurity && selected.status === 'approved' && (
                <button className="btn btn-success w-full" disabled={actionLoading} onClick={() => handleAction(selected.id, 'checkin')}>Впустить в здание</button>
              )}
              {isSecurity && selected.status === 'active' && (
                <button className="btn btn-primary w-full" disabled={actionLoading} onClick={() => handleAction(selected.id, 'checkout')}>Зафиксировать выход</button>
              )}
              {isOwner && selected.status === 'pending' && (
                <button className="btn btn-secondary w-full" disabled={actionLoading} onClick={() => handleAction(selected.id, 'cancel')}>Отменить заявку</button>
              )}
            </div>
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}