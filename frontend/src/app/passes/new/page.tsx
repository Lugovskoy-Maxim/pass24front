'use client';

import { useState, useEffect, useMemo, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { PassTemplatesPicker } from '@/components/PassTemplatesPicker';
import { VisitDatePicker } from '@/components/VisitDatePicker';
import { useAuth } from '@/lib/auth';
import { useConfig } from '@/hooks/useConfig';
import { useToast } from '@/components/Toast';
import { api, PassTemplate, PassType, TYPE_LABELS, getErrorMessage } from '@/lib/api';
import { FormErrorBanner, FormField, FormInput, FormSelect, FormTextarea } from '@/components/FormField';
import { FieldErrors, hasFieldErrors, validateNewPassForm } from '@/lib/form-validation';
import { getBookableVisitDates, parseClosedWeekdays } from '@/lib/bookable-visit-dates';
import { getLocalDateString } from '@/lib/local-date';
import { getVisitorNameLabel } from '@/lib/person-name';
import { canOrderPasses, hasPermission, isTenantCompanyUser } from '@/lib/permissions';

function NewPassForm() {
  const { user } = useAuth();
  const config = useConfig();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get('template');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const enabledTypes = (Object.keys(TYPE_LABELS) as PassType[]).filter(
    (key) => !user?.enabledPassTypes?.length || user.enabledPassTypes.includes(key),
  );
  const [passType, setPassType] = useState<PassType>(enabledTypes[0] || 'visitor');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const todayLocal = getLocalDateString();
  const [visitDate, setVisitDate] = useState(todayLocal);
  const [officeId, setOfficeId] = useState('');
  const [office, setOffice] = useState('');
  const [floor, setFloor] = useState('');
  const [comment, setComment] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  const tenantOffices = user?.offices || [];
  const tenantCompanyUser = isTenantCompanyUser(user);
  const canUseTemplates = hasPermission(user, 'passes.templates');
  const bcOptions = [...new Map(
    tenantOffices.map((o) => [o.propertyId, o.businessCenterName || 'Бизнес-центр']),
  ).entries()].map(([id, name]) => ({ id, name }));
  const officesInBc = propertyId
    ? tenantOffices.filter((o) => o.propertyId === propertyId)
    : tenantOffices;

  const bcHoursById = useMemo(() => {
    const configById = new Map(config?.businessCenters?.map((bc) => [bc.id, bc]) || []);
    const map = new Map<string, { name: string; from: string; to: string }>();
    tenantOffices.forEach((o) => {
      if (!o.propertyId || map.has(o.propertyId)) return;
      const fromConfig = configById.get(o.propertyId);
      map.set(o.propertyId, {
        name: o.businessCenterName || fromConfig?.name || 'Бизнес-центр',
        from: o.workingHoursFrom || fromConfig?.workingHoursFrom || '08:00',
        to: o.workingHoursTo || fromConfig?.workingHoursTo || '20:00',
      });
    });
    config?.businessCenters?.forEach((bc) => {
      if (!map.has(bc.id)) {
        map.set(bc.id, { name: bc.name, from: bc.workingHoursFrom, to: bc.workingHoursTo });
      }
    });
    return map;
  }, [tenantOffices, config?.businessCenters]);

  const selectedBcId = propertyId
    || (officeId ? tenantOffices.find((o) => o.id === officeId)?.propertyId : undefined)
    || (bcOptions.length === 1 ? bcOptions[0].id : config?.businessCenters?.[0]?.id);

  const selectedOffice = officeId ? tenantOffices.find((o) => o.id === officeId) : undefined;
  const selectedOfficeHours = selectedOffice?.propertyId
    ? bcHoursById.get(selectedOffice.propertyId)
    : undefined;

  const closedWeekdays = useMemo(() => {
    if (selectedBcId) {
      const fromOffice = tenantOffices.find((o) => o.propertyId === selectedBcId)?.closedWeekdays;
      const fromConfig = config?.businessCenters?.find((bc) => bc.id === selectedBcId)?.closedWeekdays;
      return parseClosedWeekdays(fromOffice ?? fromConfig);
    }
    return parseClosedWeekdays();
  }, [selectedBcId, tenantOffices, config?.businessCenters]);

  const bookableDates = useMemo(
    () => getBookableVisitDates(todayLocal, closedWeekdays, 2),
    [todayLocal, closedWeekdays],
  );

  useEffect(() => {
    if (enabledTypes.length && !enabledTypes.includes(passType)) {
      setPassType(enabledTypes[0]);
    }
  }, [enabledTypes, passType]);

  useEffect(() => {
    if (!user) return;
    if (bcOptions.length === 1 && !propertyId) {
      setPropertyId(bcOptions[0].id);
    }
    if (tenantOffices.length === 1 && !officeId) {
      const o = tenantOffices[0];
      setPropertyId(o.propertyId);
      setOfficeId(o.id);
      setOffice(o.number);
      setFloor(o.floor);
    }
  }, [user, tenantOffices, officeId, bcOptions, propertyId]);

  useEffect(() => {
    if (!bookableDates.length) return;
    if (!bookableDates.includes(visitDate)) {
      setVisitDate(bookableDates[0]);
    }
  }, [bookableDates, visitDate]);

  const applyTemplate = (template: PassTemplate) => {
    setSelectedTemplateId(template.id);
    setVisitorName(template.visitorName);
    setVisitorPhone(template.visitorPhone || '');
    if (enabledTypes.includes(template.passType)) setPassType(template.passType);
    setVehiclePlate(template.vehiclePlate || '');
    setVehicleModel(template.vehicleModel || '');
    setComment(template.comment || '');
    if (template.officeId) {
      const matched = tenantOffices.find((o) => o.id === template.officeId);
      if (matched) setPropertyId(matched.propertyId);
      setOfficeId(template.officeId);
      setOffice(template.office || '');
      setFloor(template.floor || '');
    } else if (template.office) {
      setOffice(template.office);
      setFloor(template.floor || '');
    }
  };

  useEffect(() => {
    if (!templateId) return;
    api.getPassTemplate(templateId)
      .then(({ template }) => applyTemplate(template))
      .catch((err) => toast(getErrorMessage(err, 'Шаблон не найден'), 'error'));
  }, [templateId, tenantOffices, enabledTypes]);

  const handleBcSelect = (id: string) => {
    setPropertyId(id);
    setOfficeId('');
    setOffice('');
    setFloor('');
    const inBc = tenantOffices.filter((o) => o.propertyId === id);
    if (inBc.length === 1) handleOfficeSelect(inBc[0].id);
  };

  const handleOfficeSelect = (id: string) => {
    setOfficeId(id);
    const selected = tenantOffices.find((o) => o.id === id);
    if (selected) {
      setPropertyId(selected.propertyId);
      setOffice(selected.number);
      setFloor(selected.floor);
    }
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

    const errors = validateNewPassForm({
      visitorName,
      visitDate,
      bookableDates,
      passType,
      vehiclePlate,
      propertyId,
      officeId,
      office,
      sendEmail,
      recipientEmail,
      tenantHasOffices: tenantOffices.length > 0,
      tenantMultiBc: bcOptions.length > 1,
    });
    setFieldErrors(errors);
    if (hasFieldErrors(errors)) return;

    setLoading(true);
    try {
      const { pass, emailSent } = await api.createPass({
        visitorName: visitorName.trim(),
        visitorPhone: visitorPhone.trim() || undefined,
        companyName: user?.company || undefined,
        passType,
        vehiclePlate: passType === 'parking' ? vehiclePlate.trim().toUpperCase() : undefined,
        vehicleModel: passType === 'parking' ? vehicleModel.trim() || undefined : undefined,
        visitDate,
        officeId: officeId || undefined,
        office: office.trim() || undefined,
        floor: floor.trim() || undefined,
        comment: comment.trim() || undefined,
        sendEmail: sendEmail || undefined,
        recipientEmail: sendEmail ? recipientEmail.trim() : undefined,
      });
      toast(emailSent ? 'Заявка отправлена, пропуск выслан на почту' : 'Заявка отправлена', 'success');
      window.location.assign(`/ticket/${encodeURIComponent(pass.passNumber)}`);
      return;
    } catch (err) {
      const msg = getErrorMessage(err, 'Ошибка');
      setFormError(msg);
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (user && !canOrderPasses(user)) {
    return (
      <ProtectedLayout permissions={['passes.create']}>
        <h1 className="page-title mb-2">Заказ пропуска</h1>
        <div className="card p-6 max-w-xl space-y-4 border-[var(--alert-border)] bg-[var(--alert-surface-subtle)]">
          <p className="text-[var(--alert-text)]">
            Заказ пропусков недоступен: офис не назначен. Дождитесь подтверждения регистрации и назначения офиса администратором.
          </p>
          <button type="button" className="btn btn-secondary" onClick={() => router.back()}>Назад</button>
        </div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout permissions={['passes.create']}>
      <h1 className="page-title mb-2">
        {selectedTemplateId || templateId ? 'Заказ по шаблону' : 'Заказ пропуска'}
      </h1>
      {canUseTemplates && (
        <PassTemplatesPicker
          enabledTypes={enabledTypes}
          selectedId={selectedTemplateId || templateId}
          onSelect={applyTemplate}
        />
      )}
      <form onSubmit={handleSubmit} className="card p-6 max-w-xl space-y-5" noValidate>
        {enabledTypes.length > 1 && (
          <div>
            <label className="label">Тип пропуска</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.entries(TYPE_LABELS) as [PassType, string][])
                .filter(([key]) => !user?.enabledPassTypes?.length || user.enabledPassTypes.includes(key))
                .map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`py-2 px-3 text-sm rounded-lg border transition-colors ${
                    passType === key ? 'border-[var(--status-approved-border)] bg-[var(--status-approved-soft)] text-[var(--status-approved)] font-medium' : 'border-[var(--border)] hover:bg-[var(--surface-muted)]'
                  }`}
                  onClick={() => setPassType(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <FormField id="visitorName" label={getVisitorNameLabel(passType)} required error={fieldErrors.visitorName}>
          <FormInput
            id="visitorName"
            value={visitorName}
            onChange={(e) => { setVisitorName(e.target.value); clearFieldError('visitorName'); }}
            invalid={!!fieldErrors.visitorName}
          />
        </FormField>

        <FormField id="visitorPhone" label="Телефон">
          <FormInput
            id="visitorPhone"
            type="tel"
            value={visitorPhone}
            onChange={(e) => setVisitorPhone(e.target.value)}
            placeholder="+7 900 000-00-00"
          />
        </FormField>

        {passType === 'parking' && (
          <div className="form-grid-2">
            <FormField id="vehiclePlate" label="Гос. номер" required error={fieldErrors.vehiclePlate}>
              <FormInput
                id="vehiclePlate"
                mono
                value={vehiclePlate}
                onChange={(e) => { setVehiclePlate(e.target.value); clearFieldError('vehiclePlate'); }}
                invalid={!!fieldErrors.vehiclePlate}
                placeholder="А123ВС777"
              />
            </FormField>
            <FormField id="vehicleModel" label="Марка / модель">
              <FormInput id="vehicleModel" value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} />
            </FormField>
          </div>
        )}

        <FormField
          id="visitDate"
          label="Дата визита"
          required
          error={fieldErrors.visitDate}
          hint="Доступны только ближайшие рабочие дни с учётом выходных БЦ"
        >
          <VisitDatePicker
            value={visitDate}
            bookableDates={bookableDates}
            onChange={(date) => {
              setVisitDate(date);
              clearFieldError('visitDate');
            }}
            invalid={!!fieldErrors.visitDate}
          />
        </FormField>

        {tenantCompanyUser || tenantOffices.length > 0 ? (
          <div className="space-y-3">
            {bcOptions.length > 1 && (
              <FormField id="propertyId" label="Бизнес-центр" required error={fieldErrors.propertyId}>
                <FormSelect
                  id="propertyId"
                  value={propertyId}
                  onChange={(e) => { handleBcSelect(e.target.value); clearFieldError('propertyId'); }}
                  invalid={!!fieldErrors.propertyId}
                >
                  <option value="">Выберите БЦ</option>
                  {bcOptions.map((bc) => (
                    <option key={bc.id} value={bc.id}>{bc.name}</option>
                  ))}
                </FormSelect>
              </FormField>
            )}
            <FormField id="officeId" label="Офис (куда)" required error={fieldErrors.officeId}>
              <FormSelect
                id="officeId"
                value={officeId}
                onChange={(e) => { handleOfficeSelect(e.target.value); clearFieldError('officeId'); }}
                invalid={!!fieldErrors.officeId}
                disabled={bcOptions.length > 1 && !propertyId}
              >
                <option value="">Выберите офис</option>
                {officesInBc.map((o) => (
                  <option key={o.id} value={o.id}>офис {o.number}</option>
                ))}
              </FormSelect>
              {selectedOfficeHours && (
                <p className="text-xs text-[var(--muted)] mt-2">
                  Рабочие часы {selectedOfficeHours.name}: {selectedOfficeHours.from}–{selectedOfficeHours.to}
                </p>
              )}
            </FormField>
            {bcOptions.length === 1 && (
              <p className="text-xs text-[var(--muted)]">БЦ: {bcOptions[0].name}</p>
            )}
          </div>
        ) : (
          <FormField id="office" label="Офис (куда)" required error={fieldErrors.office}>
            <FormInput
              id="office"
              value={office}
              onChange={(e) => { setOffice(e.target.value); clearFieldError('office'); }}
              invalid={!!fieldErrors.office}
              placeholder="401"
            />
          </FormField>
        )}

        <FormField id="comment" label="Комментарий для ресепшн">
          <FormTextarea
            id="comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Дополнительная информация"
          />
        </FormField>

        <div className="border border-[var(--border)] rounded-lg p-4 bg-[var(--surface-muted)] space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
            />
            <span className="text-sm font-medium">Отправить пропуск на email</span>
          </label>
          {sendEmail && (
            <FormField
              id="recipientEmail"
              label="Email получателя"
              required
              error={fieldErrors.recipientEmail}
              hint="На почту придёт ссылка на пропуск с QR-кодом"
            >
              <FormInput
                id="recipientEmail"
                type="email"
                value={recipientEmail}
                onChange={(e) => { setRecipientEmail(e.target.value); clearFieldError('recipientEmail'); }}
                invalid={!!fieldErrors.recipientEmail}
                placeholder="visitor@example.com"
              />
            </FormField>
          )}
        </div>

        <FormErrorBanner message={formError} />

        <div className="flex gap-3">
          <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Отправка...' : 'Отправить заявку'}</button>
          <button type="button" className="btn btn-secondary" onClick={() => router.back()}>Отмена</button>
        </div>
      </form>
    </ProtectedLayout>
  );
}

export default function NewPassPage() {
  return (
    <Suspense fallback={<ProtectedLayout permissions={['passes.create']}><div className="animate-pulse text-[var(--muted)]">Загрузка...</div></ProtectedLayout>}>
      <NewPassForm />
    </Suspense>
  );
}