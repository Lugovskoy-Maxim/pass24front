'use client';

import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { Plus, RefreshCw, Trash2, Car, User, Package, Wrench, Bookmark } from 'lucide-react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import {
  api, PassTemplate, PassType, TYPE_LABELS, CreatePassTemplateData, formatTenantOffices, VISIT_PURPOSES,
} from '@/lib/api';

const TYPE_ICONS: Record<PassType, typeof User> = {
  visitor: User,
  parking: Car,
  delivery: Package,
  contractor: Wrench,
};

const EMPTY_FORM: CreatePassTemplateData = {
  name: '',
  visitorName: '',
  visitorPhone: '',
  companyName: '',
  visitPurpose: 'Гость',
  passType: 'visitor',
  vehiclePlate: '',
  vehicleModel: '',
  visitTimeFrom: '09:00',
  visitTimeTo: '18:00',
  officeId: '',
  office: '',
  floor: '',
  comment: '',
};

export default function TemplatesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<PassTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreatePassTemplateData>(EMPTY_FORM);

  const tenantOffices = user?.offices || [];
  const enabledTypes = (Object.keys(TYPE_LABELS) as PassType[]).filter(
    (key) => !user?.enabledPassTypes?.length || user.enabledPassTypes.includes(key),
  );

  const load = () => {
    setLoading(true);
    api.getPassTemplates()
      .then(({ templates: data }) => setTemplates(data))
      .catch((err) => toast(err instanceof Error ? err.message : 'Ошибка загрузки', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!user || form.officeId || !tenantOffices.length) return;
    const office = tenantOffices[0];
    setForm((prev) => ({
      ...prev,
      officeId: office.id,
      office: office.number,
      floor: office.floor,
      companyName: prev.companyName || user.company || office.company || '',
    }));
  }, [user, tenantOffices, form.officeId]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { templates: data, imported } = await api.syncPassTemplates();
      setTemplates(data);
      toast(imported > 0 ? `Импортировано шаблонов: ${imported}` : 'Новых шаблонов из пропусков нет', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleOfficeSelect = (id: string) => {
    const selected = tenantOffices.find((o) => o.id === id);
    setForm((prev) => ({
      ...prev,
      officeId: id,
      office: selected?.number || '',
      floor: selected?.floor || '',
      companyName: prev.companyName || selected?.company || user?.company || '',
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.visitorName.trim()) {
      toast('Укажите название и ФИО посетителя', 'error');
      return;
    }
    if (form.passType === 'parking' && !form.vehiclePlate?.trim()) {
      toast('Укажите гос. номер для парковочного шаблона', 'error');
      return;
    }
    if (tenantOffices.length > 0 && !form.officeId) {
      toast('Выберите офис', 'error');
      return;
    }

    setSaving(true);
    try {
      await api.createPassTemplate({
        ...form,
        name: form.name.trim(),
        visitorName: form.visitorName.trim(),
        vehiclePlate: form.passType === 'parking' ? form.vehiclePlate?.trim().toUpperCase() : undefined,
        officeId: form.officeId || undefined,
      });
      toast('Шаблон сохранён', 'success');
      setShowForm(false);
      setForm({ ...EMPTY_FORM, companyName: user?.company || '' });
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить шаблон?')) return;
    try {
      await api.deletePassTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast('Шаблон удалён', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка', 'error');
    }
  };

  return (
    <ProtectedLayout permissions={['passes.templates']}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Шаблоны пропусков</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Быстрый заказ на основе сохранённых посетителей
            {user?.offices?.length ? ` · ${formatTenantOffices(user.offices)}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary text-sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Импорт...' : 'Из старых пропусков'}
          </button>
          <button className="btn btn-primary text-sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="w-4 h-4" />
            Новый шаблон
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-6 mb-6 space-y-4">
          <h2 className="font-semibold">Создать шаблон вручную</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Название шаблона *</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Курьер СДЭК" required />
            </div>
            <div>
              <label className="label">ФИО посетителя *</label>
              <input className="input" value={form.visitorName} onChange={(e) => setForm({ ...form, visitorName: e.target.value })} required />
            </div>
          </div>

          <div>
            <label className="label">Тип пропуска</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {enabledTypes.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`py-2 px-3 text-sm rounded-lg border transition-colors ${
                    form.passType === key ? 'border-[var(--primary)] bg-blue-50 text-[var(--primary)] font-medium' : 'border-[var(--border)] hover:bg-slate-50'
                  }`}
                  onClick={() => setForm({ ...form, passType: key })}
                >
                  {TYPE_LABELS[key]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Компания посетителя</label>
              <input className="input" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
            </div>
            <div>
              <label className="label">Телефон</label>
              <input className="input" type="tel" value={form.visitorPhone} onChange={(e) => setForm({ ...form, visitorPhone: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="label">Цель визита</label>
            <select className="input" value={form.visitPurpose} onChange={(e) => setForm({ ...form, visitPurpose: e.target.value })}>
              {VISIT_PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {form.passType === 'parking' && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Гос. номер *</label>
                <input className="input font-mono" value={form.vehiclePlate} onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value })} required />
              </div>
              <div>
                <label className="label">Марка / модель</label>
                <input className="input" value={form.vehicleModel} onChange={(e) => setForm({ ...form, vehicleModel: e.target.value })} />
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Офис *</label>
              {tenantOffices.length > 0 ? (
                <select className="input" value={form.officeId} onChange={(e) => handleOfficeSelect(e.target.value)} required>
                  <option value="">Выберите офис</option>
                  {tenantOffices.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.businessCenterName ? `${o.businessCenterName} · ` : ''}офис {o.number}, эт. {o.floor}
                    </option>
                  ))}
                </select>
              ) : (
                <input className="input" value={form.office} onChange={(e) => setForm({ ...form, office: e.target.value })} required />
              )}
            </div>
            <div>
              <label className="label">С</label>
              <input className="input" type="time" value={form.visitTimeFrom} onChange={(e) => setForm({ ...form, visitTimeFrom: e.target.value })} />
            </div>
            <div>
              <label className="label">До</label>
              <input className="input" type="time" value={form.visitTimeTo} onChange={(e) => setForm({ ...form, visitTimeTo: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="label">Комментарий</label>
            <textarea className="input min-h-[60px]" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить шаблон'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Отмена</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="card p-8 text-center text-[var(--muted)]">Загрузка...</div>
      ) : templates.length === 0 ? (
        <div className="card p-8 text-center">
          <Bookmark className="w-10 h-10 text-[var(--muted)] mx-auto mb-3" />
          <p className="text-[var(--muted)] mb-4">Шаблонов пока нет. Создайте вручную или импортируйте из прошлых пропусков.</p>
          <button className="btn btn-secondary" onClick={handleSync} disabled={syncing}>Импортировать из пропусков</button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => {
            const Icon = TYPE_ICONS[template.passType];
            return (
              <div key={template.id} className="card p-4 flex flex-col">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-[var(--primary)]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{template.name}</div>
                    <div className="text-sm text-[var(--muted)] truncate">{template.visitorName}</div>
                    <div className="text-xs text-[var(--muted)] mt-0.5">
                      {template.source === 'from_pass' ? 'Из пропуска' : 'Создан вручную'}
                    </div>
                  </div>
                </div>

                <div className="text-sm text-[var(--muted)] space-y-1 mb-4 flex-1">
                  <div>{TYPE_LABELS[template.passType]}</div>
                  {template.businessCenterName && (
                    <div>{template.businessCenterName} · оф. {template.office}{template.floor && `, ${template.floor} эт.`}</div>
                  )}
                  {!template.businessCenterName && template.office && (
                    <div>оф. {template.office}{template.floor && `, ${template.floor} эт.`}</div>
                  )}
                  {template.visitPurpose && <div>Цель: {template.visitPurpose}</div>}
                  {template.vehiclePlate && <div className="font-mono">{template.vehiclePlate}</div>}
                </div>

                <div className="flex gap-2 pt-3 border-t border-[var(--border)]">
                  <Link href={`/passes/new?template=${template.id}`} className="btn btn-primary flex-1 text-sm">
                    Заказать
                  </Link>
                  <button className="btn btn-secondary p-2" onClick={() => handleDelete(template.id)} title="Удалить">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ProtectedLayout>
  );
}