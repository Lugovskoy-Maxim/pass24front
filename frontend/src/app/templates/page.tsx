'use client';

import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { Plus, RefreshCw, Trash2, Car, User, Package, Wrench, Bookmark } from 'lucide-react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import {
  api, PassTemplate, PassType, TYPE_LABELS, CreatePassTemplateData, formatTenantOffices, getErrorMessage,
} from '@/lib/api';
import { PageError } from '@/components/PageError';
import { FormErrorBanner, FormField, FormInput, FormSelect, FormTextarea } from '@/components/FormField';
import { FieldErrors, hasFieldErrors, validatePassTemplateForm } from '@/lib/form-validation';
import { getVisitorNameLabel } from '@/lib/person-name';

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
  const [loadError, setLoadError] = useState('');
  const [loadErrorCause, setLoadErrorCause] = useState<unknown>(null);
  const [syncing, setSyncing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [form, setForm] = useState<CreatePassTemplateData>(EMPTY_FORM);

  const tenantOffices = user?.offices || [];
  const enabledTypes = (Object.keys(TYPE_LABELS) as PassType[]).filter(
    (key) => !user?.enabledPassTypes?.length || user.enabledPassTypes.includes(key),
  );

  const load = () => {
    setLoading(true);
    setLoadError('');
    setLoadErrorCause(null);
    api.getPassTemplates()
      .then(({ templates: data }) => setTemplates(data))
      .catch((err) => {
        setLoadErrorCause(err);
        setLoadError(getErrorMessage(err, 'Ошибка загрузки'));
      })
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

  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const visitorLabel = getVisitorNameLabel(form.passType);
    const errors = validatePassTemplateForm({
      name: form.name,
      visitorName: form.visitorName,
      passType: form.passType,
      vehiclePlate: form.vehiclePlate,
      officeId: form.officeId || '',
      office: form.office || '',
      tenantHasOffices: tenantOffices.length > 0,
      visitorLabel,
    });
    setFieldErrors(errors);
    if (hasFieldErrors(errors)) return;

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
          <h1 className="page-title">Шаблоны пропусков</h1>
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

      {loadError && (
        <PageError
          className="mb-6"
          message={loadError}
          error={loadErrorCause}
          onRetry={load}
          retryLabel="Повторить"
        />
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-6 mb-6 space-y-4" noValidate>
          <h2 className="font-semibold">Создать шаблон вручную</h2>
          <div className="form-grid-2">
            <FormField id="templateName" label="Название шаблона" required error={fieldErrors.name}>
              <FormInput
                id="templateName"
                value={form.name}
                onChange={(e) => { setForm({ ...form, name: e.target.value }); clearFieldError('name'); }}
                invalid={!!fieldErrors.name}
                placeholder="Курьер СДЭК"
              />
            </FormField>
            <FormField id="templateVisitor" label={getVisitorNameLabel(form.passType)} required error={fieldErrors.visitorName}>
              <FormInput
                id="templateVisitor"
                value={form.visitorName}
                onChange={(e) => { setForm({ ...form, visitorName: e.target.value }); clearFieldError('visitorName'); }}
                invalid={!!fieldErrors.visitorName}
              />
            </FormField>
          </div>

          <div>
            <label className="label">Тип пропуска</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {enabledTypes.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`py-2 px-3 text-sm rounded-lg border transition-colors ${
                    form.passType === key ? 'border-[var(--status-approved-border)] bg-[var(--status-approved-soft)] text-[var(--status-approved)] font-medium' : 'border-[var(--border)] hover:bg-[var(--surface-muted)]'
                  }`}
                  onClick={() => setForm({ ...form, passType: key })}
                >
                  {TYPE_LABELS[key]}
                </button>
              ))}
            </div>
          </div>

          <div className="form-grid-2">
            <FormField id="templateCompany" label="Компания посетителя">
              <FormInput id="templateCompany" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
            </FormField>
            <FormField id="templatePhone" label="Телефон">
              <FormInput id="templatePhone" type="tel" value={form.visitorPhone} onChange={(e) => setForm({ ...form, visitorPhone: e.target.value })} />
            </FormField>
          </div>

          {form.passType === 'parking' && (
            <div className="form-grid-2">
              <FormField id="templatePlate" label="Гос. номер" required error={fieldErrors.vehiclePlate}>
                <FormInput
                  id="templatePlate"
                  mono
                  value={form.vehiclePlate}
                  onChange={(e) => { setForm({ ...form, vehiclePlate: e.target.value }); clearFieldError('vehiclePlate'); }}
                  invalid={!!fieldErrors.vehiclePlate}
                />
              </FormField>
              <FormField id="templateModel" label="Марка / модель">
                <FormInput id="templateModel" value={form.vehicleModel} onChange={(e) => setForm({ ...form, vehicleModel: e.target.value })} />
              </FormField>
            </div>
          )}

          <div className="form-grid-3">
            <FormField id="templateOffice" label="Офис" required error={fieldErrors.officeId || fieldErrors.office}>
              {tenantOffices.length > 0 ? (
                <FormSelect
                  id="templateOffice"
                  value={form.officeId}
                  onChange={(e) => { handleOfficeSelect(e.target.value); clearFieldError('officeId'); }}
                  invalid={!!fieldErrors.officeId}
                >
                  <option value="">Выберите офис</option>
                  {tenantOffices.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.businessCenterName ? `${o.businessCenterName} · ` : ''}офис {o.number}{o.floor ? `, ${o.floor} эт.` : ''}
                    </option>
                  ))}
                </FormSelect>
              ) : (
                <FormInput
                  id="templateOffice"
                  value={form.office}
                  onChange={(e) => { setForm({ ...form, office: e.target.value }); clearFieldError('office'); }}
                  invalid={!!fieldErrors.office}
                />
              )}
            </FormField>
            <FormField id="templateTimeFrom" label="С">
              <FormInput id="templateTimeFrom" type="time" value={form.visitTimeFrom} onChange={(e) => setForm({ ...form, visitTimeFrom: e.target.value })} />
            </FormField>
            <FormField id="templateTimeTo" label="До">
              <FormInput id="templateTimeTo" type="time" value={form.visitTimeTo} onChange={(e) => setForm({ ...form, visitTimeTo: e.target.value })} />
            </FormField>
          </div>

          <FormField id="templateComment" label="Комментарий">
            <FormTextarea id="templateComment" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
          </FormField>

          <FormErrorBanner message={formError} />

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
                  <div className="w-9 h-9 rounded bg-[var(--status-approved-soft)] flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-[var(--status-approved)]" />
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