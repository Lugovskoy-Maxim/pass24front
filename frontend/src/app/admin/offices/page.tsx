'use client';

import { useEffect, useMemo, useState, FormEvent } from 'react';
import { Plus, Pencil, Check, X, Link2, Search, Building2, Filter, Users, Trash2 } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { useToast } from '@/components/Toast';
import { useDebounce } from '@/hooks/useDebounce';
import { api, Office, AdminUser, BusinessCenter, BcPassSettings, DEFAULT_BC_PASS_SETTINGS, getErrorMessage } from '@/lib/api';
import { PageError } from '@/components/PageError';

type OfficeFilters = {
  search: string;
  propertyId: string;
  floor: string;
  status: '' | 'active' | 'inactive';
  binding: '' | 'assigned' | 'free';
};
const EMPTY_OFFICE_FILTERS: OfficeFilters = {
  search: '',
  propertyId: '',
  floor: '',
  status: '',
  binding: '',
};

export default function AdminOfficesPage() {
  const { toast } = useToast();
  const [offices, setOffices] = useState<Office[]>([]);
  const [tenants, setTenants] = useState<AdminUser[]>([]);
  const [businessCenters, setBusinessCenters] = useState<BusinessCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadErrorCause, setLoadErrorCause] = useState<unknown>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [bindingOfficeId, setBindingOfficeId] = useState<string | null>(null);
  const [editingBcId, setEditingBcId] = useState<string | null>(null);
  const [deletingBcId, setDeletingBcId] = useState<string | null>(null);
  const [deletingOfficeId, setDeletingOfficeId] = useState<string | null>(null);
  const [showBcForm, setShowBcForm] = useState(false);
  const [bcName, setBcName] = useState('');
  const [bcAddress, setBcAddress] = useState('');
  const [bcPassSettings, setBcPassSettings] = useState<BcPassSettings>(DEFAULT_BC_PASS_SETTINGS);

  const [propertyId, setPropertyId] = useState('');
  const [number, setNumber] = useState('');
  const [floor, setFloor] = useState('');
  const [areaSqm, setAreaSqm] = useState('');
  const [company, setCompany] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [officeFilters, setOfficeFilters] = useState<OfficeFilters>(EMPTY_OFFICE_FILTERS);
  const [appliedOfficeFilters, setAppliedOfficeFilters] = useState<OfficeFilters>(EMPTY_OFFICE_FILTERS);
  const debouncedOfficeSearch = useDebounce(officeFilters.search);

  const load = () => {
    setLoading(true);
    setLoadError('');
    setLoadErrorCause(null);
    Promise.all([
      api.admin.getOffices(),
      api.admin.getUsers({ role: 'tenant' }),
      api.admin.getBusinessCenters(),
    ])
      .then(([{ offices: o }, { users: t }, { businessCenters: bc }]) => {
        setOffices(o);
        setTenants(t.filter((u) => u.isActive));
        setBusinessCenters(bc);
        if (!propertyId && bc[0]) setPropertyId(bc[0].id);
      })
      .catch((err) => {
        setLoadErrorCause(err);
        setLoadError(getErrorMessage(err, 'Ошибка загрузки'));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setNumber('');
    setFloor('');
    setAreaSqm('');
    setCompany('');
    setTenantId('');
    setShowForm(false);
    setEditingId(null);
    setBindingOfficeId(null);
    if (businessCenters[0]) setPropertyId(businessCenters[0].id);
  };

  const resetBcForm = () => {
    setShowBcForm(false);
    setEditingBcId(null);
    setBcName('');
    setBcAddress('');
    setBcPassSettings(DEFAULT_BC_PASS_SETTINGS);
  };

  const startBcCreate = () => {
    resetBcForm();
    setShowBcForm(true);
    setShowForm(false);
    setEditingId(null);
    setBindingOfficeId(null);
  };

  const startBcEdit = (bc: BusinessCenter) => {
    setEditingBcId(bc.id);
    setBcName(bc.name);
    setBcAddress(bc.address || '');
    setBcPassSettings({ ...DEFAULT_BC_PASS_SETTINGS, ...bc.passSettings });
    setShowBcForm(false);
    setShowForm(false);
    setEditingId(null);
    setBindingOfficeId(null);
  };

  const handleCreateBc = async (e: FormEvent) => {
    e.preventDefault();
    if (!bcName.trim() || !bcAddress.trim()) return;
    setSaving(true);
    try {
      const { businessCenter } = await api.admin.createBusinessCenter({
        name: bcName.trim(),
        address: bcAddress.trim(),
      });
      setBusinessCenters((prev) => [...prev, businessCenter].sort((a, b) => a.name.localeCompare(b.name, 'ru')));
      setPropertyId(businessCenter.id);
      resetBcForm();
      toast('Бизнес-центр создан', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBc = async (bc: BusinessCenter) => {
    if (bc.officesCount > 0) {
      toast(`Нельзя удалить БЦ «${bc.name}»: в нём ${bc.officesCount} офис(ов). Сначала удалите офисы.`, 'error');
      return;
    }
    if (!window.confirm(`Удалить бизнес-центр «${bc.name}»? Это действие нельзя отменить.`)) {
      return;
    }

    setDeletingBcId(bc.id);
    try {
      await api.admin.deleteBusinessCenter(bc.id);
      setBusinessCenters((prev) => {
        const next = prev.filter((item) => item.id !== bc.id);
        if (propertyId === bc.id) {
          setPropertyId(next[0]?.id || '');
        }
        return next;
      });
      if (editingBcId === bc.id) resetBcForm();
      toast('Бизнес-центр удалён', 'success');
    } catch (err) {
      toast(getErrorMessage(err, 'Ошибка удаления'), 'error');
    } finally {
      setDeletingBcId(null);
    }
  };

  const saveBcEdit = async () => {
    if (!editingBcId || !bcName.trim()) return;
    setSaving(true);
    try {
      const { businessCenter } = await api.admin.updateBusinessCenter(editingBcId, {
        name: bcName.trim(),
        address: bcAddress.trim() || undefined,
        passSettings: bcPassSettings,
      });
      setBusinessCenters((prev) => prev.map((bc) => (bc.id === editingBcId ? businessCenter : bc)));
      setOffices((prev) => prev.map((o) => (
        o.propertyId === editingBcId ? { ...o, businessCenterName: businessCenter.name } : o
      )));
      resetBcForm();
      toast('Бизнес-центр обновлён', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (office: Office) => {
    setEditingId(office.id);
    setBindingOfficeId(null);
    setPropertyId(office.propertyId);
    setNumber(office.number);
    setFloor(office.floor);
    setAreaSqm(office.areaSqm?.toString() || '');
    setCompany(office.company || '');
    setTenantId(office.tenantId || '');
    setShowForm(false);
  };

  const startBinding = (office: Office) => {
    setBindingOfficeId(office.id);
    setEditingId(null);
    setShowForm(false);
    setTenantId(office.tenantId || '');
    setCompany(office.company || '');
  };

  const handleTenantSelect = (id: string, forOffice?: Office) => {
    setTenantId(id);
    const tenant = tenants.find((t) => t.id === id);
    if (tenant?.company && !company) setCompany(tenant.company);
    if (forOffice && tenant?.company) setCompany(tenant.company);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!propertyId) {
      toast('Сначала создайте бизнес-центр', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.admin.createOffice({
        propertyId,
        number: number.trim(),
        floor: floor.trim(),
        areaSqm: areaSqm ? parseFloat(areaSqm) : undefined,
        company: company.trim() || undefined,
        tenantId: tenantId || undefined,
      });
      toast('Офис добавлен', 'success');
      resetForm();
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveBinding = async (officeId: string) => {
    setSaving(true);
    try {
      await api.admin.updateOffice(officeId, {
        tenantId: tenantId || '',
        company: company.trim() || undefined,
      });
      toast('Привязка сохранена', 'success');
      resetForm();
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string) => {
    setSaving(true);
    try {
      await api.admin.updateOffice(id, {
        company: company.trim() || undefined,
        tenantId: tenantId || '',
        areaSqm: areaSqm ? parseFloat(areaSqm) : undefined,
      });
      toast('Офис обновлён', 'success');
      resetForm();
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOffice = async (office: Office) => {
    const label = `офис ${office.number}${office.businessCenterName ? ` (${office.businessCenterName})` : ''}`;
    if (!window.confirm(`Удалить ${label}? Это действие нельзя отменить.`)) {
      return;
    }

    setDeletingOfficeId(office.id);
    try {
      await api.admin.deleteOffice(office.id);
      if (editingId === office.id || bindingOfficeId === office.id) {
        resetForm();
      }
      toast('Офис удалён', 'success');
      load();
    } catch (err) {
      toast(getErrorMessage(err, 'Ошибка удаления'), 'error');
    } finally {
      setDeletingOfficeId(null);
    }
  };

  const toggleActive = async (office: Office) => {
    try {
      await api.admin.updateOffice(office.id, { isActive: !office.isActive });
      toast(office.isActive ? 'Офис деактивирован' : 'Офис активирован', 'success');
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    }
  };

  const activeOfficeFilters = useMemo(() => ({
    ...appliedOfficeFilters,
    search: debouncedOfficeSearch,
  }), [appliedOfficeFilters, debouncedOfficeSearch]);

  const filteredOffices = useMemo(() => {
    const q = activeOfficeFilters.search.trim().toLowerCase();
    return offices.filter((office) => {
      if (activeOfficeFilters.propertyId && office.propertyId !== activeOfficeFilters.propertyId) return false;
      if (activeOfficeFilters.floor && office.floor !== activeOfficeFilters.floor) return false;
      if (activeOfficeFilters.status === 'active' && !office.isActive) return false;
      if (activeOfficeFilters.status === 'inactive' && office.isActive) return false;
      if (activeOfficeFilters.binding === 'assigned' && !office.tenantId) return false;
      if (activeOfficeFilters.binding === 'free' && office.tenantId) return false;
      if (!q) return true;
      const haystack = [
        office.number,
        office.floor,
        office.company,
        office.tenantName,
        office.businessCenterName,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [offices, activeOfficeFilters]);

  const officeStats = useMemo(() => ({
    total: offices.length,
    active: offices.filter((o) => o.isActive).length,
    assigned: offices.filter((o) => o.tenantId).length,
    shown: filteredOffices.length,
  }), [offices, filteredOffices]);

  const floors = useMemo(() => (
    [...new Set(offices.map((o) => o.floor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }))
  ), [offices]);

  const officesByBc = useMemo(() => {
    const map = new Map<string, { bc: BusinessCenter | null; items: Office[] }>();
    for (const office of filteredOffices) {
      const key = office.propertyId || 'unknown';
      if (!map.has(key)) {
        map.set(key, {
          bc: businessCenters.find((b) => b.id === office.propertyId) || null,
          items: [],
        });
      }
      map.get(key)!.items.push(office);
    }
    return [...map.values()].sort((a, b) => (a.bc?.name || '').localeCompare(b.bc?.name || '', 'ru'));
  }, [filteredOffices, businessCenters]);

  const hasOfficeFilters = !!(
    activeOfficeFilters.propertyId ||
    activeOfficeFilters.floor ||
    activeOfficeFilters.status ||
    activeOfficeFilters.binding ||
    activeOfficeFilters.search.trim()
  );

  const applyOfficeFilters = () => setAppliedOfficeFilters({ ...officeFilters });
  const resetOfficeFilters = () => {
    setOfficeFilters(EMPTY_OFFICE_FILTERS);
    setAppliedOfficeFilters(EMPTY_OFFICE_FILTERS);
  };

  const tenantLabel = (t: AdminUser) => {
    const offices = t.offices?.length ? ` · ${t.offices.length} оф.` : '';
    return `${t.fullName}${t.company ? ` (${t.company})` : ''}${offices}`;
  };

  const BindingSelect = ({ office }: { office?: Office }) => (
    <div className="space-y-2">
      <select
        className="input text-sm"
        value={tenantId}
        onChange={(e) => handleTenantSelect(e.target.value, office)}
      >
        <option value="">Не назначен</option>
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>{tenantLabel(t)}</option>
        ))}
      </select>
      {tenantId && (
        <input
          className="input text-sm"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Компания в офисе"
        />
      )}
    </div>
  );

  return (
    <AdminLayout title="Реестр офисов">
      <p className="text-[var(--muted)] -mt-4 mb-6">
        Бизнес-центры, офисы и параметры пропускного режима для каждого БЦ. Привязка арендатора к офису — только администратором.
      </p>

      {loadError && (
        <PageError
          className="mb-6"
          message={loadError}
          error={loadErrorCause}
          onRetry={load}
          retryLabel="Повторить"
        />
      )}

      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-semibold">Бизнес-центры</h2>
          {!showBcForm && !editingBcId && (
            <button type="button" className="btn btn-primary text-sm" onClick={startBcCreate}>
              <Plus className="w-4 h-4" />
              Добавить БЦ
            </button>
          )}
        </div>

        {businessCenters.length === 0 && !showBcForm && (
          <p className="text-sm text-[var(--muted)] mb-4">
            Бизнес-центров пока нет. Создайте первый БЦ, затем добавьте офисы.
          </p>
        )}

        {showBcForm && (
          <form onSubmit={handleCreateBc} className="border border-[var(--border)] rounded-lg p-4 mb-4 space-y-3 max-w-lg">
            <h3 className="font-medium text-sm">Новый бизнес-центр</h3>
            <div>
              <label className="label">Название БЦ *</label>
              <input className="input" value={bcName} onChange={(e) => setBcName(e.target.value)} required placeholder="БЦ Атриум" />
            </div>
            <div>
              <label className="label">Адрес *</label>
              <input className="input" value={bcAddress} onChange={(e) => setBcAddress(e.target.value)} required placeholder="ул. Тверская, 12" />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary text-sm" disabled={saving}>
                {saving ? 'Создание...' : 'Создать БЦ'}
              </button>
              <button type="button" className="btn btn-secondary text-sm" onClick={resetBcForm}>Отмена</button>
            </div>
          </form>
        )}

        {businessCenters.length > 0 && (
          <div className="space-y-3">
            {businessCenters.map((bc) => (
              <div key={bc.id} className="border border-[var(--border)] rounded-lg p-4">
                {editingBcId === bc.id ? (
                  <div className="space-y-4">
                    <div>
                      <label className="label">Название БЦ *</label>
                      <input className="input" value={bcName} onChange={(e) => setBcName(e.target.value)} required />
                    </div>
                    <div>
                      <label className="label">Адрес</label>
                      <input className="input" value={bcAddress} onChange={(e) => setBcAddress(e.target.value)} />
                    </div>

                    <div className="border-t border-[var(--border)] pt-4 space-y-3">
                      <h4 className="text-sm font-medium">Параметры пропускного режима</h4>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="label">Этаж ресепшн</label>
                          <input
                            className="input"
                            value={bcPassSettings.reception_floor}
                            onChange={(e) => setBcPassSettings({ ...bcPassSettings, reception_floor: e.target.value })}
                            placeholder="1"
                          />
                        </div>
                        <div>
                          <label className="label">Лимит пропусков на арендатора в день</label>
                          <input
                            className="input"
                            type="number"
                            min={1}
                            max={100}
                            value={bcPassSettings.max_passes_per_day}
                            onChange={(e) => setBcPassSettings({ ...bcPassSettings, max_passes_per_day: e.target.value })}
                          />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={bcPassSettings.auto_approve_delivery === 'true'}
                          onChange={(e) => setBcPassSettings({
                            ...bcPassSettings,
                            auto_approve_delivery: e.target.checked ? 'true' : 'false',
                          })}
                        />
                        Автоодобрение пропусков на доставку
                      </label>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="label">Рабочие часы с</label>
                          <input
                            className="input"
                            type="time"
                            value={bcPassSettings.working_hours_from}
                            onChange={(e) => setBcPassSettings({ ...bcPassSettings, working_hours_from: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="label">Рабочие часы до</label>
                          <input
                            className="input"
                            type="time"
                            value={bcPassSettings.working_hours_to}
                            onChange={(e) => setBcPassSettings({ ...bcPassSettings, working_hours_to: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="label">Телефон ресепшн</label>
                          <input
                            className="input"
                            value={bcPassSettings.contact_phone}
                            onChange={(e) => setBcPassSettings({ ...bcPassSettings, contact_phone: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="label">Email управляющей компании</label>
                          <input
                            className="input"
                            type="email"
                            value={bcPassSettings.contact_email}
                            onChange={(e) => setBcPassSettings({ ...bcPassSettings, contact_email: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button type="button" className="btn btn-primary text-sm" disabled={saving} onClick={saveBcEdit}>
                        {saving ? 'Сохранение...' : 'Сохранить'}
                      </button>
                      <button type="button" className="btn btn-secondary text-sm" onClick={resetBcForm}>Отмена</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{bc.name}</div>
                      <div className="text-sm text-[var(--muted)]">{bc.address}</div>
                      <div className="text-xs text-[var(--muted)] mt-1">
                        {bc.officesCount} офисов
                        {bc.passSettings && (
                          <> · ресепшн {bc.passSettings.reception_floor} эт. · {bc.passSettings.working_hours_from}–{bc.passSettings.working_hours_to}</>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button type="button" className="btn btn-secondary text-sm" onClick={() => startBcEdit(bc)}>
                        <Pencil className="w-4 h-4" />
                        Изменить
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger text-sm"
                        disabled={deletingBcId === bc.id || bc.officesCount > 0}
                        title={bc.officesCount > 0 ? `Сначала удалите ${bc.officesCount} офис(ов)` : 'Удалить БЦ'}
                        onClick={() => handleDeleteBc(bc)}
                      >
                        <Trash2 className="w-4 h-4" />
                        {deletingBcId === bc.id ? '...' : 'Удалить'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-5 mb-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[var(--primary)]" />
              Реестр офисов
            </h2>
            <p className="text-sm text-[var(--muted)] mt-1">
              {officeStats.shown} из {officeStats.total} · активных {officeStats.active} · с арендатором {officeStats.assigned}
            </p>
          </div>
          {!showForm && !editingId && businessCenters.length > 0 && (
            <button className="btn btn-primary text-sm" onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4" />
              Добавить офис
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="card px-3 py-2">
            <div className="text-xs text-[var(--muted)]">Всего</div>
            <div className="text-lg font-semibold">{officeStats.total}</div>
          </div>
          <div className="card px-3 py-2 office-stat--active">
            <div className="text-xs text-[var(--muted)]">Активные</div>
            <div className="text-lg font-semibold office-stat__value">{officeStats.active}</div>
          </div>
          <div className="card px-3 py-2 office-stat--assigned">
            <div className="text-xs text-[var(--muted)]">С арендатором</div>
            <div className="text-lg font-semibold office-stat__value">{officeStats.assigned}</div>
          </div>
          <div className="card px-3 py-2 office-stat--free">
            <div className="text-xs text-[var(--muted)]">Свободные</div>
            <div className="text-lg font-semibold office-stat__value">{officeStats.total - officeStats.assigned}</div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] gap-2 items-end">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
            <input
              className="input input--icon-left"
              placeholder="Офис, компания, арендатор, БЦ..."
              value={officeFilters.search}
              onChange={(e) => {
                const next = { ...officeFilters, search: e.target.value };
                setOfficeFilters(next);
                setAppliedOfficeFilters((prev) => ({ ...prev, search: e.target.value }));
              }}
            />
          </div>
          <select
            className="input"
            value={officeFilters.propertyId}
            onChange={(e) => setOfficeFilters({ ...officeFilters, propertyId: e.target.value })}
          >
            <option value="">Все БЦ</option>
            {businessCenters.map((bc) => (
              <option key={bc.id} value={bc.id}>{bc.name}</option>
            ))}
          </select>
          <select
            className="input"
            value={officeFilters.floor}
            onChange={(e) => setOfficeFilters({ ...officeFilters, floor: e.target.value })}
          >
            <option value="">Все этажи</option>
            {floors.map((floor) => (
              <option key={floor} value={floor}>{floor} эт.</option>
            ))}
          </select>
          <select
            className="input"
            value={officeFilters.binding}
            onChange={(e) => setOfficeFilters({ ...officeFilters, binding: e.target.value as OfficeFilters['binding'] })}
          >
            <option value="">Все офисы</option>
            <option value="assigned">С арендатором</option>
            <option value="free">Свободные</option>
          </select>
          <select
            className="input"
            value={officeFilters.status}
            onChange={(e) => setOfficeFilters({ ...officeFilters, status: e.target.value as OfficeFilters['status'] })}
          >
            <option value="">Любой статус</option>
            <option value="active">Активные</option>
            <option value="inactive">Неактивные</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary text-sm" onClick={applyOfficeFilters}>
            <Filter className="w-4 h-4" />
            Применить
          </button>
          {hasOfficeFilters && (
            <button type="button" className="btn btn-secondary text-sm" onClick={resetOfficeFilters}>
              <X className="w-4 h-4" />
              Сбросить
            </button>
          )}
        </div>
      </div>

      {(showForm || editingId) && (
        <form onSubmit={editingId ? (e) => { e.preventDefault(); handleUpdate(editingId); } : handleCreate} className="card p-5 mb-6 space-y-4 max-w-lg">
          <h3 className="font-semibold">{editingId ? 'Редактирование офиса' : 'Новый офис'}</h3>
          <div>
            <label className="label">Бизнес-центр *</label>
            <select className="input" value={propertyId} onChange={(e) => setPropertyId(e.target.value)} required disabled={!!editingId}>
              <option value="">Выберите БЦ</option>
              {businessCenters.map((bc) => (
                <option key={bc.id} value={bc.id}>{bc.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Номер офиса *</label>
              <input className="input" value={number} onChange={(e) => setNumber(e.target.value)} required disabled={!!editingId} />
            </div>
            <div>
              <label className="label">Этаж *</label>
              <input className="input" value={floor} onChange={(e) => setFloor(e.target.value)} required disabled={!!editingId} />
            </div>
          </div>
          <div>
            <label className="label">Площадь, м²</label>
            <input className="input" type="number" min={0} value={areaSqm} onChange={(e) => setAreaSqm(e.target.value)} />
          </div>

          <div className="border border-[var(--border)] rounded-lg p-4 bg-[var(--surface-muted)]">
            <div className="flex items-center gap-2 mb-3">
              <Link2 className="w-4 h-4 text-[var(--primary)]" />
              <span className="font-medium text-sm">Привязка арендатора</span>
            </div>
            <BindingSelect />
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Сохранение...' : editingId ? 'Сохранить' : 'Добавить'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={resetForm}>Отмена</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="animate-pulse text-[var(--muted)]">Загрузка...</div>
      ) : offices.length === 0 ? (
        <div className="card p-8 text-center text-[var(--muted)]">Офисов пока нет</div>
      ) : filteredOffices.length === 0 ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          По выбранным фильтрам офисов не найдено
          {hasOfficeFilters && (
            <div className="mt-3">
              <button type="button" className="btn btn-secondary text-sm" onClick={resetOfficeFilters}>Сбросить фильтры</button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {officesByBc.map(({ bc, items }) => (
            <section key={bc?.id || items[0]?.propertyId} className="card p-5">
              <div className="flex items-start justify-between gap-3 mb-4 pb-3 border-b border-[var(--border)]">
                <div>
                  <h3 className="font-semibold">{bc?.name || items[0]?.businessCenterName || 'Без БЦ'}</h3>
                  {bc?.address && <p className="text-sm text-[var(--muted)]">{bc.address}</p>}
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full surface-muted text-[var(--muted)]">
                  {items.length} оф.
                </span>
              </div>

              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {items
                  .sort((a, b) => a.number.localeCompare(b.number, 'ru', { numeric: true }))
                  .map((office) => (
                    <article
                      key={office.id}
                      className={`rounded-xl border p-4 transition-shadow hover:shadow-sm ${
                        office.isActive ? 'border-[var(--border)] bg-[var(--surface)]' : 'border-[var(--border)] bg-[var(--surface-muted)] opacity-70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <div className="text-2xl font-bold font-mono leading-none">{office.number}</div>
                          <div className="text-sm text-[var(--muted)] mt-1">{office.floor} этаж</div>
                        </div>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${
                          office.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-[var(--border)] text-[var(--muted)]'
                        }`}>
                          {office.isActive ? 'Активен' : 'Неактивен'}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-sm mb-4">
                        <div className="flex justify-between gap-2">
                          <span className="text-[var(--muted)]">Компания</span>
                          <span className="text-right font-medium">{office.company || '—'}</span>
                        </div>
                        {office.areaSqm ? (
                          <div className="flex justify-between gap-2">
                            <span className="text-[var(--muted)]">Площадь</span>
                            <span>{office.areaSqm} м²</span>
                          </div>
                        ) : null}
                        <div className="flex justify-between gap-2 items-start">
                          <span className="text-[var(--muted)] shrink-0 flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            Арендатор
                          </span>
                          {bindingOfficeId === office.id ? (
                            <div className="w-full space-y-2">
                              <BindingSelect office={office} />
                              <div className="flex gap-1 justify-end">
                                <button className="btn btn-primary text-xs py-1 px-2" disabled={saving} onClick={() => saveBinding(office.id)}>
                                  {saving ? '...' : 'Сохранить'}
                                </button>
                                <button className="btn btn-secondary text-xs py-1 px-2" onClick={resetForm}>Отмена</button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-right">
                              <div className={office.tenantName ? 'font-medium' : 'text-[var(--muted)]'}>
                                {office.tenantName || 'Не назначен'}
                              </div>
                              <button
                                type="button"
                                className="text-xs text-[var(--primary)] hover:underline mt-0.5"
                                onClick={() => startBinding(office)}
                              >
                                Изменить
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-1 pt-3 border-t border-[var(--border)]">
                        <button
                          type="button"
                          className="btn btn-secondary text-xs flex-1"
                          onClick={() => startEdit(office)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="p-2 rounded-md border border-[var(--border)] hover:bg-[var(--surface-muted)]"
                          title={office.isActive ? 'Деактивировать' : 'Активировать'}
                          onClick={() => toggleActive(office)}
                        >
                          {office.isActive ? <X className="w-4 h-4 text-red-500" /> : <Check className="w-4 h-4 text-emerald-600" />}
                        </button>
                        <button
                          type="button"
                          className="p-2 rounded-md border border-red-200 hover:bg-red-50 text-red-600"
                          title="Удалить офис"
                          disabled={deletingOfficeId === office.id}
                          onClick={() => handleDeleteOffice(office)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </article>
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}