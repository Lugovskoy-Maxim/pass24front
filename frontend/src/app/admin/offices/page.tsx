'use client';

import { useEffect, useState, FormEvent } from 'react';
import { Plus, Pencil, Check, X } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { useToast } from '@/components/Toast';
import { api, Office, AdminUser } from '@/lib/api';

export default function AdminOfficesPage() {
  const { toast } = useToast();
  const [offices, setOffices] = useState<Office[]>([]);
  const [tenants, setTenants] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [number, setNumber] = useState('');
  const [floor, setFloor] = useState('');
  const [areaSqm, setAreaSqm] = useState('');
  const [company, setCompany] = useState('');
  const [tenantId, setTenantId] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([api.admin.getOffices(), api.admin.getUsers({ role: 'tenant' })])
      .then(([{ offices: o }, { users: t }]) => {
        setOffices(o);
        setTenants(t);
      })
      .catch((err) => toast(err instanceof Error ? err.message : 'Ошибка загрузки', 'error'))
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
  };

  const startEdit = (office: Office) => {
    setEditingId(office.id);
    setNumber(office.number);
    setFloor(office.floor);
    setAreaSqm(office.areaSqm?.toString() || '');
    setCompany(office.company || '');
    setTenantId(office.tenantId || '');
    setShowForm(false);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.admin.createOffice({
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

  const handleUpdate = async (id: string) => {
    setSaving(true);
    try {
      await api.admin.updateOffice(id, {
        company: company.trim() || undefined,
        tenantId: tenantId || undefined,
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

  const toggleActive = async (office: Office) => {
    try {
      await api.admin.updateOffice(office.id, { isActive: !office.isActive });
      toast(office.isActive ? 'Офис деактивирован' : 'Офис активирован', 'success');
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    }
  };

  return (
    <AdminLayout title="Реестр офисов">
      <p className="text-[var(--muted)] -mt-4 mb-6">Управление офисами и привязка арендаторов</p>

      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-[var(--muted)]">{offices.length} офисов в реестре</div>
        {!showForm && !editingId && (
          <button className="btn btn-primary text-sm" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" />
            Добавить офис
          </button>
        )}
      </div>

      {(showForm || editingId) && (
        <form onSubmit={editingId ? (e) => { e.preventDefault(); handleUpdate(editingId); } : handleCreate} className="card p-5 mb-6 space-y-4 max-w-lg">
          <h3 className="font-semibold">{editingId ? 'Редактирование офиса' : 'Новый офис'}</h3>
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
          <div>
            <label className="label">Компания</label>
            <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="ООО «...»" />
          </div>
          <div>
            <label className="label">Арендатор</label>
            <select className="input" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
              <option value="">Не назначен</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.fullName} ({t.email})</option>
              ))}
            </select>
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
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-slate-50">
                <th className="text-left p-3 font-medium">Офис</th>
                <th className="text-left p-3 font-medium">Этаж</th>
                <th className="text-left p-3 font-medium hidden sm:table-cell">Площадь</th>
                <th className="text-left p-3 font-medium">Компания</th>
                <th className="text-left p-3 font-medium hidden md:table-cell">Арендатор</th>
                <th className="text-left p-3 font-medium">Статус</th>
                <th className="p-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {offices.map((office) => (
                <tr key={office.id} className={`border-b border-[var(--border)] last:border-0 ${!office.isActive ? 'opacity-50' : ''}`}>
                  <td className="p-3 font-mono font-medium">{office.number}</td>
                  <td className="p-3">{office.floor}</td>
                  <td className="p-3 hidden sm:table-cell">{office.areaSqm ? `${office.areaSqm} м²` : '—'}</td>
                  <td className="p-3">{office.company || '—'}</td>
                  <td className="p-3 hidden md:table-cell">{office.tenantName || '—'}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${office.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {office.isActive ? 'Активен' : 'Неактивен'}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button className="p-1.5 rounded hover:bg-slate-100" title="Редактировать" onClick={() => startEdit(office)}>
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 rounded hover:bg-slate-100" title={office.isActive ? 'Деактивировать' : 'Активировать'} onClick={() => toggleActive(office)}>
                        {office.isActive ? <X className="w-4 h-4 text-red-500" /> : <Check className="w-4 h-4 text-emerald-600" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}