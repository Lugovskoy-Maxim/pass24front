'use client';

import { useState, useEffect, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { useAuth } from '@/lib/auth';
import { useConfig } from '@/hooks/useConfig';
import { useToast } from '@/components/Toast';
import { api, PassType, TYPE_LABELS, VISIT_PURPOSES } from '@/lib/api';

function NewPassForm() {
  const { user } = useAuth();
  const config = useConfig();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get('template');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [visitPurpose, setVisitPurpose] = useState('Гость');
  const [propertyId, setPropertyId] = useState('');
  const enabledTypes = (Object.keys(TYPE_LABELS) as PassType[]).filter(
    (key) => !user?.enabledPassTypes?.length || user.enabledPassTypes.includes(key),
  );
  const [passType, setPassType] = useState<PassType>(enabledTypes[0] || 'visitor');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10));
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
        setVisitPurpose(template.visitPurpose || 'Гость');
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
      .catch((err) => toast(err instanceof Error ? err.message : 'Шаблон не найден', 'error'));
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (visitTimeFrom && visitTimeTo && visitTimeFrom >= visitTimeTo) {
      setError('Время «С» должно быть раньше времени «До»');
      return;
    }
    if (passType === 'parking' && !vehiclePlate.trim()) {
      setError('Укажите гос. номер для парковочного пропуска');
      return;
    }
    if (user?.role === 'tenant' && tenantOffices.length > 0) {
      if (!propertyId) {
        setError('Выберите бизнес-центр');
        return;
      }
      if (!officeId) {
        setError('Выберите офис из списка');
        return;
      }
    }
    if (!officeId && !office.trim()) {
      setError('Укажите офис назначения');
      return;
    }
    if (sendEmail && !recipientEmail.trim()) {
      setError('Укажите email для отправки пропуска');
      return;
    }

    setLoading(true);
    try {
      const { pass, emailSent } = await api.createPass({
        visitorName: visitorName.trim(),
        visitorPhone: visitorPhone.trim() || undefined,
        companyName: companyName.trim() || undefined,
        visitPurpose: visitPurpose.trim() || undefined,
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
      const msg = err instanceof Error ? err.message : 'Ошибка';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedLayout permissions={['passes.create']}>
      <h1 className="text-2xl font-bold mb-2">{templateId ? 'Заказ по шаблону' : 'Заказ пропуска'}</h1>
      {config && (
        <p className="text-sm text-[var(--muted)] mb-6">
          Рабочие часы БЦ: {config.workingHoursFrom}–{config.workingHoursTo}
          {config.maxPassesPerDay > 0 && ` · лимит ${config.maxPassesPerDay} пропусков/день`}
        </p>
      )}

      <form onSubmit={handleSubmit} className="card p-6 max-w-xl space-y-5">
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
                  passType === key ? 'border-[var(--primary)] bg-blue-50 text-[var(--primary)] font-medium' : 'border-[var(--border)] hover:bg-slate-50'
                }`}
                onClick={() => setPassType(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">ФИО посетителя *</label>
          <input className="input" value={visitorName} onChange={(e) => setVisitorName(e.target.value)} required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Компания посетителя</label>
            <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={user?.company || 'ООО «...»'} />
          </div>
          <div>
            <label className="label">Телефон</label>
            <input className="input" type="tel" value={visitorPhone} onChange={(e) => setVisitorPhone(e.target.value)} placeholder="+7 900 000-00-00" />
          </div>
        </div>

        <div>
          <label className="label">Цель визита</label>
          <select className="input" value={visitPurpose} onChange={(e) => setVisitPurpose(e.target.value)}>
            {VISIT_PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {passType === 'parking' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Гос. номер *</label>
              <input className="input font-mono" value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} required placeholder="А123ВС777" />
            </div>
            <div>
              <label className="label">Марка / модель</label>
              <input className="input" value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Дата визита *</label>
            <input className="input" type="date" value={visitDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setVisitDate(e.target.value)} required />
          </div>
          <div>
            <label className="label">С</label>
            <input className="input" type="time" value={visitTimeFrom} onChange={(e) => setVisitTimeFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">До</label>
            <input className="input" type="time" value={visitTimeTo} onChange={(e) => setVisitTimeTo(e.target.value)} />
          </div>
        </div>

        {tenantOffices.length > 0 ? (
          <div className="space-y-3">
            {bcOptions.length > 1 && (
              <div>
                <label className="label">Бизнес-центр *</label>
                <select className="input" value={propertyId} onChange={(e) => handleBcSelect(e.target.value)} required>
                  <option value="">Выберите БЦ</option>
                  {bcOptions.map((bc) => (
                    <option key={bc.id} value={bc.id}>{bc.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Офис (куда) *</label>
                <select
                  className="input"
                  value={officeId}
                  onChange={(e) => handleOfficeSelect(e.target.value)}
                  required
                  disabled={bcOptions.length > 1 && !propertyId}
                >
                  <option value="">Выберите офис</option>
                  {officesInBc.map((o) => (
                    <option key={o.id} value={o.id}>офис {o.number}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Этаж</label>
                <input className="input" value={floor} readOnly placeholder="—" />
              </div>
            </div>
            {bcOptions.length === 1 && (
              <p className="text-xs text-[var(--muted)]">БЦ: {bcOptions[0].name}</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Офис (куда) *</label>
              <input className="input" value={office} onChange={(e) => setOffice(e.target.value)} required placeholder="401" />
            </div>
            <div>
              <label className="label">Этаж</label>
              <input className="input" value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="4" />
            </div>
          </div>
        )}

        <div>
          <label className="label">Комментарий для ресепшн</label>
          <textarea className="input min-h-[80px] resize-y" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Дополнительная информация" />
        </div>

        <div className="border border-[var(--border)] rounded-lg p-4 bg-slate-50/50 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
            />
            <span className="text-sm font-medium">Отправить пропуск на email</span>
          </label>
          {sendEmail && (
            <div>
              <label className="label">Email получателя *</label>
              <input
                className="input"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="visitor@example.com"
                required
              />
              <p className="text-xs text-[var(--muted)] mt-1">
                На почту придёт ссылка на пропуск с QR-кодом
              </p>
            </div>
          )}
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</div>}

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