'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Search, Table2, X } from 'lucide-react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { PageError } from '@/components/PageError';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/auth';
import { useConfig } from '@/hooks/useConfig';
import {
  api,
  Pass,
  PassExportFilters,
  PassExportFiltersInput,
  PassStatus,
  PassType,
  TYPE_LABELS,
  getErrorMessage,
} from '@/lib/api';
import { getLocalDateString } from '@/lib/local-date';
import { canViewAllPasses, canViewPasses } from '@/lib/permissions';
import { getStatusLabel, getUiLabels } from '@/lib/ui-labels';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';

const PAGE_SIZE = 50;
const ALL_STATUSES: PassStatus[] = ['pending', 'approved', 'active', 'completed', 'rejected', 'expired', 'cancelled'];

function defaultPeriod() {
  const today = getLocalDateString();
  return { dateFrom: `${today.slice(0, 8)}01`, dateTo: today };
}

function formatVisitDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('ru-RU');
}

export default function PassesReportPage() {
  const { user } = useAuth();
  const config = useConfig();
  const labels = getUiLabels(config);
  const { toast } = useToast();
  const showCreator = canViewAllPasses(user);

  const [filters, setFilters] = useState<PassExportFiltersInput>(() => ({
    ...defaultPeriod(),
    status: '',
    search: '',
    passType: '',
    propertyId: '',
    officeId: '',
    tenantId: '',
  }));
  const [applied, setApplied] = useState<PassExportFiltersInput>(() => ({ ...defaultPeriod() }));
  const [options, setOptions] = useState<PassExportFilters | null>(null);
  const [passes, setPasses] = useState<Pass[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadErrorCause, setLoadErrorCause] = useState<unknown>(null);

  useEffect(() => {
    api.getPassExportFilters().then(setOptions).catch(() => setOptions(null));
  }, []);

  const officesInBc = useMemo(() => {
    if (!options) return [];
    if (!filters.propertyId) return options.offices;
    return options.offices.filter((o) => o.propertyId === filters.propertyId);
  }, [options, filters.propertyId]);

  const fetchReport = useCallback((
    nextApplied: PassExportFiltersInput,
    nextOffset: number,
    options?: { silent?: boolean },
  ) => {
    const silent = options?.silent;
    if (!silent) {
      setLoading(true);
      setLoadError('');
      setLoadErrorCause(null);
    }
    return api.getPassReport({ ...nextApplied, offset: nextOffset, limit: PAGE_SIZE })
      .then((data) => {
        setPasses(data.passes);
        setTotal(data.total);
        setOffset(data.offset);
        setApplied(nextApplied);
      })
      .catch((err) => {
        if (!silent) {
          setLoadErrorCause(err);
          setLoadError(getErrorMessage(err, 'Ошибка загрузки'));
          setPasses([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!user || !canViewPasses(user)) return;
    fetchReport({ ...defaultPeriod() }, 0);
  }, [user, fetchReport]);

  useAutoRefresh(
    () => fetchReport(applied, offset, { silent: true }),
    { enabled: !!user && canViewPasses(user) && !exporting },
  );

  const applyFilters = () => {
    if (!filters.dateFrom || !filters.dateTo) {
      toast('Укажите период: дата с и дата по', 'error');
      return;
    }
    if (filters.dateFrom > filters.dateTo) {
      toast('Дата «с» не может быть позже даты «по»', 'error');
      return;
    }
    fetchReport({ ...filters }, 0);
  };

  const resetFilters = () => {
    const period = defaultPeriod();
    const next: PassExportFiltersInput = {
      ...period,
      status: '',
      search: '',
      passType: '',
      propertyId: '',
      officeId: '',
      tenantId: '',
    };
    setFilters(next);
    fetchReport(next, 0);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await api.exportPasses(applied);
      toast('Выгрузка сохранена', 'success');
    } catch (err) {
      toast(getErrorMessage(err, 'Ошибка выгрузки'), 'error');
    } finally {
      setExporting(false);
    }
  };

  const hasActiveFilters = !!(
    applied.search
    || applied.status
    || applied.passType
    || applied.propertyId
    || applied.officeId
    || applied.tenantId
  );

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const showTenantFilter = (options?.tenants.length ?? 0) > 0;

  // Нельзя return null до ProtectedLayout — иначе гость увидит пустую страницу без редиректа
  return (
    <ProtectedLayout anyPermissions={['passes.view_own', 'passes.view_all', 'admin.panel']}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <Link href="/passes" className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--accent)] mb-2">
            <ArrowLeft className="w-4 h-4" />
            {labels.buttons.backToPasses}
          </Link>
          <h1 className="page-title flex items-center gap-2">
            <Table2 className="w-6 h-6 text-[var(--primary)]" />
            {labels.pages.passesReportTitle}
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            {options?.scope === 'own'
              ? 'Пропуска вашей компании. Фильтр по офисам ограничен вашими помещениями.'
              : labels.pages.passesReportSubtitle}
          </p>
        </div>
      </div>

      <div className="card p-4 mb-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="label">Период с</label>
            <input
              className="input w-full"
              type="date"
              value={filters.dateFrom || ''}
              onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Период по</label>
            <input
              className="input w-full"
              type="date"
              value={filters.dateTo || ''}
              onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Статус</label>
            <div className="select-wrap">
              <select
                className="input w-full"
                value={filters.status || ''}
                onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
              >
                <option value="">{labels.passes.allStatuses}</option>
                {ALL_STATUSES.map((status) => (
                  <option key={status} value={status}>{getStatusLabel(status, labels)}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Тип пропуска</label>
            <div className="select-wrap">
              <select
                className="input w-full"
                value={filters.passType || ''}
                onChange={(e) => setFilters((prev) => ({ ...prev, passType: e.target.value as PassType | '' }))}
              >
                <option value="">Все типы</option>
                {(Object.keys(TYPE_LABELS) as PassType[]).map((type) => (
                  <option key={type} value={type}>{TYPE_LABELS[type]}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(options?.businessCenters.length ?? 0) > 0 && (
            <div>
              <label className="label">Бизнес-центр</label>
              <div className="select-wrap">
                <select
                  className="input w-full"
                  value={filters.propertyId || ''}
                  onChange={(e) => setFilters((prev) => ({
                    ...prev,
                    propertyId: e.target.value,
                    officeId: '',
                  }))}
                >
                  <option value="">Все БЦ</option>
                  {options?.businessCenters.map((bc) => (
                    <option key={bc.id} value={bc.id}>{bc.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {officesInBc.length > 0 && (
            <div>
              <label className="label">Офис</label>
              <div className="select-wrap">
                <select
                  className="input w-full"
                  value={filters.officeId || ''}
                  onChange={(e) => setFilters((prev) => ({ ...prev, officeId: e.target.value }))}
                >
                  <option value="">Все офисы</option>
                  {officesInBc.map((office) => (
                    <option key={office.id} value={office.id}>
                      {office.businessCenterName ? `${office.businessCenterName}: ` : ''}
                      оф. {office.number}
                      {office.company ? ` · ${office.company}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {showTenantFilter && (
            <div>
              <label className="label">Арендатор</label>
              <div className="select-wrap">
                <select
                  className="input w-full"
                  value={filters.tenantId || ''}
                  onChange={(e) => setFilters((prev) => ({ ...prev, tenantId: e.target.value }))}
                >
                  <option value="">Все арендаторы</option>
                  {options?.tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.company}{tenant.email ? ` · ${tenant.email}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
            <input
              className="input input--icon-left w-full"
              placeholder={labels.passes.searchPlaceholder}
              value={filters.search || ''}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary text-sm" onClick={applyFilters}>
              {labels.buttons.apply}
            </button>
            <button type="button" className="btn btn-secondary text-sm" onClick={resetFilters}>
              <X className="w-4 h-4" />
              {labels.buttons.reset}
            </button>
            <button type="button" className="btn btn-secondary text-sm" disabled={exporting || total === 0} onClick={handleExport}>
              <Download className="w-4 h-4" />
              {exporting ? 'Выгрузка...' : labels.buttons.export}
            </button>
          </div>
        </div>

        <p className="text-xs text-[var(--muted)]">
          Период: {applied.dateFrom && applied.dateTo
            ? `${formatVisitDate(applied.dateFrom)} — ${formatVisitDate(applied.dateTo)}`
            : 'не задан'}
          {hasActiveFilters ? ' · применены дополнительные фильтры' : ''}
          {total > 0 ? ` · найдено ${total}` : ''}
        </p>
      </div>

      {loadError && (
        <PageError
          className="mb-4"
          message={loadError}
          error={loadErrorCause}
          onRetry={() => fetchReport(applied, offset)}
          retryLabel={labels.buttons.retry}
        />
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]">
                <th className="text-left p-3 font-medium">Номер</th>
                <th className="text-left p-3 font-medium">Дата</th>
                <th className="text-left p-3 font-medium">Посетитель</th>
                <th className="text-left p-3 font-medium">Компания</th>
                <th className="text-left p-3 font-medium">БЦ / офис</th>
                <th className="text-left p-3 font-medium">Тип</th>
                <th className="text-left p-3 font-medium">Статус</th>
                {showCreator && <th className="text-left p-3 font-medium">Заказчик</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={showCreator ? 8 : 7} className="p-8 text-center text-[var(--muted)] animate-pulse">
                    {labels.passes.loading}
                  </td>
                </tr>
              ) : passes.length === 0 ? (
                <tr>
                  <td colSpan={showCreator ? 8 : 7} className="p-8 text-center text-[var(--muted)]">
                    {labels.passes.notFound}
                  </td>
                </tr>
              ) : (
                passes.map((pass) => (
                  <tr key={pass.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-muted)]">
                    <td className="p-3 font-mono text-xs whitespace-nowrap">{pass.passNumber}</td>
                    <td className="p-3 whitespace-nowrap">{formatVisitDate(pass.visitDate)}</td>
                    <td className="p-3">{pass.visitorName}</td>
                    <td className="p-3 text-[var(--muted)]">{pass.companyName || '—'}</td>
                    <td className="p-3">
                      <div>{pass.businessCenterName || '—'}</div>
                      <div className="text-xs text-[var(--muted)]">оф. {pass.office}{pass.floor ? `, ${pass.floor} эт.` : ''}</div>
                    </td>
                    <td className="p-3 whitespace-nowrap">{TYPE_LABELS[pass.passType]}</td>
                    <td className="p-3 whitespace-nowrap">{getStatusLabel(pass.status, labels)}</td>
                    {showCreator && (
                      <td className="p-3">
                        <div>{pass.creatorName || '—'}</div>
                        {pass.creatorCompany && (
                          <div className="text-xs text-[var(--muted)]">{pass.creatorCompany}</div>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 p-3 border-t border-[var(--border)] text-sm">
            <span className="text-[var(--muted)]">
              Страница {currentPage} из {pageCount}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-secondary text-xs"
                disabled={loading || offset === 0}
                onClick={() => fetchReport(applied, Math.max(0, offset - PAGE_SIZE))}
              >
                Назад
              </button>
              <button
                type="button"
                className="btn btn-secondary text-xs"
                disabled={loading || offset + PAGE_SIZE >= total}
                onClick={() => fetchReport(applied, offset + PAGE_SIZE)}
              >
                Вперёд
              </button>
            </div>
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}