'use client';

import { useEffect, useState, useCallback, FormEvent } from 'react';
import { Plus, Search, Pencil, Link2, X, Users, Building2, UserCog } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { api, AdminUser, BusinessCenter, CreateUserData, Office, ROLE_LABELS, UserCategory, UserFilters, UserRole, formatTenantOffices } from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';

const EMPTY: CreateUserData = {
  email: '', password: '', fullName: '', role: 'tenant', phone: '', company: '', office: '', floor: '', officeIds: [], propertyIds: [],
};

const STAFF_ROLES: UserRole[] = ['security', 'bc_admin', 'admin'];

const EMPTY_FILTERS: Omit<UserFilters, 'category'> = {
  search: '',
  isActive: '',
  propertyId: '',
  officeId: '',
  role: '',
};

export default function AdminUsersPage() {
  const [category, setCategory] = useState<UserCategory>('tenants');
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
  const [officeIds, setOfficeIds] = useState<string[]>([]);
  const [propertyIds, setPropertyIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const buildQuery = useCallback((cat: UserCategory, applied: typeof appliedFilters, search?: string): UserFilters => ({
    category: cat,
    search: search?.trim() || undefined,
    isActive: applied.isActive || undefined,
    propertyId: applied.propertyId || undefined,
    officeId: cat === 'tenants' ? applied.officeId || undefined : undefined,
    role: cat === 'staff' ? applied.role || undefined : undefined,
  }), []);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
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
      .finally(() => setLoading(false));
  }, [category, appliedFilters, debouncedSearch, buildQuery]);

  useEffect(() => { load(); }, [load]);

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
    setOfficeIds([]);
    setPropertyIds([]);
    setIsActive(true);
    setShowForm(true);
    setError('');
  };

  const openEdit = (u: AdminUser) => {
    setEditId(u.id);
    setForm({
      email: u.email,
      password: '',
      fullName: u.fullName,
      role: u.role,
      phone: u.phone || '',
      company: u.company || '',
      office: u.office || '',
      floor: u.floor || '',
    });
    setOfficeIds(u.offices?.map((o) => o.id) || []);
    setPropertyIds(u.propertyIds || u.businessCenters?.map((bc) => bc.id) || []);
    setIsActive(u.isActive);
    setShowForm(true);
    setError('');
  };

  const toggleOffice = (id: string) => {
    setOfficeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
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
    setSaving(true);
    setError('');
    try {
      const payload = {
        fullName: form.fullName,
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
              className="input pl-9"
              placeholder="ФИО, email, компания..."
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }}
            />
          </div>

          <div>
            <select
              className="input"
              value={filters.isActive}
              onChange={(e) => setFilters((prev) => ({ ...prev, isActive: e.target.value as UserFilters['isActive'] }))}
            >
              <option value="">Все статусы</option>
              <option value="true">Активные</option>
              <option value="false">Отключённые</option>
            </select>
          </div>

          <div>
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
            <div>
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
            <div>
              <select
                className="input"
                value={filters.role}
                onChange={(e) => setFilters((prev) => ({ ...prev, role: e.target.value }))}
              >
                <option value="">Все роли</option>
                {STAFF_ROLES.map((role) => (
                  <option key={role} value={role}>{ROLE_LABELS[role]}</option>
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

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-5 mb-6 space-y-4">
          <h2 className="font-semibold">{editId ? 'Редактирование' : 'Новый пользователь'}</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className="label">Email *</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required disabled={!!editId} /></div>
            <div><label className="label">{editId ? 'Новый пароль' : 'Пароль *'}</label><input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editId} minLength={6} /></div>
            <div><label className="label">ФИО *</label><input className="input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></div>
            <div>
              <label className="label">Роль *</label>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
                {category === 'tenants'
                  ? <option value="tenant">{ROLE_LABELS.tenant}</option>
                  : STAFF_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                {category === 'staff' && <option value="tenant">{ROLE_LABELS.tenant}</option>}
              </select>
            </div>
            <div><label className="label">Компания</label><input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
            <div><label className="label">Телефон</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>

          {form.role === 'tenant' && (
            <div className="border border-[var(--border)] rounded-lg p-4 bg-slate-50/50">
              <div className="flex items-center gap-2 mb-3">
                <Link2 className="w-4 h-4 text-[var(--primary)]" />
                <span className="font-medium text-sm">Привязка к офисам</span>
              </div>
              {allOffices.length === 0 ? (
                <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded-md">
                  Сначала добавьте офисы в реестре или создайте тестовые данные.
                </p>
              ) : (
                <div className="border border-[var(--border)] rounded-lg divide-y divide-[var(--border)] max-h-64 overflow-y-auto bg-white">
                  {Object.entries(officesByBc).map(([bc, offices]) => (
                    <div key={bc} className="p-3">
                      <div className="text-xs font-semibold text-[var(--muted)] uppercase mb-2">{bc}</div>
                      <div className="space-y-2">
                        {offices.map((office) => (
                          <label key={office.id} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={officeIds.includes(office.id)}
                              onChange={() => toggleOffice(office.id)}
                            />
                            <span>
                              оф. {office.number}, {office.floor} эт.
                              {office.company && <span className="text-[var(--muted)]"> · {office.company}</span>}
                              {office.tenantId && office.tenantId !== editId && (
                                <span className="text-xs text-amber-600 ml-1">(занят: {office.tenantName})</span>
                              )}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-[var(--muted)] mt-2">
                {officeIds.length > 0 ? `Выбрано офисов: ${officeIds.length}` : 'Офисы не выбраны'}
              </p>
            </div>
          )}

          {(form.role === 'security' || form.role === 'bc_admin') && (
            <div className="border border-[var(--border)] rounded-lg p-4 bg-slate-50/50">
              <div className="flex items-center gap-2 mb-3">
                <Link2 className="w-4 h-4 text-[var(--primary)]" />
                <span className="font-medium text-sm">
                  {form.role === 'bc_admin' ? 'Бизнес-центры под управлением' : 'Привязка к бизнес-центрам'}
                </span>
              </div>
              {businessCenters.length === 0 ? (
                <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded-md">Сначала создайте бизнес-центры.</p>
              ) : (
                <div className="space-y-2 bg-white border border-[var(--border)] rounded-lg p-3 max-h-48 overflow-y-auto">
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
          <thead className="bg-slate-50 text-[var(--muted)]">
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
              <th className="p-3 w-10" />
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
              <tr key={u.id} className="border-t border-[var(--border)] hover:bg-slate-50">
                <td className="p-3">
                  <div className="font-medium">{u.fullName}</div>
                  <div className="text-xs text-[var(--muted)] lg:hidden">{u.email}</div>
                </td>
                <td className="p-3 hidden lg:table-cell text-[var(--muted)]">{u.email}</td>
                {category === 'tenants' && (
                  <td className="p-3 hidden md:table-cell text-[var(--muted)]">{u.company || '—'}</td>
                )}
                {category === 'staff' && (
                  <td className="p-3">{ROLE_LABELS[u.role]}</td>
                )}
                <td className="p-3 hidden sm:table-cell text-[var(--muted)] max-w-xs text-xs">
                  {formatBindings(u)}
                </td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                    {u.isActive ? 'Активен' : 'Отключён'}
                  </span>
                </td>
                <td className="p-3">
                  <button className="p-1 hover:text-[var(--primary)]" onClick={() => openEdit(u)} title="Редактировать">
                    <Pencil className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}