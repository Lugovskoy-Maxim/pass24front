'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { PassDetailModal } from '@/components/PassDetailModal';
import { useToast } from '@/components/Toast';
import {
  api,
  PassExportFilters,
  PassExportFiltersInput,
  PassStatus,
  PassType,
  TYPE_LABELS,
  getErrorMessage,
} from '@/lib/api';
import { getStatusLabel, getUiLabels } from '@/lib/ui-labels';
import { useConfig } from '@/hooks/useConfig';

const ALL_STATUSES: PassStatus[] = ['pending', 'approved', 'active', 'completed', 'rejected', 'expired', 'cancelled'];

const EMPTY_FILTERS: PassExportFiltersInput = {
  status: '',
  date: '',
  dateFrom: '',
  dateTo: '',
  search: '',
  passType: '',
  propertyId: '',
  officeId: '',
  tenantId: '',
};

interface PassExportPanelProps {
  open: boolean;
  onClose: () => void;
  initialFilters?: Partial<PassExportFiltersInput>;
}

export function PassExportPanel({ open, onClose, initialFilters }: PassExportPanelProps) {
  const { toast } = useToast();
  const config = useConfig();
  const labels = getUiLabels(config);
  const [filters, setFilters] = useState<PassExportFiltersInput>(EMPTY_FILTERS);
  const [options, setOptions] = useState<PassExportFilters | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFilters({ ...EMPTY_FILTERS, ...initialFilters });
    setLoadingOptions(true);
    api.getPassExportFilters()
      .then(setOptions)
      .catch(() => setOptions(null))
      .finally(() => setLoadingOptions(false));
  }, [open]);

  const officesInBc = useMemo(() => {
    if (!options) return [];
    if (!filters.propertyId) return options.offices;
    return options.offices.filter((o) => o.propertyId === filters.propertyId);
  }, [options, filters.propertyId]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await api.exportPasses(filters);
      toast('Выгрузка сохранена', 'success');
      onClose();
    } catch (err) {
      toast(getErrorMessage(err, 'Ошибка выгрузки'), 'error');
    } finally {
      setExporting(false);
    }
  };

  const showTenantFilter = (options?.tenants.length ?? 0) > 0;

  return (
    <PassDetailModal
      open={open}
      title="Выгрузка пропусков"
      closeLabel={labels.passes.close}
      onClose={onClose}
    >
      <p className="text-sm text-[var(--muted)] mb-4">
        {options?.scope === 'own'
          ? 'Будут выгружены только пропуска вашей компании. Фильтры по БЦ и офисам ограничены вашими помещениями.'
          : 'Выгрузка с учётом выбранных фильтров. Доступны все пропуска, которые вы можете просматривать.'}
      </p>

      {loadingOptions ? (
        <p className="text-sm text-[var(--muted)] animate-pulse">Загрузка фильтров...</p>
      ) : (
        <div className="space-y-4">
          <FilterField label="Поиск">
            <input
              className="input w-full"
              placeholder={labels.passes.searchPlaceholder}
              value={filters.search || ''}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            />
          </FilterField>

          <div className="form-grid-2">
            <FilterField label="Дата визита">
              <input
                className="input w-full"
                type="date"
                value={filters.date || ''}
                onChange={(e) => setFilters((prev) => ({ ...prev, date: e.target.value, dateFrom: '', dateTo: '' }))}
              />
            </FilterField>
            <FilterField label="Статус">
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
            </FilterField>
          </div>

          <div className="form-grid-2">
            <FilterField label="Период с">
              <input
                className="input w-full"
                type="date"
                value={filters.dateFrom || ''}
                onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value, date: '' }))}
              />
            </FilterField>
            <FilterField label="Период по">
              <input
                className="input w-full"
                type="date"
                value={filters.dateTo || ''}
                onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value, date: '' }))}
              />
            </FilterField>
          </div>

          <FilterField label="Тип пропуска">
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
          </FilterField>

          {(options?.businessCenters.length ?? 0) > 0 && (
            <FilterField label="Бизнес-центр">
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
            </FilterField>
          )}

          {officesInBc.length > 0 && (
            <FilterField label="Офис">
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
            </FilterField>
          )}

          {showTenantFilter && (
            <FilterField label="Арендатор">
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
            </FilterField>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={exporting}
              onClick={handleExport}
            >
              <Download className="w-4 h-4" />
              {exporting ? 'Выгрузка...' : labels.buttons.export}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={exporting}
              onClick={() => setFilters({ ...EMPTY_FILTERS, ...initialFilters })}
            >
              {labels.buttons.reset}
            </button>
          </div>
        </div>
      )}
    </PassDetailModal>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-[var(--muted)] mb-1 block">{label}</span>
      {children}
    </label>
  );
}