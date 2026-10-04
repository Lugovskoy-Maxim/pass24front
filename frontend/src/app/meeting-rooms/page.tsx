'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { useAuth } from '@/lib/auth';
import { getErrorMessage, getErrorStatus } from '@/lib/api';
import {
  BookingContext,
  BookingDraft,
  BookingQuote,
  officeBookings,
  officeMoney,
} from '@/lib/office-services';
const timeLabel = (n: number) =>
  `${Math.floor(n / 60)
    .toString()
    .padStart(2, '0')}:${(n % 60).toString().padStart(2, '0')}`;
export default function MeetingRoomsPage() {
  const { user } = useAuth();
  const offices = useMemo(() => user?.offices || [], [user?.offices]);
  const [officeId, setOfficeId] = useState('');
  const [context, setContext] = useState<BookingContext | null>(null);
  const [roomId, setRoomId] = useState(0);
  const [date, setDate] = useState(
    new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' }),
  );
  const [slots, setSlots] = useState<
    { start_minute: number; end_minute: number; state: string }[]
  >([]);
  const [start, setStart] = useState(-1);
  const [end, setEnd] = useState(-1);
  const [useHours, setUseHours] = useState(false);
  const [comment, setComment] = useState('');
  const [quote, setQuote] = useState<BookingQuote | null>(null);
  const [quoteKey, setQuoteKey] = useState('');
  const quoteRequest = useRef(0);
  const [contextLoading, setContextLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState('');
  const [commandKey, setCommandKey] = useState('');
  useEffect(() => {
    if (offices.length && !officeId) {
      const preferred = new URLSearchParams(window.location.search).get(
        'officeId',
      );
      setOfficeId(offices.find((o) => o.id === preferred)?.id || offices[0].id);
    }
  }, [offices, officeId]);
  useEffect(() => {
    if (!officeId) return;
    let active = true;
    setContextLoading(true);
    setContext(null);
    setRoomId(0);
    setQuote(null);
    setError('');
    void officeBookings
      .context(officeId)
      .then((c) => {
        if (active) {
          setContext(c);
          setRoomId(c.rooms[0]?.id || 0);
        }
      })
      .catch((e) => {
        if (active) setError(getErrorMessage(e));
      })
      .finally(() => {
        if (active) setContextLoading(false);
      });
    return () => {
      active = false;
    };
  }, [officeId]);
  useEffect(() => {
    setStart(-1);
    setEnd(-1);
    setSlots([]);
    setQuote(null);
    if (!roomId || !officeId || !date) {
      setSlotsLoading(false);
      return;
    }
    let active = true;
    setSlotsLoading(true);
    void officeBookings
      .slots(officeId, roomId, date)
      .then((r) => {
        if (active) {
          setSlots(r.slots);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(getErrorMessage(e));
      })
      .finally(() => {
        if (active) setSlotsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [roomId, officeId, date]);
  useEffect(() => {
    ++quoteRequest.current;
    setQuote(null);
    setCommandKey(crypto.randomUUID());
  }, [start, end, useHours, comment, officeId, roomId, date]);
  const selectedRoom = context?.rooms.find((r) => r.id === roomId);
  const hoursAllowed =
    context?.canSpendHours &&
    (!selectedRoom?.office_service ||
      selectedRoom.office_service.mode === 'quota');
  const step = selectedRoom?.config.slot_step_min || 30;
  const draft: BookingDraft = {
    officeId,
    roomId,
    date,
    startMinute: start,
    endMinute: end,
    writeoffMinutes:
      useHours && hoursAllowed && context
        ? Math.floor(
            Math.min(context.availableMinutes, Math.max(0, end - start)) / step,
          ) * step
        : 0,
    paymentMethod: 'cash',
    comment,
  };
  const draftKey = JSON.stringify(draft);
  const currentDraft = useRef(draftKey);
  currentDraft.current = draftKey;
  const currentQuote = quoteKey === draftKey ? quote : null;
  const selectedSlots = slots.filter(
    (s) => s.start_minute >= start && s.end_minute <= end,
  );
  const valid =
    start >= 0 &&
    end > start &&
    selectedSlots.length > 0 &&
    selectedSlots[0].start_minute === start &&
    selectedSlots[selectedSlots.length - 1].end_minute === end &&
    selectedSlots.every(
      (s, i) =>
        s.state === 'free' &&
        (i === 0 || selectedSlots[i - 1].end_minute === s.start_minute),
    );
  async function calculate() {
    if (!valid || busy) return;
    const sequence = ++quoteRequest.current;
    const key = draftKey;
    setBusy(true);
    setError('');
    try {
      const next = await officeBookings.quote(draft);
      if (sequence === quoteRequest.current && key === currentDraft.current) {
        setQuote(next);
        setQuoteKey(key);
      }
    } catch (e) {
      if (sequence === quoteRequest.current) setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function reserve() {
    if (!currentQuote || !valid || busy) return;
    const bookedDraft = draft;
    setBusy(true);
    setError('');
    try {
      const result = await officeBookings.create(
        {
          ...bookedDraft,
          pricingFingerprint: currentQuote.pricing_fingerprint,
        },
        commandKey,
      );
      setReceipt(
        `Бронирование ${result.booking.number || result.booking.id} создано: ${result.booking.status_label}`,
      );
      setQuote(null);
      setStart(-1);
      setEnd(-1);
      const [nextSlots, nextContext] = await Promise.all([
        officeBookings.slots(
          bookedDraft.officeId,
          bookedDraft.roomId,
          bookedDraft.date,
        ),
        officeBookings.context(bookedDraft.officeId),
      ]);
      setSlots(nextSlots.slots);
      setContext(nextContext);
    } catch (e) {
      if (getErrorStatus(e) === 409) setQuote(null);
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ProtectedLayout anyPermissions={['passes.view_own', 'requests.create']}>
      <div className="space-y-5">
        <h1 className="text-2xl font-semibold">Переговорные</h1>
        <p className="text-sm text-[var(--muted)]">
          Выберите офис, переговорную и свободное время. Перед созданием брони
          проверьте расчёт.
        </p>
        {error && (
          <p role="alert" className="card p-4 text-[var(--danger)]">
            {error}
          </p>
        )}
        {receipt && (
          <p role="status" className="card p-4">
            {receipt}
          </p>
        )}
        <div className="card p-5 grid sm:grid-cols-2 gap-4">
          <label>
            Ваш офис
            <select
              className="input mt-1"
              value={officeId}
              disabled={busy}
              onChange={(e) => setOfficeId(e.target.value)}
            >
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.number} · {o.businessCenterName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Дата
            <input
              className="input mt-1"
              type="date"
              value={date}
              min={new Date().toLocaleDateString('sv-SE', {
                timeZone: 'Europe/Moscow',
              })}
              disabled={busy}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          {context && (
            <>
              <label>
                Переговорная
                <select
                  className="input mt-1"
                  value={roomId}
                  disabled={busy}
                  onChange={(e) => setRoomId(Number(e.target.value))}
                >
                  {context.rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title} · {r.config.price_label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-sm self-center">
                Бесплатный остаток: {context.availableMinutes} мин · В месяц:{' '}
                {context.monthlyMinutes} мин
              </p>
            </>
          )}
        </div>
        {contextLoading && (
          <p className="card p-5 text-[var(--muted)]" role="status">
            Загрузка переговорных…
          </p>
        )}
        {!contextLoading && offices.length === 0 && (
          <p className="card p-5 text-[var(--muted)]">
            Для бронирования нужен назначенный офис.
          </p>
        )}
        {context && context.rooms.length === 0 && (
          <p className="card p-5">Доступных переговорных для офиса пока нет.</p>
        )}
        {roomId > 0 && (
          <section className="card p-5 space-y-4">
            <h2 className="font-semibold">Свободные интервалы</h2>
            <p className="text-sm text-[var(--muted)]">
              Нажмите начало, затем последний интервал. Занятые интервалы
              недоступны.
            </p>
            {slotsLoading && (
              <p role="status" className="text-sm text-[var(--muted)]">
                Загрузка свободного времени…
              </p>
            )}
            {!slotsLoading && !error && slots.length === 0 && (
              <p className="text-sm text-[var(--muted)]">
                На выбранную дату интервалов нет.
              </p>
            )}
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {slots.map((s) => (
                <button
                  key={s.start_minute}
                  type="button"
                  disabled={busy || s.state !== 'free'}
                  aria-pressed={s.start_minute >= start && s.end_minute <= end}
                  className={`btn whitespace-nowrap ${s.start_minute >= start && s.end_minute <= end ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '0.5rem 0.25rem', fontSize: '0.75rem' }}
                  onClick={() => {
                    if (
                      start < 0 ||
                      s.start_minute < start ||
                      end - start > s.end_minute - s.start_minute
                    ) {
                      setStart(s.start_minute);
                      setEnd(s.end_minute);
                    } else {
                      setEnd(s.end_minute);
                    }
                  }}
                >
                  {timeLabel(s.start_minute)}–{timeLabel(s.end_minute)}
                  {s.state !== 'free' && (
                    <span className="sr-only"> · занято</span>
                  )}
                </button>
              ))}
            </div>
            <p className="text-xs text-[var(--muted)]">
              Серые интервалы заняты. Время московское.
            </p>
            {start >= 0 && (
              <div className="rounded-lg bg-[var(--surface-muted)] p-3">
                <p className="font-medium">
                  {timeLabel(start)}–{timeLabel(end)} · {end - start} мин
                </p>
                {!valid && (
                  <p role="alert" className="text-sm text-[var(--danger)] mt-1">
                    В выбранном промежутке есть занятое время. Выберите
                    непрерывный свободный интервал.
                  </p>
                )}
              </div>
            )}
            {start >= 0 &&
              hoursAllowed &&
              context &&
              context.availableMinutes > 0 && (
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={useHours}
                    onChange={(e) => setUseHours(e.target.checked)}
                  />
                  Использовать бесплатные минуты (до{' '}
                  {Math.min(context.availableMinutes, Math.max(0, end - start))}{' '}
                  мин)
                </label>
              )}
            <label className="block text-sm">
              Комментарий
              <textarea
                className="input mt-1"
                maxLength={4000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </label>
            {currentQuote ? (
              <div className="space-y-3">
                <p className="font-semibold">
                  К оплате: {officeMoney(currentQuote.total_amount_minor)} ·
                  Списание: {currentQuote.writeoff_min} мин
                </p>
                <button
                  className="btn btn-primary"
                  disabled={busy || !valid || context?.mode !== 'pass'}
                  onClick={() => void reserve()}
                >
                  Подтвердить бронирование
                </button>
                <button
                  type="button"
                  className="btn btn-secondary ml-2"
                  disabled={busy}
                  onClick={() => void calculate()}
                >
                  Пересчитать
                </button>
              </div>
            ) : (
              <button
                className="btn btn-primary"
                disabled={!valid || busy}
                onClick={() => void calculate()}
              >
                {busy ? 'Расчёт…' : 'Рассчитать стоимость'}
              </button>
            )}
            {context?.mode !== 'pass' && (
              <p className="text-sm text-[var(--muted)]">
                Приём бронирований пока выключен администратором.
              </p>
            )}
          </section>
        )}
      </div>
    </ProtectedLayout>
  );
}
