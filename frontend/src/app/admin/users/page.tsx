'use client';

import { useEffect, useState, useCallback, FormEvent } from 'react';
import { Plus, Search, Pencil, Link2, X, Users, Building2, UserCog, Check, Clock, Trash2 } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { api, AdminUser, BusinessCenter, CreateUserData, Office, ProfileChangeRequest, ROLE_LABELS, UserCategory, UserFilters, UserRole, formatTenantOffices, getErrorMessage, getRoleLabel } from '@/lib/api';
import { PageError } from '@/components/PageError';
import { useToast } from '@/components/Toast';
import { useDebounce } from '@/hooks/useDebounce';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { PersonNameFields } from '@/components/PersonNameFields';
import { buildFullName, getUserNameLabels, isPersonNameValid, PersonNameParts, splitFullName } from '@/lib/person-name';
import { useConfig } from '@/hooks/useConfig';
import { getUiLabels } from '@/lib/ui-labels';

const EMPTY: CreateUserData = {
  email: '', password: '', role: 'tenant', phone: '', company: '', office: '', floor: '', officeIds: [], propertyIds: [],
};

const EMPTY_NAME: PersonNameParts = { lastName: '', firstName: '', middleName: '' };

const STAFF_ROLES: UserRole[] = ['security', 'bc_admin', 'admin'];

const EMPTY_FILTERS: Omit<UserFilters, 'category'> = {
  search: '',
  isActive: '',
  propertyId: '',
  officeId: '',
  role: '',
};

