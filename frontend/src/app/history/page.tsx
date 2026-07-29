'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, Filter, History, Search, X } from 'lucide-react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { PassListCard } from '@/components/PassListCard';
import { PageError } from '@/components/PageError';
import { useToast } from '@/components/Toast';
import {
  api,
  Pass,
  PassExportFilters,
  PassStatus,
  PassType,
  TYPE_LABELS,
  getErrorMessage,
} from '@/lib/api';
import { useConfig } from '@/hooks/useConfig';
import { getStatusLabel, getUiLabels } from '@/lib/ui-labels';
import { HistoryQuery, historyTitle } from '@/lib/visit-history';
import { getHomePath } from '@/lib/permissions';
import { useAuth } from '@/lib/auth';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { getLocalDateString } from '@/lib/local-date';

const PAGE_SIZE = 50;
const ALL_STATUSES: PassStatus[] = [
  'pending',
  'approved',
  'active',
  'completed',
  'rejected',
  'expired',
  'cancelled',
];

type HistoryFilters = {
  dateFrom: string;
  dateTo: string;
  status: string;
  passType: PassType | '';
  search: string;
  propertyId: string;
  officeId: string;
};

function emptyFilters(): HistoryFilters {
  return {
    dateFrom: '',
    dateTo: '',
    status: '',
    passType: '',
    search: '',
    propertyId: '',
    officeId: '',
  };
}

function parseHistoryQuery(params: URLSearchParams): HistoryQuery | null {
  const scope = params.get('scope') as HistoryQuery['scope'] | null;
  if (!scope || !['visitor', 'office', 'company', 'bc'].includes(scope)) return null;
  return {
    scope,
    visitorName: params.get('visitorName') || undefined,
    visitorPhone: params.get('visitorPhone') || undefined,
    visitorPassportSeries: params.get('visitorPassportSeries') || undefined,
    visitorPassportNumber: params.get('visitorPassportNumber') || undefined,
    officeId: params.get('officeId') || undefined,
    officeLabel: params.get('officeLabel') || undefined,
    companyName: params.get('companyName') || undefined,
    propertyId: params.get('propertyId') || undefined,
    bcName: params.get('bcName') || undefined,
  };
}

function HistoryPageContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const config = useConfig();
  const labels = getUiLabels(config);
  const { toast } = useToast();
  const query = useMemo(() => parseHistoryQuery(searchParams), [searchParams]);

  const [filters, setFilters] = useState<HistoryFilters>(emptyFilters);
  const [applied, setApplied] = useState<HistoryFilters>(emptyFilters);
  const [options, setOptions] = useState<PassExportFilters | null>(null);

  const [passes, setPasses] = useState<Pass[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadErrorCause, setLoadErrorCause] = useState<unknown>(null);
  const [filtersOpen, setFiltersOpen] = useState(true);

  useEffect(() => {
    api.getPassExportFilters()
      .then(setOptions)
      .catch(() => setOptions(null));
  }, []);

  const officesInBc = useMemo(() => {
    if (!options) return [];
    if (!filters.propertyId) return options.offices;
    return options.offices.filter((o) => o.propertyId === filters.propertyId);
  }, [options, filters.propertyId]);

  const canRefineBcOffice = query?.scope === 'company' || query?.scope === 'visitor';

  const buildRequest = useCallback(
    (f: HistoryFilters, nextOffset: number) => {
      if (!query) return null;
      return {
        scope: query.scope,
        visitorName: query.visitorName,
        visitorPhone: query.visitorPhone,
        visitorPassportSeries: query.visitorPassportSeries,
        visitorPassportNumber: query.visitorPassportNumber,
        // scope-закреплённые ключи + уточнение из фильтров
        officeId: query.scope === 'office' ? query.officeId : (f.officeId || query.officeId),
        companyName: query.companyName,
        propertyId: query.scope === 'bc' ? query.propertyId : (f.propertyId || query.propertyId),
        dateFrom: f.dateFrom || undefined,
        dateTo: f.dateTo || undefined,
        status: f.status || undefined,
        passType: f.passType || undefined,
        search: f.search.trim() || undefined,
        limit: PAGE_SIZE,
        offset: nextOffset,
      };
    },
    [query],
  );

  const load = useCallback((
    f: HistoryFilters,
    nextOffset: number,
    mode: 'replace' | 'append' = 'replace',
    options?: { silent?: boolean },
  ) => {
    const req = buildRequest(f, nextOffset);
    if (!req) return Promise.resolve();

    const silent = options?.silent;
    if (!silent) {
      if (mode === 'append') setLoadingMore(true);
      else {
        setLoading(true);
        setLoadError('');
        setLoadErrorCause(null);
      }
    }

    return api.getPassHistory(req)
      .then((data) => {
        setTotal(typeof data.total === 'number' ? data.total : data.passes.length);
        setOffset(data.offset ?? nextOffset);
        setHasMore(!!data.hasMore);
        setApplied(f);
        setPasses((prev) => (mode === 'append' ? [...prev, ...data.passes] : data.passes));
      })
      .catch((err) => {
        if (!silent) {
          setLoadErrorCause(err);
          setLoadError(getErrorMessage(err, 'Ошибка загрузки'));
          if (mode === 'replace') {
            setPasses([]);
            setTotal(0);
          }
        }
      })
      .finally(() => {
        if (!silent) {
          setLoading(false);
          setLoadingMore(false);
        }
      });
  }, [buildRequest]);

  useEffect(() => {
    if (!query) return;
    setFilters(emptyFilters());
    setApplied(emptyFilters());
    void load(emptyFilters(), 0, 'replace');
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps -- reload when URL scope changes

  useAutoRefresh(
    () => load(applied, 0, 'replace', { silent: true }),
    { enabled: !!query && !exporting && !loadingMore },
  );

  const applyFilters = () => {
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      toast('Дата «с» не может быть позже даты «по»', 'error');
      return;
    }
    void load(filters, 0, 'replace');
  };

  const resetFilters = () => {
    const empty = emptyFilters();
    setFilters(empty);
    void load(empty, 0, 'replace');
  };

  const loadMore = () => {
    void load(applied, offset + PAGE_SIZE, 'append');
  };

  const handleExport = async () => {
    if (!query) return;
    setExporting(true);
    try {
      const exportFilters = {
        dateFrom: applied.dateFrom || undefined,
        dateTo: applied.dateTo || undefined,
        status: applied.status || undefined,
        passType: applied.passType || undefined,
        search: applied.search.trim() || undefined,
        propertyId:
          query.scope === 'bc'
            ? query.propertyId
            : (applied.propertyId || query.propertyId || undefined),
        officeId:
          query.scope === 'office'
            ? query.officeId
            : (applied.officeId || query.officeId || undefined),
        companyName: query.scope === 'company' ? query.companyName : undefined,
        // visitor scope: export via search if only name known (best-effort)
        ...(query.scope === 'visitor' && !applied.search && query.visitorName
          ? { search: query.visitorName }
          : {}),
      };
      await api.exportPasses(exportFilters);
      toast('Выгрузка сохранена', 'success');
    } catch (err) {
      toast(getErrorMessage(err, 'Ошибка выгрузки'), 'error');
    } finally {
      setExporting(false);
    }
  };

  const activeFilterCount = [
    applied.dateFrom,
    applied.dateTo,
    applied.status,
    applied.passType,
    applied.search,
    canRefineBcOffice ? applied.propertyId : '',
    canRefineBcOffice ? applied.officeId : '',
  ].filter(Boolean).length;

  if (!query) {
    return (
      <ProtectedLayout anyPermissions={['passes.view_all', 'passes.reception', 'admin.panel']}>
        <div className="card p-8 text-center text-[var(--muted)]">
          Укажите параметры истории: посетитель, офис, компания или бизнес-центр
        </div>
      </ProtectedLayout>
    );
  }

  const title = historyTitle(query);
  const subtitle = query.scope === 'visitor'
    ? 'Все визиты по совпадению ФИО, телефона или паспорта'
    : query.scope === 'office'
      ? 'Все пропуска в этот офис'
      : query.scope === 'company'
        ? 'Все пропуска для компании — фильтры и выгрузка CSV'
        : 'Все пропуска в бизнес-центре';

  return (
    <ProtectedLayout anyPermissions={['passes.view_all', 'passes.reception', 'admin.panel']}>
      <div className="mb-4">
        <Link href={getHomePath(user)} className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--accent)] mb-3">
          <ArrowLeft className="w-4 h-4" />
          Назад
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <History className="w-6 h-6 text-[var(--muted)] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h1 className="page-title">История проходов</h1>
              <p className="text-sm text-[var(--muted)] mt-1">{subtitle}</p>
              <p className="text-sm font-medium mt-1 break-words">{title}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              className="btn btn-secondary text-sm"
              onClick={() => setFiltersOpen((v) => !v)}
            >
              <Filter className="w-4 h-4" />
              Фильтры
              {activeFilterCount > 0 ? (
                <span className="ml-1 text-xs tabular-nums opacity-80">({activeFilterCount})</span>
              ) : null}
            </button>
            <button
              type="button"
              className="btn btn-primary text-sm"
              disabled={exporting || loading}
              onClick={() => void handleExport()}
            >
              <Download className="w-4 h-4" />
              {exporting ? 'Выгрузка…' : 'Скачать CSV'}
            </button>
          </div>
        </div>
      </div>

      {filtersOpen && (
        <div className="card p-4 mb-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-sm">Фильтры</h2>
            <button type="button" className="text-xs text-[var(--muted)] hover:text-[var(--accent)] inline-flex items-center gap-1" onClick={resetFilters}>
              <X className="w-3.5 h-3.5" />
              Сбросить
            </button>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="label">Дата с</label>
              <input
                type="date"
                className="input w-full"
                value={filters.dateFrom}
                onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Дата по</label>
              <input
                type="date"
                className="input w-full"
                value={filters.dateTo}
                onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Статус</label>
              <div className="select-wrap w-full">
                <select
                  className="input w-full"
                  value={filters.status}
                  onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                >
                  <option value="">Все статусы</option>
                  {ALL_STATUSES.map((s) => (
                    <option key={s} value={s}>{getStatusLabel(s, labels)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Тип пропуска</label>
              <div className="select-wrap w-full">
                <select
                  className="input w-full"
                  value={filters.passType}
                  onChange={(e) => setFilters((prev) => ({ ...prev, passType: e.target.value as PassType | '' }))}
                >
                  <option value="">Все типы</option>
                  {(Object.entries(TYPE_LABELS) as [PassType, string][]).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="label">Поиск</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
                <input
                  className="input input--icon-left w-full"
                  placeholder="ФИО, телефон, номер пропуска…"
                  value={filters.search}
                  onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyFilters();
                  }}
                />
              </div>
            </div>
          </div>

          {canRefineBcOffice && options && (options.businessCenters.length > 0 || options.offices.length > 0) && (
            <div className="grid sm:grid-cols-2 gap-3 pt-1 border-t border-[var(--border)]">
              {(options.businessCenters.length ?? 0) > 0 && (
                <div>
                  <label className="label">Бизнес-центр</label>
                  <div className="select-wrap w-full">
                    <select
                      className="input w-full"
                      value={filters.propertyId}
                      onChange={(e) => setFilters((prev) => ({
                        ...prev,
                        propertyId: e.target.value,
                        officeId: '',
                      }))}
                    >
                      <option value="">Все БЦ</option>
                      {options.businessCenters.map((bc) => (
                        <option key={bc.id} value={bc.id}>{bc.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              {options.offices.length > 0 && (
                <div>
                  <label className="label">Офис</label>
                  <div className="select-wrap w-full">
                    <select
                      className="input w-full"
                      value={filters.officeId}
                      onChange={(e) => setFilters((prev) => ({ ...prev, officeId: e.target.value }))}
                    >
                      <option value="">Все офисы</option>
                      {officesInBc.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.businessCenterName ? `${o.businessCenterName}: ` : ''}оф. {o.number}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary text-sm" onClick={applyFilters} disabled={loading}>
              Применить
            </button>
            <button type="button" className="btn btn-secondary text-sm" onClick={resetFilters} disabled={loading}>
              Сбросить
            </button>
            <button
              type="button"
              className="btn btn-secondary text-sm"
              onClick={() => {
                const today = getLocalDateString();
                setFilters((prev) => ({
                  ...prev,
                  dateFrom: `${today.slice(0, 8)}01`,
                  dateTo: today,
                }));
              }}
            >
              Текущий месяц
            </button>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Выгрузка CSV использует <strong>применённые</strong> фильтры
            {query.scope === 'company' ? ' и фиксированную компанию из ссылки' : ''}.
          </p>
        </div>
      )}

      {loadError && (
        <PageError
          className="mb-4"
          message={loadError}
          error={loadErrorCause}
          onRetry={() => load(applied, 0, 'replace')}
          retryLabel={labels.buttons.retry}
        />
      )}

      {loading ? (
        <div className="card p-8 text-center text-[var(--muted)]">{labels.passes.loading}</div>
      ) : passes.length === 0 ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          Визиты не найдены
          {activeFilterCount > 0 ? ' по выбранным фильтрам' : ''}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-[var(--muted)] mb-1 px-1">
            Найдено: {total}
            {passes.length < total ? ` (показано ${passes.length})` : ''}
          </p>
          {passes.map((pass) => (
            <PassListCard
              key={pass.id}
              pass={pass}
              labels={labels}
              showCreator
              href={`/passes?id=${pass.id}`}
            />
          ))}
          {hasMore && (
            <button
              type="button"
              className="btn btn-secondary mt-2 self-center"
              disabled={loadingMore}
              onClick={loadMore}
            >
              {loadingMore ? 'Загрузка…' : labels.buttons.loadMore || 'Ещё'}
            </button>
          )}
        </div>
      )}
    </ProtectedLayout>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<ProtectedLayout anyPermissions={['passes.view_all', 'passes.reception', 'admin.panel']}><div className="animate-pulse text-[var(--muted)] p-8">Загрузка...</div></ProtectedLayout>}>
      <HistoryPageContent />
    </Suspense>
  );
}
