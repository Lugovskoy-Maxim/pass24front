'use client';

import { useEffect, useState, FormEvent } from 'react';
import { Plus, Pencil, Check, X, Link2 } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { useToast } from '@/components/Toast';
import { api, Office, AdminUser, BusinessCenter } from '@/lib/api';

export default function AdminOfficesPage() {
  const { toast } = useToast();
  const [offices, setOffices] = useState<Office[]>([]);
  const [tenants, setTenants] = useState<AdminUser[]>([]);
  const [businessCenters, setBusinessCenters] = useState<BusinessCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [bindingOfficeId, setBindingOfficeId] = useState<string | null>(null);
  const [editingBcId, setEditingBcId] = useState<string | null>(null);
  const [showBcForm, setShowBcForm] = useState(false);
  const [bcName, setBcName] = useState('');
  const [bcAddress, setBcAddress] = useState('');

  const [propertyId, setPropertyId] = useState('');
  const [number, setNumber] = useState('');
  const [floor, setFloor] = useState('');
  const [areaSqm, setAreaSqm] = useState('');
  const [company, setCompany] = useState('');
  const [tenantId, setTenantId] = useState('');

  const load = () => {
    setLoading(true);
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
    setBindingOfficeId(null);
    if (businessCenters[0]) setPropertyId(businessCenters[0].id);
  };

  const resetBcForm = () => {
    setShowBcForm(false);
    setEditingBcId(null);
    setBcName('');
    setBcAddress('');
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

  const saveBcEdit = async () => {
    if (!editingBcId || !bcName.trim()) return;
    setSaving(true);
    try {
      const { businessCenter } = await api.admin.updateBusinessCenter(editingBcId, {
        name: bcName.trim(),
        address: bcAddress.trim() || undefined,
      });
      setBusinessCenters((prev) => prev.map((bc) => (bc.id === editingBcId ? businessCenter : bc)));
      setOffices((prev) => prev.map((o) => (
        o.propertyId === editingBcId ? { ...o, businessCenterName: businessCenter.name } : o
      )));
      resetBcForm();
      toast('Название БЦ обновлено', 'success');
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

  const toggleActive = async (office: Office) => {
    try {
      await api.admin.updateOffice(office.id, { isActive: !office.isActive });
      toast(office.isActive ? 'Офис деактивирован' : 'Офис активирован', 'success');
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    }
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
        Привязка арендатора к офису доступна только администратору — при создании, редактировании или прямо в таблице.
      </p>

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
                  <div className="space-y-3">
                    <div>
                      <label className="label">Название БЦ *</label>
                      <input className="input" value={bcName} onChange={(e) => setBcName(e.target.value)} required />
                    </div>
                    <div>
                      <label className="label">Адрес</label>
                      <input className="input" value={bcAddress} onChange={(e) => setBcAddress(e.target.value)} />
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
                      <div className="text-xs text-[var(--muted)] mt-1">{bc.officesCount} офисов</div>
                    </div>
                    <button type="button" className="btn btn-secondary text-sm" onClick={() => startBcEdit(bc)}>
                      <Pencil className="w-4 h-4" />
                      Изменить
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-[var(--muted)]">{offices.length} офисов в реестре</div>
        {!showForm && !editingId && businessCenters.length > 0 && (
          <button className="btn btn-primary text-sm" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" />
            Добавить офис
          </button>
        )}
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

          <div className="border border-[var(--border)] rounded-lg p-4 bg-slate-50/50">
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
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-slate-50">
                <th className="text-left p-3 font-medium">БЦ</th>
                <th className="text-left p-3 font-medium">Офис</th>
                <th className="text-left p-3 font-medium">Этаж</th>
                <th className="text-left p-3 font-medium hidden sm:table-cell">Площадь</th>
                <th className="text-left p-3 font-medium">Компания</th>
                <th className="text-left p-3 font-medium min-w-[200px]">Привязка</th>
                <th className="text-left p-3 font-medium">Статус</th>
                <th className="p-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {offices.map((office) => (
                <tr key={office.id} className={`border-b border-[var(--border)] last:border-0 ${!office.isActive ? 'opacity-50' : ''}`}>
                  <td className="p-3">{office.businessCenterName || '—'}</td>
                  <td className="p-3 font-mono font-medium">{office.number}</td>
                  <td className="p-3">{office.floor}</td>
                  <td className="p-3 hidden sm:table-cell">{office.areaSqm ? `${office.areaSqm} м²` : '—'}</td>
                  <td className="p-3">{office.company || '—'}</td>
                  <td className="p-3">
                    {bindingOfficeId === office.id ? (
                      <div className="space-y-2 min-w-[220px]">
                        <BindingSelect office={office} />
                        <div className="flex gap-1">
                          <button className="btn btn-primary text-xs py-1 px-2" disabled={saving} onClick={() => saveBinding(office.id)}>
                            {saving ? '...' : 'Сохранить'}
                          </button>
                          <button className="btn btn-secondary text-xs py-1 px-2" onClick={resetForm}>Отмена</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={office.tenantName ? '' : 'text-[var(--muted)]'}>
                          {office.tenantName || 'Не назначен'}
                        </span>
                        <button
                          className="text-xs text-[var(--primary)] hover:underline"
                          onClick={() => startBinding(office)}
                        >
                          Изменить
                        </button>
                      </div>
                    )}
                  </td>
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