export default function AdminUsersPage() {
  const { toast } = useToast();
  const ph = getUiLabels(useConfig()).placeholders;
  const [category, setCategory] = useState<UserCategory>('tenants');
  const [profileRequests, setProfileRequests] = useState<Array<{ user: AdminUser; request: ProfileChangeRequest }>>([]);
  const [registrationRequests, setRegistrationRequests] = useState<AdminUser[]>([]);
  const [moderatingId, setModeratingId] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ tenants: 0, staff: 0 });
  const [allOffices, setAllOffices] = useState<Office[]>([]);
  const [businessCenters, setBusinessCenters] = useState<BusinessCenter[]>([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const debouncedSearch = useDebounce(filters.search);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateUserData>(EMPTY);
  const [nameParts, setNameParts] = useState<PersonNameParts>(EMPTY_NAME);
  const [officeIds, setOfficeIds] = useState<string[]>([]);
  const [propertyIds, setPropertyIds] = useState<string[]>([]);
  const [officePickerSearch, setOfficePickerSearch] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loadErrorCause, setLoadErrorCause] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const buildQuery = useCallback((cat: UserCategory, applied: typeof appliedFilters, search?: string): UserFilters => ({
    category: cat,
    search: search?.trim() || undefined,
    isActive: applied.isActive || undefined,
    propertyId: applied.propertyId || undefined,
    officeId: cat === 'tenants' ? applied.officeId || undefined : undefined,
    role: cat === 'staff' ? applied.role || undefined : undefined,
  }), []);

  const loadProfileRequests = useCallback(() => {
    return api.admin.getProfileChangeRequests()
      .then(({ requests }) => setProfileRequests(requests))
      .catch(() => setProfileRequests([]));
  }, []);

  const loadRegistrationRequests = useCallback(() => {
    return api.admin.getRegistrationRequests()
      .then(({ requests }) => setRegistrationRequests(requests))
      .catch(() => setRegistrationRequests([]));
  }, []);

  const load = useCallback((options?: { silent?: boolean }) => {
    const silent = options?.silent;
    if (!silent) {
      setLoading(true);
      setLoadError('');
      setLoadErrorCause(null);
    }
    return Promise.all([
      api.admin.getUsers(buildQuery(category, appliedFilters, debouncedSearch)),
      api.admin.getOffices(),
      api.admin.getBusinessCenters(),
    ])
      .then(([{ users: data, total: t, counts: c }, { offices }, { businessCenters: bc }]) => {
        setUsers(data);
        setTotal(t);
        setCounts(c);
        setAllOffices(offices.filter((o) => o.isActive));
        setBusinessCenters(bc.filter((b) => b.isActive));
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
  }, [category, appliedFilters, debouncedSearch, buildQuery]);

  useEffect(() => { load(); }, [load]);

  const refreshModeration = useCallback(() => {
    if (category !== 'tenants') return Promise.resolve();
    return Promise.all([loadProfileRequests(), loadRegistrationRequests()]);
  }, [category, loadProfileRequests, loadRegistrationRequests]);

  useAutoRefresh(() => {
    void load({ silent: true });
    void refreshModeration();
  }, { enabled: !saving && !showForm });

  useEffect(() => {
    if (category === 'tenants') {
      loadProfileRequests();
      loadRegistrationRequests();
    } else {
      setProfileRequests([]);
      setRegistrationRequests([]);
    }
  }, [category]);

  const handleApproveRegistration = async (id: string) => {
    setModeratingId(id);
    try {
      await api.admin.approveRegistration(id);
      toast('Регистрация подтверждена. Назначьте офис в карточке пользователя.', 'success');
      load();
      loadRegistrationRequests();
    } catch (err) {
      toast(getErrorMessage(err, 'Ошибка'), 'error');
    } finally {
      setModeratingId(null);
    }
  };

  const handleRejectRegistration = async (id: string) => {
    if (!window.confirm('Отклонить заявку на регистрацию? Пользователь сможет подать заявку повторно.')) {
      return;
    }
    setModeratingId(id);
    try {
      await api.admin.rejectRegistration(id);
      toast('Заявка на регистрацию отклонена', 'success');
      load();
      loadRegistrationRequests();
    } catch (err) {
      toast(getErrorMessage(err, 'Ошибка'), 'error');
    } finally {
      setModeratingId(null);
    }
  };

  const handleApproveProfile = async (id: string) => {
    setModeratingId(id);
    try {
      await api.admin.approveProfileChange(id);
      toast('Изменения профиля подтверждены', 'success');
      load();
      loadProfileRequests();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    } finally {
      setModeratingId(null);
    }
  };

  const handleRejectProfile = async (id: string) => {
    setModeratingId(id);
    try {
      await api.admin.rejectProfileChange(id);
      toast('Изменения профиля отклонены', 'success');
      load();
      loadProfileRequests();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    } finally {
      setModeratingId(null);
    }
  };

  const applyFilters = () => setAppliedFilters({ ...filters });

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
  };

  const switchCategory = (cat: UserCategory) => {
    setCategory(cat);
    setFilters((prev) => ({ ...prev, role: '', officeId: cat === 'staff' ? '' : prev.officeId }));
    setAppliedFilters((prev) => ({ ...prev, role: '', officeId: cat === 'staff' ? '' : prev.officeId }));
  };

  const hasActiveFilters = !!(
    appliedFilters.isActive ||
    appliedFilters.propertyId ||
    appliedFilters.officeId ||
    appliedFilters.role ||
    debouncedSearch
  );

  const officesForFilter = filters.propertyId
    ? allOffices.filter((o) => o.propertyId === filters.propertyId)
    : allOffices;

  const openCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY, role: category === 'tenants' ? 'tenant' : 'security' });
    setNameParts(EMPTY_NAME);
    setOfficeIds([]);
    setPropertyIds([]);
    setOfficePickerSearch('');
    setIsActive(true);
    setShowForm(true);
    setError('');
  };

  const openEdit = (u: AdminUser) => {
    setEditId(u.id);
    setForm({
      email: u.email,
      password: '',
      role: u.role,
      phone: u.phone || '',
      company: u.company || '',
      office: u.office || '',
      floor: u.floor || '',
    });
    setNameParts(
      u.lastName || u.firstName
        ? { lastName: u.lastName || '', firstName: u.firstName || '', middleName: u.middleName || '' }
        : splitFullName(u.fullName),
    );
    setOfficeIds(u.offices?.map((o) => o.id) || []);
    setPropertyIds(u.propertyIds || u.businessCenters?.map((bc) => bc.id) || []);
    setOfficePickerSearch('');
    setIsActive(u.isActive);
    setShowForm(true);
    setError('');
  };

  const toggleOffice = (id: string) => {
    setOfficeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleDeleteUser = async (u: AdminUser) => {
    const kind = category === 'tenants' ? 'арендатора' : 'сотрудника';
    const extra = category === 'tenants'
      ? '\nОфисы компании будут отвязаны. Если есть сотрудники компании — сначала удалите их.'
      : '';
    if (!window.confirm(`Удалить ${kind} «${u.fullName}» (${u.email})?${extra}\n\nДействие нельзя отменить.`)) {
      return;
    }
    setDeletingUserId(u.id);
    try {
      await api.admin.deleteUser(u.id);
      toast('Пользователь удалён', 'success');
      if (editId === u.id) setShowForm(false);
      load();
    } catch (err) {
      toast(getErrorMessage(err, 'Ошибка удаления'), 'error');
    } finally {
      setDeletingUserId(null);
    }
  };

  const toggleProperty = (id: string) => {
    setPropertyIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const officesByBc = allOffices.reduce((acc, office) => {
    const key = office.businessCenterName || 'Без БЦ';
    if (!acc[key]) acc[key] = [];
    acc[key].push(office);
    return acc;
  }, {} as Record<string, Office[]>);

  const officePickerQuery = officePickerSearch.trim().toLowerCase();
  const filteredOfficesByBc = Object.entries(officesByBc).reduce((acc, [bc, list]) => {
    const filtered = officePickerQuery
      ? list.filter((o) => {
          const hay = `${o.number} ${o.floor || ''} ${o.company || ''} ${o.tenantName || ''} ${bc}`.toLowerCase();
          return hay.includes(officePickerQuery);
        })
      : list;
    if (filtered.length) acc[bc] = filtered;
    return acc;
  }, {} as Record<string, Office[]>);

  const selectedOfficeChips = allOffices.filter((o) => officeIds.includes(o.id));

  const formatBindings = (u: AdminUser) => {
    if (u.role === 'tenant' && u.offices?.length) return formatTenantOffices(u.offices);
    if ((u.role === 'security' || u.role === 'bc_admin') && u.businessCenters?.length) {
      return u.businessCenters.map((bc) => bc.name).join(' · ');
    }
    if (u.office) return `оф. ${u.office}`;
    return '—';
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!isPersonNameValid(nameParts)) {
      setError('Укажите фамилию и имя');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        lastName: nameParts.lastName.trim(),
        firstName: nameParts.firstName.trim(),
        middleName: nameParts.middleName.trim() || undefined,
        fullName: buildFullName(nameParts),
        phone: form.phone || undefined,
        company: form.company || undefined,
        role: form.role,
        office: form.role !== 'tenant' && form.role !== 'security' ? form.office || undefined : undefined,
        floor: form.role !== 'tenant' && form.role !== 'security' ? form.floor || undefined : undefined,
        officeIds: form.role === 'tenant' ? officeIds : [],
        propertyIds: form.role === 'security' || form.role === 'bc_admin' ? propertyIds : [],
      };
      if (editId) {
        await api.admin.updateUser(editId, {
          ...payload,
          isActive,
          ...(form.password ? { password: form.password } : {}),
        });
      } else {
        await api.admin.createUser({ ...form, ...payload });
      }
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout title="Пользователи">
      <p className="text-[var(--muted)] -mt-4 mb-6">
        Арендаторы привязаны к офисам, сотрудники — к бизнес-центрам
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

      <div className="flex flex-wrap gap-2 mb-6">
        <button
          type="button"
          onClick={() => switchCategory('tenants')}
          className={`btn text-sm ${category === 'tenants' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <Building2 className="w-4 h-4" />
          Арендаторы
          <span className="ml-1 opacity-80">({counts.tenants})</span>
        </button>
        <button
          type="button"
          onClick={() => switchCategory('staff')}
          className={`btn text-sm ${category === 'staff' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <UserCog className="w-4 h-4" />
          Сотрудники
          <span className="ml-1 opacity-80">({counts.staff})</span>
        </button>
      </div>

      <div className="card p-4 mb-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
            <input
              className="input input--icon-left"
              placeholder={ph.userSearch}
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }}
            />
          </div>

          <div className="select-wrap">
            <select
              className="input"
              value={filters.isActive}
              onChange={(e) => setFilters((prev) => ({ ...prev, isActive: e.target.value as UserFilters['isActive'] }))}
            >
              <option value="">Все статусы</option>
              <option value="true">Активные</option>
              <option value="false">Неактивные / ожидают подтверждения</option>
            </select>
          </div>

          <div className="select-wrap">
            <select
              className="input"
              value={filters.propertyId}
              onChange={(e) => setFilters((prev) => ({
                ...prev,
                propertyId: e.target.value,
                officeId: e.target.value ? prev.officeId : '',
              }))}
            >
              <option value="">Все бизнес-центры</option>
              {businessCenters.map((bc) => (
                <option key={bc.id} value={bc.id}>{bc.name}</option>
              ))}
            </select>
          </div>

          {category === 'tenants' ? (
            <div className="select-wrap">
              <select
                className="input"
                value={filters.officeId}
                onChange={(e) => setFilters((prev) => ({ ...prev, officeId: e.target.value }))}
              >
                <option value="">Все офисы</option>
                {officesForFilter.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.businessCenterName ? `${office.businessCenterName}: ` : ''}оф. {office.number}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="select-wrap">
              <select
                className="input"
                value={filters.role}
                onChange={(e) => setFilters((prev) => ({ ...prev, role: e.target.value }))}
              >
                <option value="">Все роли</option>
                {STAFF_ROLES.map((role) => (
                  <option key={role} value={role}>{getRoleLabel(role)}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary text-sm" onClick={applyFilters}>Применить</button>
          {hasActiveFilters && (
            <button type="button" className="btn btn-secondary text-sm" onClick={resetFilters}>
              <X className="w-4 h-4" />
              Сбросить
            </button>
          )}
          <button type="button" className="btn btn-primary text-sm ml-auto" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            {category === 'tenants' ? 'Добавить арендатора' : 'Добавить сотрудника'}
          </button>
        </div>

        {hasActiveFilters && (
          <p className="text-xs text-[var(--muted)] flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Найдено: {total}
          </p>
        )}
      </div>

      {category === 'tenants' && registrationRequests.length > 0 && (
        <div className="card p-5 mb-6 border theme-alert-subtle space-y-3">
          <div className="flex items-center gap-2 font-semibold text-amber-900">
            <Clock className="w-4 h-4" />
            Заявки на регистрацию ({registrationRequests.length})
          </div>
          <p className="text-sm text-amber-900/80">
            После подтверждения назначьте офис арендатору в карточке пользователя.
          </p>
          {registrationRequests.map((u) => (
            <div key={u.id} className="rounded-lg border border-[var(--alert-border)] bg-[var(--surface)] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="text-sm">
                <div className="font-medium">{u.fullName}</div>
                <div className="text-[var(--muted)] mt-1">
                  {u.email || '—'}
                  {u.email && (
                    <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${u.emailVerified ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {u.emailVerified ? 'email подтверждён' : 'email не подтверждён'}
                    </span>
                  )}
                </div>
                <div className="text-[var(--muted)] mt-1">
                  {u.company && `Компания: ${u.company}`}
                  {u.phone ? ` · Тел.: ${u.phone}` : ''}
                  {u.createdAt ? ` · ${new Date(u.createdAt).toLocaleString('ru-RU')}` : ''}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  className="btn btn-success text-sm"
                  disabled={moderatingId === u.id}
                  onClick={() => handleApproveRegistration(u.id)}
                >
                  <Check className="w-4 h-4" />
                  Подтвердить
                </button>
                <button
                  type="button"
                  className="btn btn-secondary text-sm"
                  disabled={moderatingId === u.id}
                  onClick={() => openEdit(u)}
                >
                  <Pencil className="w-4 h-4" />
                  Назначить офис
                </button>
                <button
                  type="button"
                  className="btn btn-danger text-sm"
                  disabled={moderatingId === u.id}
                  onClick={() => handleRejectRegistration(u.id)}
                >
                  <X className="w-4 h-4" />
                  Отклонить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {category === 'tenants' && profileRequests.length > 0 && (
        <div className="card p-5 mb-6 border theme-alert-subtle space-y-3">
          <div className="flex items-center gap-2 font-semibold text-amber-900">
            <Clock className="w-4 h-4" />
            Заявки на изменение профиля ({profileRequests.length})
          </div>
          {profileRequests.map(({ user: u, request }) => (
            <div key={u.id} className="rounded-lg border border-[var(--alert-border)] bg-[var(--surface)] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="text-sm">
                <div className="font-medium">{u.fullName} → <span className="text-[var(--primary)]">{request.full_name}</span></div>
                <div className="text-[var(--muted)] mt-1">{u.email}</div>
                <div className="text-[var(--muted)] mt-1">
                  {(request.company || u.company) && `Компания: ${u.company || '—'} → ${request.company || '—'} · `}
                  {(request.phone || u.phone) && `Тел.: ${u.phone || '—'} → ${request.phone || '—'} · `}
                  {new Date(request.requested_at).toLocaleString('ru-RU')}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  className="btn btn-success text-sm"
                  disabled={moderatingId === u.id}
                  onClick={() => handleApproveProfile(u.id)}
                >
                  <Check className="w-4 h-4" />
                  Подтвердить
                </button>
                <button
                  type="button"
                  className="btn btn-danger text-sm"
                  disabled={moderatingId === u.id}
                  onClick={() => handleRejectProfile(u.id)}
                >
                  <X className="w-4 h-4" />
                  Отклонить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-5 mb-6 space-y-4">
          <h2 className="font-semibold">{editId ? 'Редактирование' : 'Новый пользователь'}</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className="label">Email *</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required disabled={!!editId} /></div>
            <div><label className="label">{editId ? 'Новый пароль' : 'Пароль *'}</label><input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editId} minLength={6} /></div>
            <div className="sm:col-span-2">
              <PersonNameFields
                value={nameParts}
                labels={getUserNameLabels(form.role)}
                onChange={setNameParts}
              />
            </div>
            <div>
              <label className="label">Роль *</label>
              <div className="select-wrap">
                <select
                  className="input"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                >
                  {category === 'tenants'
                    ? <option value="tenant">{ROLE_LABELS.tenant}</option>
                    : STAFF_ROLES.map((role) => <option key={role} value={role}>{getRoleLabel(role)}</option>)}
                  {category === 'staff' && <option value="tenant">{ROLE_LABELS.tenant}</option>}
                </select>
              </div>
            </div>
            <div><label className="label">Компания</label><input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
            <div><label className="label">Телефон</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>

          {form.role === 'tenant' && (
            <div className="border border-[var(--border)] rounded-lg p-4 bg-[var(--surface-muted)] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-[var(--primary)]" />
                  <span className="font-medium text-sm">Привязка к офисам</span>
                </div>
                {officeIds.length > 0 && (
                  <button
                    type="button"
                    className="text-xs text-[var(--muted)] hover:text-[var(--primary)]"
                    onClick={() => setOfficeIds([])}
                  >
                    Снять все
                  </button>
                )}
              </div>
              <p className="text-xs text-[var(--muted)]">
                Выберите офисы компании. Занятый офис при сохранении перейдёт к этому арендатору.
              </p>

              {selectedOfficeChips.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedOfficeChips.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-[var(--status-approved-soft)] text-[var(--status-approved)] border border-[var(--status-approved-border)]"
                      onClick={() => toggleOffice(o.id)}
                      title="Убрать"
                    >
                      {o.businessCenterName ? `${o.businessCenterName}: ` : ''}оф. {o.number}
                      <X className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              )}

              {allOffices.length === 0 ? (
                <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded-md">
                  Сначала добавьте офисы в реестре или создайте тестовые данные.
                </p>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
                    <input
                      className="input input--icon-left text-sm"
                      value={officePickerSearch}
                      onChange={(e) => setOfficePickerSearch(e.target.value)}
                      placeholder="Поиск офиса, БЦ, компании..."
                    />
                  </div>
                  <div className="border border-[var(--border)] rounded-lg divide-y divide-[var(--border)] max-h-64 overflow-y-auto bg-[var(--surface)]">
                    {Object.keys(filteredOfficesByBc).length === 0 ? (
                      <div className="p-4 text-sm text-[var(--muted)] text-center">Ничего не найдено</div>
                    ) : (
                      Object.entries(filteredOfficesByBc).map(([bc, offices]) => (
                        <div key={bc} className="p-3">
                          <div className="text-xs font-semibold text-[var(--muted)] uppercase mb-2">{bc}</div>
                          <div className="space-y-1.5">
                            {offices.map((office) => {
                              const checked = officeIds.includes(office.id);
                              const occupiedByOther = !!(office.tenantId && office.tenantId !== editId);
                              return (
                                <label
                                  key={office.id}
                                  className={`flex items-start gap-2.5 text-sm cursor-pointer rounded-md px-2 py-1.5 -mx-1 ${
                                    checked ? 'bg-[var(--status-approved-soft)]' : 'hover:bg-[var(--surface-muted)]'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="mt-0.5"
                                    checked={checked}
                                    onChange={() => toggleOffice(office.id)}
                                  />
                                  <span className="min-w-0">
                                    <span className="font-medium">оф. {office.number}</span>
                                    {office.floor ? <span className="text-[var(--muted)]"> · {office.floor} эт.</span> : null}
                                    {occupiedByOther ? (
                                      <span className="block text-[11px] text-amber-700 mt-0.5">
                                        Занят: {office.tenantName || 'другой арендатор'}
                                        {office.company ? ` (${office.company})` : ''} — при сохранении перейдёт сюда
                                      </span>
                                    ) : office.company ? (
                                      <span className="block text-[11px] text-[var(--muted)]">{office.company}</span>
                                    ) : null}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
              <p className="text-xs text-[var(--muted)]">
                {officeIds.length > 0 ? `Выбрано офисов: ${officeIds.length}` : 'Офисы не выбраны — заказ пропусков будет недоступен'}
              </p>
            </div>
          )}

          {(form.role === 'security' || form.role === 'bc_admin') && (
            <div className="border border-[var(--border)] rounded-lg p-4 bg-[var(--surface-muted)]">
              <div className="flex items-center gap-2 mb-3">
                <Link2 className="w-4 h-4 text-[var(--primary)]" />
                <span className="font-medium text-sm">
                  {form.role === 'bc_admin' ? 'Бизнес-центры под управлением' : 'Привязка к бизнес-центрам'}
                </span>
              </div>
              {businessCenters.length === 0 ? (
                <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded-md">Сначала создайте бизнес-центры.</p>
              ) : (
                <div className="space-y-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 max-h-48 overflow-y-auto">
                  {businessCenters.map((bc) => (
                    <label key={bc.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={propertyIds.includes(bc.id)}
                        onChange={() => toggleProperty(bc.id)}
                      />
                      <span>{bc.name}{bc.address && <span className="text-[var(--muted)]"> · {bc.address}</span>}</span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-[var(--muted)] mt-2">
                {propertyIds.length > 0 ? `Выбрано БЦ: ${propertyIds.length}` : 'Бизнес-центры не выбраны'}
              </p>
            </div>
          )}

          {editId && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />Активен</label>}
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Отмена</button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="surface-muted text-[var(--muted)]">
            <tr>
              <th className="text-left p-3 font-medium">ФИО</th>
              <th className="text-left p-3 font-medium hidden lg:table-cell">Email</th>
              {category === 'tenants' && (
                <th className="text-left p-3 font-medium hidden md:table-cell">Компания</th>
              )}
              {category === 'staff' && (
                <th className="text-left p-3 font-medium">Роль</th>
              )}
              <th className="text-left p-3 font-medium hidden sm:table-cell">
                {category === 'tenants' ? 'Офисы' : 'Бизнес-центры'}
              </th>
              <th className="text-left p-3 font-medium">Статус</th>
              <th className="p-3 w-20 text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-8 text-center text-[var(--muted)]">Загрузка...</td></tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-[var(--muted)]">
                  {category === 'tenants' ? 'Арендаторы не найдены' : 'Сотрудники не найдены'}
                </td>
              </tr>
            ) : users.map((u) => (
              <tr key={u.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-muted)]">
                <td className="p-3">
                  <div className="font-medium flex items-center gap-2 flex-wrap">
                    {u.fullName}
                    {u.profileChangeRequest && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        на модерации
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--muted)] lg:hidden">
                    {u.email || '—'}
                    {u.email && (
                      <span className={`ml-1.5 text-[10px] ${u.emailVerified ? 'text-emerald-700' : 'text-slate-500'}`}>
                        ({u.emailVerified ? 'подтверждён' : 'не подтверждён'})
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--muted)] sm:hidden mt-1">
                    {formatBindings(u)}
                  </div>
                </td>
                <td className="p-3 hidden lg:table-cell text-[var(--muted)]">
                  <div>{u.email || '—'}</div>
                  {u.email && (
                    <div className={`text-[10px] mt-0.5 ${u.emailVerified ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {u.emailVerified ? 'подтверждён' : 'не подтверждён'}
                    </div>
                  )}
                </td>
                {category === 'tenants' && (
                  <td className="p-3 hidden md:table-cell text-[var(--muted)]">{u.company || '—'}</td>
                )}
                {category === 'staff' && (
                  <td className="p-3">{getRoleLabel(u.role)}</td>
                )}
                <td className="p-3 hidden sm:table-cell text-[var(--muted)] max-w-xs text-xs">
                  {formatBindings(u)}
                </td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.isActive ? 'bg-emerald-50 text-emerald-700' : u.role === 'tenant' && !u.offices?.length ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-600'}`}>
                    {u.isActive ? 'Активен' : u.role === 'tenant' && !u.offices?.length ? 'Ожидает подтверждения' : 'Отключён'}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      className="p-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--surface-muted)]"
                      onClick={() => openEdit(u)}
                      title="Редактировать"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 rounded-md border border-red-200 hover:bg-red-50 text-red-600"
                      onClick={() => handleDeleteUser(u)}
                      disabled={deletingUserId === u.id}
                      title="Удалить"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}