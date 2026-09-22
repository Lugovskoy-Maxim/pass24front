'use client';
import { FormEvent, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { AdminModal } from './AdminModal';
import {
  Booking,
  Catalog,
  clock,
  command,
  minutes,
  money,
  operations,
  paymentLabels,
  Segment,
} from '@/lib/operations';
import { getErrorMessage } from '@/lib/api';
import { useToast } from './Toast';

export function BookingEditor({
  open,
  onClose,
  onSaved,
  booking,
  block = false,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  booking?: Booking;
  block?: boolean;
}) {
  const { toast } = useToast();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [room, setRoom] = useState(booking?.room_id || 0);
  const [segments, setSegments] = useState<Segment[]>(
    booking?.segments || [
      {
        date: new Date().toLocaleDateString('en-CA', {
          timeZone: 'Europe/Moscow',
        }),
        start_minute: 600,
        end_minute: 660,
      },
    ],
  );
  const [search, setSearch] = useState('');
  const [profiles, setProfiles] = useState<
    Array<{
      profile_id: string;
      label: string;
      owner_subject: string;
      owner_name: string;
    }>
  >([]);
  const [profile, setProfile] = useState(booking?.profile_id || '');
  const [party, setParty] = useState('resident');
  const [guest, setGuest] = useState({ name: '', phone: '', email: '' });
  const [method, setMethod] = useState(booking?.payment_method || 'cash');
  const [hours, setHours] = useState(booking?.writeoff_min || 0);
  const [services, setServices] = useState<Record<number, number>>(
    Object.fromEntries(
      booking?.services.map((s) => [s.service_id, s.quantity]) || [],
    ),
  );
  const [comment, setComment] = useState(booking?.comment_client || '');
  const [reason, setReason] = useState('');
  const [quote, setQuote] = useState<{
    total_amount_minor: number;
    pricing_fingerprint: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open)
      void operations
        .catalog()
        .then(setCatalog)
        .catch((e) => setError(getErrorMessage(e)));
  }, [open]);
  useEffect(() => {
    if (!open || booking || block) return;
    let current = true;
    const timer = setTimeout(() => {
      void operations
        .profiles(search)
        .then((data) => {
          if (current) setProfiles(data.items);
        })
        .catch((e) => {
          if (current) setError(getErrorMessage(e));
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [search, open, booking, block]);
  const input = () => ({
    ...(party === 'guest' && !booking ? { guest } : {}),
    room_id: Number(room),
    profile_id: profile,
    segments,
    payment_method: method,
    writeoff_min: Number(hours),
    services: Object.entries(services)
      .filter(([, qty]) => qty > 0)
      .map(([id, quantity]) => ({ service_id: Number(id), quantity })),
    comment_client: comment,
    ...(booking ? { revision: booking.revision } : {}),
    ...(block ? { reason } : {}),
  });
  const calculate = async () => {
    setBusy(true);
    setError('');
    try {
      setQuote(await command('/admin/booking-requests/quote', input()));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await command(
        booking
          ? '/admin/booking-requests/' + booking.id
          : block
            ? '/admin/booking-requests/blocks'
            : '/admin/booking-requests',
        {
          ...input(),
          ...(quote ? { pricing_fingerprint: quote.pricing_fingerprint } : {}),
        },
        booking ? 'PATCH' : 'POST',
      );
      toast(
        block
          ? 'Время заблокировано'
          : booking
            ? 'Бронирование сохранено'
            : 'Заявка создана',
        'success',
      );
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AdminModal
      open={open}
      onClose={onClose}
      wide
      title={
        block
          ? 'Заблокировать время'
          : booking
            ? `Изменить ${booking.number}`
            : 'Новая заявка'
      }
    >
      <form
        onSubmit={save}
        className="space-y-4"
        onChange={() => setQuote(null)}
      >
        {error && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
        <label className="block text-sm">
          Помещение
          <select
            required
            className="input mt-1"
            value={room}
            onChange={(e) => setRoom(Number(e.target.value))}
          >
            <option value="0">Выберите помещение</option>
            {catalog?.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title} · {r.business_center?.name} · {r.config.price_label}
              </option>
            ))}
          </select>
        </label>
        {!booking && !block && (
          <label className="block text-sm">
            Заказчик
            <select
              className="input mt-1"
              value={party}
              onChange={(e) => {
                setParty(e.target.value);
                setProfile('');
                setHours(0);
              }}
            >
              <option value="resident">Резидент</option>
              <option value="guest">Гость</option>
            </select>
          </label>
        )}
        {!booking && !block && party === 'guest' && (
          <div className="space-y-2">
            {(['name', 'phone', 'email'] as const).map((field) => (
              <label key={field} className="block text-sm">
                {{ name: 'ФИО гостя', phone: 'Телефон', email: 'Email' }[field]}
                <input
                  className="input mt-1"
                  required={field !== 'email'}
                  value={guest[field]}
                  onChange={(e) =>
                    setGuest((g) => ({ ...g, [field]: e.target.value }))
                  }
                />
              </label>
            ))}
          </div>
        )}
        {!booking && !block && party === 'resident' && (
          <fieldset className="space-y-2">
            <legend className="text-sm mb-1">Резидент</legend>
            <input
              aria-label="Поиск резидента"
              className="input"
              placeholder="Найти по имени или названию профиля"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="Выбрать резидента"
              required
              className="input"
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
            >
              <option value="">Выберите заказчика</option>
              {profiles.map((p) => (
                <option key={p.profile_id} value={p.profile_id}>
                  {p.label} · {p.owner_name}
                </option>
              ))}
            </select>
          </fieldset>
        )}
        <fieldset className="space-y-2">
          <legend className="text-sm mb-2">Дата и время · Москва</legend>
          {segments.map((segment, i) => (
            <div
              key={i}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2"
            >
              <input
                aria-label="Дата"
                type="date"
                required
                className="input min-w-0"
                value={segment.date}
                onChange={(e) =>
                  setSegments((s) =>
                    s.map((v, j) =>
                      j === i ? { ...v, date: e.target.value } : v,
                    ),
                  )
                }
              />
              <input
                aria-label="Начало"
                type="time"
                required
                step={1800}
                className="input min-w-0"
                value={clock(segment.start_minute)}
                onChange={(e) =>
                  setSegments((s) =>
                    s.map((v, j) =>
                      j === i
                        ? { ...v, start_minute: minutes(e.target.value) }
                        : v,
                    ),
                  )
                }
              />
              <input
                aria-label="Окончание"
                type="time"
                required
                step={1800}
                className="input min-w-0"
                value={clock(segment.end_minute)}
                onChange={(e) =>
                  setSegments((s) =>
                    s.map((v, j) =>
                      j === i
                        ? { ...v, end_minute: minutes(e.target.value) }
                        : v,
                    ),
                  )
                }
              />
              <button
                type="button"
                aria-label="Удалить интервал"
                disabled={segments.length < 2}
                onClick={() => setSegments((s) => s.filter((_, j) => j !== i))}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-secondary text-sm"
            onClick={() => setSegments((s) => [...s, { ...s[s.length - 1] }])}
          >
            <Plus className="w-4 h-4" />
            Добавить интервал
          </button>
        </fieldset>
        {!block && (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="text-sm">
                Оплата
                <select
                  className="input mt-1"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  {Object.entries(paymentLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Списать резидентские часы, мин
                <input
                  type="number"
                  min="0"
                  step="30"
                  className="input mt-1"
                  value={hours}
                  onChange={(e) => setHours(Number(e.target.value))}
                />
              </label>
            </div>
            {!!catalog?.services.length && (
              <fieldset>
                <legend className="text-sm mb-2">Дополнительные услуги</legend>
                <div className="space-y-2 max-h-40 overflow-auto">
                  {catalog.services.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span>
                        {s.name} · {money(s.price_minor)}
                      </span>
                      <input
                        aria-label={`Количество: ${s.name}`}
                        className="input w-20"
                        type="number"
                        min="0"
                        max="1000"
                        value={services[s.id] || 0}
                        onChange={(e) =>
                          setServices((v) => ({
                            ...v,
                            [s.id]: Number(e.target.value),
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <label className="block text-sm">
              Комментарий
              <textarea
                className="input mt-1"
                value={comment}
                maxLength={5000}
                onChange={(e) => setComment(e.target.value)}
              />
            </label>
          </>
        )}
        {block && (
          <label className="block text-sm">
            Причина блокировки
            <textarea
              required
              className="input mt-1"
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        )}
        {!block && (
          <div className="flex justify-between items-center gap-3">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || !room}
              onClick={() => void calculate()}
            >
              Рассчитать
            </button>
            {quote && <strong>{money(quote.total_amount_minor)}</strong>}
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Закрыть
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={
              busy ||
              !room ||
              (!booking && !block && party === 'resident' && !profile)
            }
          >
            {busy ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </AdminModal>
  );
}
