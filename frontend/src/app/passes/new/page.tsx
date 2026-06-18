'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { useAuth } from '@/lib/auth';
import { useConfig } from '@/hooks/useConfig';
import { useToast } from '@/components/Toast';
import { api, PassType, TYPE_LABELS } from '@/lib/api';

const PURPOSES = ['Встреча', 'Переговоры', 'Собеседование', 'Доставка', 'Техобслуживание', 'Презентация', 'Другое'];

export default function NewPassPage() {
  const { user } = useAuth();
  const config = useConfig();
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [visitPurpose, setVisitPurpose] = useState('Встреча');
  const [passType, setPassType] = useState<PassType>('visitor');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10));
  const [visitTimeFrom, setVisitTimeFrom] = useState('09:00');
  const [visitTimeTo, setVisitTimeTo] = useState('18:00');
  const [office, setOffice] = useState('');
  const [floor, setFloor] = useState('');
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (user) {
      if (!office && user.office) setOffice(user.office);
      if (!floor && user.floor) setFloor(user.floor);
      if (!companyName && user.company) setCompanyName(user.company);
    }
  }, [user, office, floor, companyName]);

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

    setLoading(true);
    try {
      await api.createPass({
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
        office: office.trim(),
        floor: floor.trim() || undefined,
        comment: comment.trim() || undefined,
      });
      toast('Заявка отправлена', 'success');
      router.push('/passes');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedLayout roles={['tenant', 'admin']}>
      <h1 className="text-2xl font-bold mb-2">Заказ пропуска</h1>
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
            {(Object.entries(TYPE_LABELS) as [PassType, string][]).map(([key, label]) => (
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
            {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
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

        <div>
          <label className="label">Комментарий для ресепшн</label>
          <textarea className="input min-h-[80px] resize-y" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Дополнительная информация" />
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