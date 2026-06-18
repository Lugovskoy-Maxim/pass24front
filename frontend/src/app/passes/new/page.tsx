'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { useAuth } from '@/lib/auth';
import { api, PassType, TYPE_LABELS } from '@/lib/api';

export default function NewPassPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [passType, setPassType] = useState<PassType>('guest');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10));
  const [visitTimeFrom, setVisitTimeFrom] = useState('10:00');
  const [visitTimeTo, setVisitTimeTo] = useState('20:00');
  const [apartment, setApartment] = useState('');
  const [building, setBuilding] = useState('');
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (user) {
      if (!apartment && user.apartment) setApartment(user.apartment);
      if (!building && user.building) setBuilding(user.building);
    }
  }, [user, apartment, building]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (visitTimeFrom && visitTimeTo && visitTimeFrom >= visitTimeTo) {
      setError('Время «С» должно быть раньше времени «До»');
      return;
    }

    if (passType === 'vehicle' && !vehiclePlate.trim()) {
      setError('Укажите гос. номер автомобиля');
      return;
    }

    setLoading(true);
    try {
      await api.createPass({
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim() || undefined,
        passType,
        vehiclePlate: passType === 'vehicle' ? vehiclePlate.trim().toUpperCase() : undefined,
        vehicleModel: passType === 'vehicle' ? vehicleModel.trim() || undefined : undefined,
        visitDate,
        visitTimeFrom,
        visitTimeTo,
        apartment: apartment.trim(),
        building: building.trim() || undefined,
        comment: comment.trim() || undefined,
      });
      router.push('/passes');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedLayout roles={['resident', 'admin']}>
      <h1 className="text-2xl font-bold mb-6">Заказ пропуска</h1>

      <form onSubmit={handleSubmit} className="card p-6 max-w-xl space-y-5">
        <div>
          <label className="label">Тип пропуска</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.entries(TYPE_LABELS) as [PassType, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`py-2 px-3 text-sm rounded-lg border transition-colors ${
                  passType === key
                    ? 'border-[var(--primary)] bg-blue-50 text-[var(--primary)] font-medium'
                    : 'border-[var(--border)] hover:bg-slate-50'
                }`}
                onClick={() => setPassType(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Имя гостя / организация *</label>
          <input className="input" value={guestName} onChange={(e) => setGuestName(e.target.value)} required />
        </div>

        <div>
          <label className="label">Телефон</label>
          <input className="input" type="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="+7 900 000-00-00" />
        </div>

        {passType === 'vehicle' && (
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
            <label className="label">Квартира *</label>
            <input className="input" value={apartment} onChange={(e) => setApartment(e.target.value)} required />
          </div>
          <div>
            <label className="label">Корпус</label>
            <input className="input" value={building} onChange={(e) => setBuilding(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Комментарий</label>
          <textarea
            className="input min-h-[80px] resize-y"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Дополнительная информация для охраны"
          />
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</div>}

        <div className="flex gap-3">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Отправка...' : 'Отправить заявку'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => router.back()}>
            Отмена
          </button>
        </div>
      </form>
    </ProtectedLayout>
  );
}