'use client';

import { useState, useEffect, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { useAuth } from '@/lib/auth';
import { useConfig } from '@/hooks/useConfig';
import { useToast } from '@/components/Toast';
import { api, PassType, TYPE_LABELS, getErrorMessage } from '@/lib/api';
import { FormErrorBanner, FormField, FormInput, FormSelect, FormTextarea } from '@/components/FormField';
import { FieldErrors, hasFieldErrors, validateNewPassForm } from '@/lib/form-validation';
import { getLocalDateString } from '@/lib/local-date';
import { getVisitorNameLabel } from '@/lib/person-name';

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
  const [companyName, setCompanyName] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const enabledTypes = (Object.keys(TYPE_LABELS) as PassType[]).filter(
    (key) => !user?.enabledPassTypes?.length || user.enabledPassTypes.includes(key),
  );
  const [passType, setPassType] = useState<PassType>(enabledTypes[0] || 'visitor');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const todayLocal = getLocalDateString();
  const [visitDate, setVisitDate] = useState(todayLocal);
  const [visitTimeFrom, setVisitTimeFrom] = useState('09:00');
  const [visitTimeTo, setVisitTimeTo] = useState('18:00');
  const [officeId, setOfficeId] = useState('');
  const [office, setOffice] = useState('');
  const [floor, setFloor] = useState('');
  const [comment, setComment] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');

  const tenantOffices = user?.offices || [];
  const bcOptions = [...new Map(
    tenantOffices.map((o) => [o.propertyId, o.businessCenterName || 'Бизнес-центр']),
  ).entries()].map(([id, name]) => ({ id, name }));
  const officesInBc = propertyId
    ? tenantOffices.filter((o) => o.propertyId === propertyId)
    : tenantOffices;

  useEffect(() => {
    if (enabledTypes.length && !enabledTypes.includes(passType)) {
      setPassType(enabledTypes[0]);
    }
  }, [enabledTypes, passType]);

  useEffect(() => {
    if (!user) return;
    if (!companyName && user.company) setCompanyName(user.company);
    if (bcOptions.length === 1 && !propertyId) {
      setPropertyId(bcOptions[0].id);
    }
    if (tenantOffices.length === 1 && !officeId) {
      const o = tenantOffices[0];
      setPropertyId(o.propertyId);
      setOfficeId(o.id);
      setOffice(o.number);
      setFloor(o.floor);
    } else if (!officeId && user.office) {
      setOffice(user.office);
      setFloor(user.floor || '');
    }
  }, [user, tenantOffices, officeId, companyName, bcOptions, propertyId]);

  useEffect(() => {
    if (!templateId) return;
    api.getPassTemplate(templateId)
      .then(({ template }) => {
        setVisitorName(template.visitorName);
        setVisitorPhone(template.visitorPhone || '');
        setCompanyName(template.companyName || user?.company || '');
        if (enabledTypes.includes(template.passType)) setPassType(template.passType);
        setVehiclePlate(template.vehiclePlate || '');
        setVehicleModel(template.vehicleModel || '');
        setVisitTimeFrom(template.visitTimeFrom || '09:00');
        setVisitTimeTo(template.visitTimeTo || '18:00');
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
      })
      .catch((err) => toast(getErrorMessage(err, 'Шаблон не найден'), 'error'));
  }, [templateId]);

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
      if (!companyName && selected.company) setCompanyName(selected.company);
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
      passType,
      vehiclePlate,
      visitTimeFrom,
      visitTimeTo,
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
        companyName: companyName.trim() || undefined,
        passType,
        vehiclePlate: passType === 'parking' ? vehiclePlate.trim().toUpperCase() : undefined,
        vehicleModel: passType === 'parking' ? vehicleModel.trim() || undefined : undefined,
        visitDate,
        visitTimeFrom,
        visitTimeTo,
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

  return (
    <ProtectedLayout permissions={['passes.create']}>
      <h1 className="page-title mb-2">{templateId ? 'Заказ по шаблону' : 'Заказ пропуска'}</h1>
      {config && (
        <p className="text-sm text-[var(--muted)] mb-6">
          Рабочие часы БЦ: {config.workingHoursFrom}–{config.workingHoursTo}
          {config.maxPassesPerDay > 0 && ` · лимит ${config.maxPassesPerDay} пропусков/день`}
        </p>
      )}

      <form onSubmit={handleSubmit} className="card p-6 max-w-xl space-y-5" noValidate>
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

        <FormField id="visitorName" label={getVisitorNameLabel(passType)} required error={fieldErrors.visitorName}>
          <FormInput
            id="visitorName"
            value={visitorName}
            onChange={(e) => { setVisitorName(e.target.value); clearFieldError('visitorName'); }}
            invalid={!!fieldErrors.visitorName}
          />
        </FormField>

        <div className="form-grid-2">
          <FormField id="companyName" label="Компания посетителя">
            <FormInput
              id="companyName"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder={user?.company || 'ООО «...»'}
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
        </div>

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

        <div className="form-grid-3">
          <FormField id="visitDate" label="Дата визита" required error={fieldErrors.visitDate}>
            <FormInput
              id="visitDate"
              type="date"
              value={visitDate}
              min={todayLocal}
              onChange={(e) => {
                setVisitDate(e.target.value);
                clearFieldError('visitDate');
              }}
              invalid={!!fieldErrors.visitDate}
            />
          </FormField>
          <FormField id="visitTimeFrom" label="С" error={fieldErrors.visitTimeFrom}>
            <FormInput
              id="visitTimeFrom"
              type="time"
              value={visitTimeFrom}
              onChange={(e) => { setVisitTimeFrom(e.target.value); clearFieldError('visitTimeFrom'); clearFieldError('visitTimeTo'); }}
              invalid={!!fieldErrors.visitTimeFrom}
            />
          </FormField>
          <FormField id="visitTimeTo" label="До" error={fieldErrors.visitTimeTo}>
            <FormInput
              id="visitTimeTo"
              type="time"
              value={visitTimeTo}
              onChange={(e) => { setVisitTimeTo(e.target.value); clearFieldError('visitTimeFrom'); clearFieldError('visitTimeTo'); }}
              invalid={!!fieldErrors.visitTimeTo}
            />
          </FormField>
        </div>

        {tenantOffices.length > 0 ? (
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
            <div className="form-grid-2">
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
              </FormField>
              <FormField id="floor" label="Этаж">
                <FormInput id="floor" value={floor} readOnly placeholder="—" />
              </FormField>
            </div>
            {bcOptions.length === 1 && (
              <p className="text-xs text-[var(--muted)]">БЦ: {bcOptions[0].name}</p>
            )}
          </div>
        ) : (
          <div className="form-grid-2">
            <FormField id="office" label="Офис (куда)" required error={fieldErrors.office}>
              <FormInput
                id="office"
                value={office}
                onChange={(e) => { setOffice(e.target.value); clearFieldError('office'); }}
                invalid={!!fieldErrors.office}
                placeholder="401"
              />
            </FormField>
            <FormField id="floorManual" label="Этаж">
              <FormInput id="floorManual" value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="4" />
            </FormField>
          </div>
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