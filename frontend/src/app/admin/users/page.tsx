'use client';

import { useEffect, useState, useCallback, FormEvent } from 'react';
import { Plus, Search, Pencil } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { api, AdminUser, CreateUserData, ROLE_LABELS, UserRole } from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';

const EMPTY: CreateUserData = {
  email: '', password: '', fullName: '', role: 'tenant', phone: '', company: '', office: '', floor: '',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const debouncedSearch = useDebounce(search);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateUserData>(EMPTY);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.admin.getUsers({ role: roleFilter || undefined, search: debouncedSearch || undefined })
      .then(({ users: data }) => setUsers(data))
      .finally(() => setLoading(false));
  }, [roleFilter, debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditId(null); setForm(EMPTY); setIsActive(true); setShowForm(true); setError(''); };
  const openEdit = (u: AdminUser) => {
    setEditId(u.id);
    setForm({ email: u.email, password: '', fullName: u.fullName, role: u.role, phone: u.phone || '', company: u.company || '', office: u.office || '', floor: u.floor || '' });
    setIsActive(u.isActive);
    setShowForm(true);
    setError('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editId) {
        await api.admin.updateUser(editId, {
          fullName: form.fullName, phone: form.phone || undefined, company: form.company || undefined,
          role: form.role, office: form.office || undefined, floor: form.floor || undefined,
          isActive, ...(form.password ? { password: form.password } : {}),
        });
      } else {
        await api.admin.createUser(form);
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
            <div><label className="label">Роль *</label><select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>{Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div><label className="label">Компания</label><input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
            <div><label className="label">Офис</label><input className="input" value={form.office} onChange={(e) => setForm({ ...form, office: e.target.value })} /></div>
            <div><label className="label">Этаж</label><input className="input" value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} /></div>
          </div>
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
              <th className="text-left p-3 font-medium hidden sm:table-cell">Офис</th>
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
                <td className="p-3 hidden sm:table-cell">{u.office ? `оф. ${u.office}` : '—'}</td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                    {u.isActive ? 'Активен' : 'Отключён'}
                  </span>
                </td>
                <td className="p-3"><button className="p-1 hover:text-[var(--primary)]" onClick={() => openEdit(u)}><Pencil className="w-4 h-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}