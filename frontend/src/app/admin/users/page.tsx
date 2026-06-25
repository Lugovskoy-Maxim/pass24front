'use client';

import { useEffect, useState, useCallback, FormEvent } from 'react';
import { Plus, Search, Pencil, Link2 } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { api, AdminUser, BusinessCenter, CreateUserData, Office, ROLE_LABELS, UserRole, formatTenantOffices } from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';

const EMPTY: CreateUserData = {
  email: '', password: '', fullName: '', role: 'tenant', phone: '', company: '', office: '', floor: '', officeIds: [], propertyIds: [],
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [allOffices, setAllOffices] = useState<Office[]>([]);
  const [businessCenters, setBusinessCenters] = useState<BusinessCenter[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const debouncedSearch = useDebounce(search);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateUserData>(EMPTY);
  const [officeIds, setOfficeIds] = useState<string[]>([]);
  const [propertyIds, setPropertyIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.admin.getUsers({ role: roleFilter || undefined, search: debouncedSearch || undefined }),
      api.admin.getOffices(),
      api.admin.getBusinessCenters(),
    ])
      .then(([{ users: data }, { offices }, { businessCenters: bc }]) => {
        setUsers(data);
        setAllOffices(offices.filter((o) => o.isActive));
        setBusinessCenters(bc.filter((b) => b.isActive));
      })
      .finally(() => setLoading(false));
  }, [roleFilter, debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY);
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
    if (u.role === 'security' && u.businessCenters?.length) {
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
        propertyIds: form.role === 'security' ? propertyIds : [],
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
    <AdminLayout title="Арендаторы и сотрудники">
      <p className="text-[var(--muted)] -mt-4 mb-6">
        Привязка доступна только администратору: арендаторы — к офисам, ресепшн — к бизнес-центрам.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
          <input className="input pl-9" placeholder="Поиск по ФИО, компании, офису..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">Все роли</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn btn-primary" onClick={openCreate}><Plus className="w-4 h-4" /> Добавить</button>
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
                {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
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

          {form.role === 'security' && (
            <div className="border border-[var(--border)] rounded-lg p-4 bg-slate-50/50">
              <div className="flex items-center gap-2 mb-3">
                <Link2 className="w-4 h-4 text-[var(--primary)]" />
                <span className="font-medium text-sm">Привязка к бизнес-центрам</span>
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
              <th className="text-left p-3 font-medium hidden md:table-cell">Компания</th>
              <th className="text-left p-3 font-medium">Роль</th>
              <th className="text-left p-3 font-medium hidden sm:table-cell">Привязка</th>
              <th className="text-left p-3 font-medium">Статус</th>
              <th className="p-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-8 text-center text-[var(--muted)]">Загрузка...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-[var(--muted)]">Не найдены</td></tr>
            ) : users.map((u) => (
              <tr key={u.id} className="border-t border-[var(--border)] hover:bg-slate-50">
                <td className="p-3 font-medium">{u.fullName}</td>
                <td className="p-3 hidden md:table-cell text-[var(--muted)]">{u.company || '—'}</td>
                <td className="p-3">{ROLE_LABELS[u.role]}</td>
                <td className="p-3 hidden sm:table-cell text-[var(--muted)] max-w-xs text-xs">
                  {formatBindings(u)}
                </td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                    {u.isActive ? 'Активен' : 'Отключён'}
                  </span>
                </td>
                <td className="p-3"><button className="p-1 hover:text-[var(--primary)]" onClick={() => openEdit(u)} title="Редактировать"><Pencil className="w-4 h-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}