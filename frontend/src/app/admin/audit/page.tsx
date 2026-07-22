'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Search, X } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { useToast } from '@/components/Toast';
import { api, AuditEntry, AuditFilters, AUDIT_ENTITY_LABELS, AUDIT_LABELS, formatAuditEntity, getErrorMessage } from '@/lib/api';
import { PageError } from '@/components/PageError';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useConfig } from '@/hooks/useConfig';
import { getUiLabels } from '@/lib/ui-labels';

const PAGE_SIZE = 50;

const EMPTY_FILTERS: AuditFilters = {
  dateFrom: '',
  dateTo: '',
  action: '',
  entityType: '',
  search: '',
};

export default function AdminAuditPage() {
  const { toast } = useToast();
  const ph = getUiLabels(useConfig()).placeholders;
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadErrorCause, setLoadErrorCause] = useState<unknown>(null);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<AuditFilters>(EMPTY_FILTERS);

  const fetchAudit = useCallback((
    off: number,
    nextFilters: AuditFilters,
    options?: { silent?: boolean },
  ) => {
    const silent = options?.silent;
    if (!silent) {
      setLoading(true);
      setLoadError('');
      setLoadErrorCause(null);
    }
    return api.admin.getAudit({ ...nextFilters, offset: off })
      .then((data) => {
        setEntries(data.entries);
        setTotal(data.total);
        setOffset(off);
      })
      .catch((err) => {
        if (!silent) {
          setLoadErrorCause(err);
          setLoadError(getErrorMessage(err, 'Ошибка загрузки'));
        }
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchAudit(0, appliedFilters);
  }, [appliedFilters, fetchAudit]);

  useAutoRefresh(
    () => fetchAudit(offset, appliedFilters, { silent: true }),
    { enabled: !exporting },
  );

  const applyFilters = () => {
    setAppliedFilters({ ...filters });
    setOffset(0);
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setOffset(0);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await api.admin.exportAudit(appliedFilters);
      toast('Выгрузка сохранена', 'success');
    } catch (err) {
      toast(getErrorMessage(err, 'Ошибка выгрузки'), 'error');
    } finally {
      setExporting(false);
    }
  };

  const hasActiveFilters = !!(
    appliedFilters.dateFrom ||
    appliedFilters.dateTo ||
    appliedFilters.action ||
    appliedFilters.entityType ||
    appliedFilters.search
  );

  return (
    <AdminLayout title="Журнал действий">
      <p className="text-[var(--muted)] -mt-4 mb-6">Официальный аудит всех операций в системе</p>

      {loadError && (
        <PageError
          className="mb-4"
          message={loadError}
          error={loadErrorCause}
          onRetry={() => fetchAudit(offset, appliedFilters)}
          retryLabel="Повторить"
        />
      )}

      <div className="card p-4 mb-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-1">
            <div>
              <label className="label">Дата с</label>
              <input
                className="input"
                type="date"
                value={filters.dateFrom || ''}
                onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Дата по</label>
              <input
                className="input"
                type="date"
                value={filters.dateTo || ''}
                onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Действие</label>
              <div className="select-wrap">
                <select
                  className="input"
                  value={filters.action || ''}
                  onChange={(e) => setFilters((prev) => ({ ...prev, action: e.target.value }))}
                >
                  <option value="">Все действия</option>
                  {Object.entries(AUDIT_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Тип объекта</label>
              <div className="select-wrap">
                <select
                  className="input"
                  value={filters.entityType || ''}
                  onChange={(e) => setFilters((prev) => ({ ...prev, entityType: e.target.value }))}
                >
                  <option value="">Все объекты</option>
                  {Object.entries(AUDIT_ENTITY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
            <input
              className="input input--icon-left"
              placeholder={ph.auditSearch}
              value={filters.search || ''}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary text-sm" onClick={applyFilters}>Применить</button>
            {hasActiveFilters && (
              <button type="button" className="btn btn-secondary text-sm" onClick={resetFilters}>
                <X className="w-4 h-4" />
                Сбросить
              </button>
            )}
            <button type="button" className="btn btn-secondary text-sm" disabled={exporting} onClick={handleExport}>
              <Download className="w-4 h-4" />
              {exporting ? 'Выгрузка...' : 'Скачать CSV'}
            </button>
          </div>
        </div>

        {hasActiveFilters && (
          <p className="text-xs text-[var(--muted)]">
            Показано {total} записей по выбранным фильтрам
          </p>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="surface-muted text-[var(--muted)]">
            <tr>
              <th className="text-left p-3 font-medium">Время</th>
              <th className="text-left p-3 font-medium">Действие</th>
              <th className="text-left p-3 font-medium hidden md:table-cell">Пользователь</th>
              <th className="text-left p-3 font-medium hidden sm:table-cell">Объект</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="p-8 text-center text-[var(--muted)]">Загрузка...</td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={4} className="p-8 text-center text-[var(--muted)]">Записей нет</td></tr>
            ) : entries.map((e) => (
              <tr key={e.id} className="border-t border-[var(--border)]">
                <td className="p-3 text-[var(--muted)] whitespace-nowrap">
                  {new Date(e.createdAt).toLocaleString('ru-RU')}
                </td>
                <td className="p-3 font-medium">{AUDIT_LABELS[e.action] || e.action}</td>
                <td className="p-3 hidden md:table-cell">{e.userName || e.userEmail || '—'}</td>
                <td className="p-3 hidden sm:table-cell text-[var(--muted)]">
                  {formatAuditEntity(e)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > PAGE_SIZE && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            className="btn btn-secondary text-sm"
            disabled={offset === 0 || loading}
            onClick={() => fetchAudit(Math.max(0, offset - PAGE_SIZE), appliedFilters)}
          >
            Назад
          </button>
          <span className="text-sm text-[var(--muted)] self-center">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} из {total}
          </span>
          <button
            className="btn btn-secondary text-sm"
            disabled={offset + PAGE_SIZE >= total || loading}
            onClick={() => fetchAudit(offset + PAGE_SIZE, appliedFilters)}
          >
            Далее
          </button>
        </div>
      )}
    </AdminLayout>
  );
}