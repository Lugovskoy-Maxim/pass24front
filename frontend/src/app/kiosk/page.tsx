'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  KeyRound,
  LogOut,
  Mail,
  QrCode,
  Settings,
  Smartphone,
  WifiOff,
} from 'lucide-react';
import QRCode from 'react-qr-code';
import { getErrorMessage, getErrorStatus, isNetworkError } from '@/lib/api';
import {
  kioskApi,
  kioskRangeFree,
  kioskTime,
  KioskLoginChallenge,
  KioskPayment,
  KioskPaymentStatus,
  KioskSession,
  KioskSlot,
  KioskStatus,
} from '@/lib/kiosk';
import {
  BookingContext,
  BookingDraft,
  BookingQuote,
  officeMoney,
} from '@/lib/office-services';
import { SiteBrand } from '@/components/SiteBrand';
import { useConfig } from '@/hooks/useConfig';
import './kiosk.css';

const DEVICE_KEY = 'pass24_kiosk_device';
const IDLE_MS = 60_000;
type Screen = 'status' | 'login' | 'booking' | 'payment' | 'admin';
const LOGIN_METHODS = [
  {
    id: 'login',
    label: 'Логин',
    icon: KeyRound,
    hint: 'Ваш логин в Pass',
    type: 'text',
  },
  {
    id: 'phone',
    label: 'Телефон',
    icon: Smartphone,
    hint: '+7 (900) 000-00-00',
    type: 'tel',
  },
  {
    id: 'email',
    label: 'Почта',
    icon: Mail,
    hint: 'name@example.ru',
    type: 'email',
  },
] as const;

function LoginForm({
  admin,
  deviceToken,
  onLogin,
  onCancel,
}: {
  admin: boolean;
  deviceToken: string;
  onLogin: (session: KioskSession) => void;
  onCancel: () => void;
}) {
  const [method, setMethod] = useState<(typeof LOGIN_METHODS)[number]>(
    LOGIN_METHODS[0],
  );
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [qr, setQr] = useState<KioskLoginChallenge | null>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function startQr() {
    if (busy) return;
    setBusy(true);
    setPassword('');
    setError('');
    try {
      const challenge = await kioskApi.startLogin(deviceToken);
      if (active.current) setQr(challenge);
    } catch (e) {
      if (active.current) setError(getErrorMessage(e));
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await kioskApi.login(login.trim(), password);
      if (active.current) onLogin(result);
    } catch (e) {
      if (active.current) setError(getErrorMessage(e));
    } finally {
      if (active.current) {
        setPassword('');
        setBusy(false);
      }
    }
  }
  if (qr)
    return (
      <QrLogin
        challenge={qr}
        deviceToken={deviceToken}
        onBack={() => setQr(null)}
        onLogin={onLogin}
      />
    );
  return (
    <section className="kiosk-panel kiosk-login kiosk-stack">
      <button className="kiosk-back" onClick={onCancel}>
        <ArrowLeft size={20} />
        Назад
      </button>
      <h1>{admin ? 'Настройка планшета' : 'Войдите для бронирования'}</h1>
      {!admin && deviceToken && (
        <button
          className="btn btn-secondary kiosk-qr-button"
          disabled={busy}
          onClick={() => void startQr()}
        >
          <QrCode size={22} aria-hidden="true" />
          Войти по QR-коду
        </button>
      )}
      {admin && (
        <p className="kiosk-muted">
          Войдите как администратор с правом управления бронированиями.
        </p>
      )}
      <form onSubmit={submit} autoComplete="off" className="kiosk-stack">
        <div
          className="kiosk-methods"
          role="radiogroup"
          aria-label="Способ входа"
        >
          {LOGIN_METHODS.map((option) => (
            <label key={option.id} className="kiosk-method">
              <input
                type="radio"
                name="login-method"
                disabled={busy}
                checked={method.id === option.id}
                onChange={() => {
                  setMethod(option);
                  setLogin('');
                  setError('');
                }}
              />
              <span className="kiosk-method-option">
                <option.icon size={19} aria-hidden="true" />
                {option.label}
              </span>
            </label>
          ))}
        </div>
        <label>
          {method.id === 'email' ? 'Электронная почта' : method.label}
          <input
            key={method.id}
            className="input"
            name={`kiosk-${method.id}`}
            type={method.type}
            placeholder={method.hint}
            required
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          Пароль
          <input
            className="input"
            name="kiosk-password"
            type="password"
            required
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        </label>
        {error && (
          <p className="kiosk-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="btn btn-primary"
          disabled={busy || !login.trim() || !password}
        >
          {busy ? 'Вход…' : 'Войти'}
        </button>
      </form>
    </section>
  );
}

function QrLogin({
  challenge,
  deviceToken,
  onBack,
  onLogin,
}: {
  challenge: KioskLoginChallenge;
  deviceToken: string;
  onBack: () => void;
  onLogin: (session: KioskSession) => void;
}) {
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let timer = window.setTimeout(poll, 0);
    async function poll() {
      try {
        const result = await kioskApi.claimLogin(
          deviceToken,
          challenge.claimCode,
        );
        if (!active) return;
        if (result.state === 'approved') {
          onLogin(result.session);
          return;
        }
        setError('');
      } catch (e) {
        if (!active) return;
        setError(getErrorMessage(e));
        if ([401, 404].includes(getErrorStatus(e) ?? 0)) return;
      }
      timer = window.setTimeout(poll, 1800);
    }
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [challenge, deviceToken, onLogin]);
  return (
    <section className="kiosk-panel kiosk-checkout kiosk-stack">
      <button className="kiosk-back" onClick={onBack}>
        <ArrowLeft size={20} /> Назад
      </button>
      <h1>Вход по QR-коду</h1>
      <div className="kiosk-qr">
        <QRCode
          value={`${window.location.origin}/kiosk/approve#${challenge.approvalCode}`}
          size={224}
          title="QR-код для входа в Pass"
        />
      </div>
      <p>
        Отсканируйте QR камерой телефона и подтвердите вход. Сверьте код на
        обоих экранах.
      </p>
      <strong className="kiosk-pair-code">{challenge.displayCode}</strong>
      <p role="status" className="kiosk-muted">
        {error || 'Ожидаем подтверждение с телефона'}
      </p>
    </section>
  );
}

function Setup({
  session,
  deviceToken,
  onBound,
  onReset,
  onExit,
}: {
  session: KioskSession;
  deviceToken: string;
  onBound: (token: string) => void;
  onReset: () => void;
  onExit: () => void;
}) {
  const [rooms, setRooms] = useState<{ id: number; title: string }[]>([]);
  const [roomId, setRoomId] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    void kioskApi
      .rooms(session.token)
      .then((r) => {
        if (active.current) {
          setRooms(r.rooms);
          setRoomId(r.rooms[0]?.id || 0);
        }
      })
      .catch((e) => {
        if (active.current) setError(getErrorMessage(e));
      });
    return () => {
      active.current = false;
    };
  }, [session.token]);
  async function save(reset = false) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (reset) {
        if (deviceToken) await kioskApi.revoke(session.token, deviceToken);
        if (active.current) onReset();
      } else {
        const result = await kioskApi.bind(session.token, roomId, deviceToken);
        if (active.current) onBound(result.token);
      }
    } catch (e) {
      if (active.current) setError(getErrorMessage(e));
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <section className="kiosk-panel kiosk-stack">
      <h1>Привязка к переговорной</h1>
      <p className="kiosk-muted">
        Планшет показывает расписание только выбранной комнаты. Аккаунт
        администратора на устройстве не сохраняется.
      </p>
      {error && (
        <p role="alert" className="kiosk-error">
          {error}
        </p>
      )}
      <label>
        Переговорная
        <select
          className="input"
          value={roomId}
          disabled={busy}
          onChange={(e) => setRoomId(Number(e.target.value))}
        >
          <option value={0}>Выберите переговорную</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
      </label>
      {!rooms.length && !error && (
        <p role="status">Загрузка или нет доступных переговорных…</p>
      )}
      <button
        className="btn btn-primary"
        disabled={busy || !roomId}
        onClick={() => void save()}
      >
        {busy ? 'Сохранение…' : 'Привязать планшет'}
      </button>
      {deviceToken && (
        <button
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void save(true)}
        >
          Отозвать доступ планшета
        </button>
      )}
      <button className="kiosk-back" disabled={busy} onClick={onExit}>
        Завершить настройку
      </button>
    </section>
  );
}

function Booking({
  session,
  status,
  connected,
  onExit,
  onSuccess,
  onPayment,
}: {
  session: KioskSession;
  status: KioskStatus;
  connected: boolean;
  onExit: () => void;
  onSuccess: (message: string) => void;
  onPayment: (payment: KioskPayment) => void;
}) {
  const offices = session.user.offices || [];
  const [officeId, setOfficeId] = useState(offices[0]?.id || '');
  const [selectedDate, setSelectedDate] = useState(status.date);
  const date = selectedDate < status.date ? status.date : selectedDate;
  const isToday = date === status.date;
  const [context, setContext] = useState<BookingContext | null>(null);
  const [slots, setSlots] = useState<KioskSlot[]>([]);
  const [start, setStart] = useState(-1);
  const [end, setEnd] = useState(-1);
  const [useHours, setUseHours] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('card_online');
  const [quote, setQuote] = useState<{
    value: BookingQuote;
    key: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadedKey, setLoadedKey] = useState('');
  const [revision, setRevision] = useState(0);
  const availabilityKey = JSON.stringify([
    officeId,
    status.room.id,
    date,
    revision,
  ]);
  const [retry, setRetry] = useState<{
    draft: BookingDraft;
    key: string;
  } | null>(null);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const working = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setContext(null);
    setSlots([]);
    setStart(-1);
    setEnd(-1);
    setQuote(null);
    setUseHours(false);
    setError('');
    if (!officeId) {
      setLoading(false);
      return;
    }
    void Promise.all([
      kioskApi.context(session.token, officeId),
      kioskApi.slots(session.token, officeId, status.room.id, date),
    ])
      .then(([c, s]) => {
        if (active) {
          setContext(c);
          setSlots(s.slots);
          setLoadedKey(availabilityKey);
        }
      })
      .catch((e) => {
        if (active) {
          if (getErrorStatus(e) === 401) onExit();
          else setError(getErrorMessage(e));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session.token, officeId, status.room.id, date, availabilityKey, onExit]);
  const loaded = loadedKey === availabilityKey;
  const room = loaded
    ? context?.rooms.find((r) => r.id === status.room.id)
    : undefined;
  const step = room?.config.slot_step_min || 30;
  const hoursAllowed =
    context?.canSpendHours &&
    (!room?.office_service || room.office_service.mode === 'quota');
  const draft: BookingDraft = {
    officeId,
    roomId: status.room.id,
    date,
    startMinute: start,
    endMinute: end,
    writeoffMinutes:
      useHours && hoursAllowed
        ? Math.floor(
            Math.min(context?.availableMinutes || 0, Math.max(0, end - start)) /
              step,
          ) * step
        : 0,
    paymentMethod,
    comment: '',
  };
  const key = JSON.stringify(draft);
  const currentKey = useRef(key);
  currentKey.current = key;
  const currentQuote = quote?.key === key ? quote.value : null;
  const [hour, minute] = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date(status.serverTime))
    .split(':')
    .map(Number);
  const serverMinute = isToday ? hour * 60 + minute : -1;
  const availableSlots = isToday ? status.slots : slots;
  const free =
    kioskRangeFree(slots, start, end) &&
    kioskRangeFree(availableSlots, start, end);
  const dateLabel = new Date(`${date}T12:00:00+03:00`).toLocaleDateString(
    'ru-RU',
    { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' },
  );
  function shiftDate(days: number) {
    const next = new Date(`${date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + days);
    setSelectedDate(next.toISOString().slice(0, 10));
  }
  const valid =
    !!room &&
    free &&
    start > serverMinute &&
    connected &&
    context?.mode === 'pass';
  async function submit() {
    if ((!valid && !retry) || working.current) return;
    const command =
      retry ??
      (currentQuote && {
        draft: {
          ...draft,
          pricingFingerprint: currentQuote.pricing_fingerprint,
        },
        key: crypto.randomUUID(),
      });
    working.current = true;
    setBusy(true);
    setError('');
    const submittedKey = key;
    try {
      if (!command) {
        const value = await kioskApi.quote(session.token, draft);
        if (alive.current && currentKey.current === submittedKey)
          setQuote({ value, key: submittedKey });
      } else {
        const result = await kioskApi.create(
          session.token,
          command.draft,
          command.key,
        );
        if (!alive.current) return;
        if (result.booking.status === 'hold') {
          onPayment({
            bookingId: result.booking.id,
            token: result.payment.payment_token,
            amount: result.booking.total_amount_minor,
          });
        } else {
          onSuccess(`Бронирование создано · ${result.booking.status_label}`);
        }
      }
    } catch (e) {
      if (alive.current) {
        const status = getErrorStatus(e);
        if (status === 401) onExit();
        else {
          if (command && (isNetworkError(e) || (status ?? 0) >= 500)) {
            setRetry(command);
            setError(
              'Статус бронирования пока неизвестен. Проверьте его повторно.',
            );
          } else {
            setRetry(null);
            setError(getErrorMessage(e));
          }
          if (status === 409) {
            setQuote(null);
          }
        }
      }
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section className="kiosk-stack">
      <div className="kiosk-user">
        <span>{session.user.full_name}</span>
        <button className="kiosk-back" onClick={onExit}>
          <LogOut size={18} />
          Выйти
        </button>
      </div>
      <h1>Бронирование</h1>
      <div
        className={`kiosk-booking-grid${loaded && start >= 0 ? ' has-summary' : ''}`}
      >
        <div className="kiosk-panel kiosk-stack">
          <div className="kiosk-booking-fields">
            <label>
              Ваш офис
              <select
                className="input"
                value={officeId}
                disabled={busy || !!retry}
                onChange={(e) => setOfficeId(e.target.value)}
              >
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.number} · {o.businessCenterName}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <label htmlFor="kiosk-booking-date">Дата бронирования</label>
              <div className="kiosk-date-controls">
                <button
                  type="button"
                  className="btn btn-secondary"
                  aria-label="Предыдущий день"
                  disabled={isToday || busy || !!retry}
                  onClick={() => shiftDate(-1)}
                >
                  <ChevronLeft size={20} aria-hidden="true" />
                </button>
                <input
                  id="kiosk-booking-date"
                  className="input"
                  type="date"
                  value={date}
                  min={status.date}
                  max="9999-12-31"
                  disabled={busy || !!retry}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (
                      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
                      value >= status.date &&
                      Number.isFinite(Date.parse(`${value}T00:00:00Z`))
                    )
                      setSelectedDate(value);
                  }}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  aria-label="Следующий день"
                  disabled={busy || !!retry || date === '9999-12-31'}
                  onClick={() => shiftDate(1)}
                >
                  <ChevronRight size={20} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
          {!offices.length && (
            <p role="alert">
              Для бронирования нужен назначенный офис. Обратитесь к
              администратору.
            </p>
          )}
          {loading && <p role="status">Загрузка свободного времени…</p>}
          {loaded && !loading && context && !room && (
            <p role="alert">Эта переговорная недоступна вашему офису.</p>
          )}
          {room && (
            <>
              <h2>
                <CalendarDays size={22} />
                {isToday ? `Сегодня · ${dateLabel}` : dateLabel}
              </h2>
              <p className="kiosk-muted">
                Нажмите первый, затем последний интервал бронирования.
              </p>
              <div className="kiosk-slots">
                {slots.map((s) => {
                  const enabled =
                    s.start_minute > serverMinute &&
                    s.state === 'free' &&
                    kioskRangeFree(
                      availableSlots,
                      s.start_minute,
                      s.end_minute,
                    );
                  const selected =
                    s.start_minute >= start && s.end_minute <= end;
                  return (
                    <button
                      key={s.start_minute}
                      className={`btn ${selected ? 'btn-primary' : 'btn-secondary'}`}
                      disabled={!enabled || busy || !!retry || !connected}
                      aria-pressed={selected}
                      aria-label={`${kioskTime(s.start_minute)}–${kioskTime(s.end_minute)}${enabled ? '' : ', недоступно'}`}
                      onClick={() => {
                        if (
                          start < 0 ||
                          s.start_minute < start ||
                          end - start > step
                        ) {
                          setStart(s.start_minute);
                          setEnd(s.end_minute);
                        } else setEnd(s.end_minute);
                      }}
                    >
                      {kioskTime(s.start_minute)}–{kioskTime(s.end_minute)}
                    </button>
                  );
                })}
              </div>
              {!slots.some(
                (s) =>
                  s.state === 'free' &&
                  s.start_minute > serverMinute &&
                  kioskRangeFree(availableSlots, s.start_minute, s.end_minute),
              ) && <p>На выбранный день свободных интервалов нет.</p>}
              <p className="kiosk-small kiosk-muted">
                Недоступные интервалы затемнены. Время московское.
              </p>
              {hoursAllowed && context && context.availableMinutes > 0 && (
                <label className="kiosk-check">
                  <input
                    type="checkbox"
                    checked={useHours}
                    disabled={busy || !!retry}
                    onChange={(e) => setUseHours(e.target.checked)}
                  />
                  Использовать бесплатные минуты · остаток{' '}
                  {context.availableMinutes} мин
                </label>
              )}
            </>
          )}
        </div>
        {(error || retry) && (
          <div className="kiosk-error" role="alert">
            {error || 'Статус бронирования пока неизвестен.'}{' '}
            <button
              className="kiosk-back"
              disabled={busy}
              onClick={() =>
                retry ? void submit() : setRevision((r) => r + 1)
              }
            >
              {retry ? 'Проверить бронирование' : 'Обновить интервалы'}
            </button>
          </div>
        )}
        {loaded && start >= 0 && (
          <div className="kiosk-panel kiosk-stack kiosk-booking-summary">
            <h2>Ваша бронь</h2>
            <p>
              {status.room.title} · {dateLabel}
            </p>
            <p className="kiosk-selection">
              <Clock3 size={22} />
              {kioskTime(start)}–{kioskTime(end)} · {end - start} мин
            </p>
            <label>
              Способ оплаты
              <select
                className="input"
                value={paymentMethod}
                disabled={busy || !!retry}
                onChange={(e) => {
                  setPaymentMethod(e.target.value);
                  setQuote(null);
                  setError('');
                }}
              >
                <option value="card_online">Картой на телефоне · ЮKassa</option>
                <option value="cash">Наличными</option>
              </select>
            </label>
            {!free && (
              <p role="alert" className="kiosk-error">
                Выберите непрерывный свободный промежуток.
              </p>
            )}
            {currentQuote && (
              <p className="kiosk-price">
                К оплате: {officeMoney(currentQuote.total_amount_minor)}
                <span className="kiosk-muted kiosk-small">
                  Бесплатные минуты: {currentQuote.writeoff_min}
                </span>
              </p>
            )}
            <button
              className="btn btn-primary"
              disabled={!valid || busy || !!retry}
              onClick={() => void submit()}
            >
              {busy
                ? 'Подождите…'
                : currentQuote
                  ? paymentMethod === 'card_online' &&
                    currentQuote.total_amount_minor > 0
                    ? 'Перейти к оплате'
                    : 'Подтвердить бронирование'
                  : 'Рассчитать стоимость'}
            </button>
          </div>
        )}
      </div>
      {context && context.mode !== 'pass' && (
        <p role="alert" className="kiosk-error">
          Приём бронирований выключен администратором.
        </p>
      )}
    </section>
  );
}

function Payment({
  payment,
  onExit,
}: {
  payment: KioskPayment;
  onExit: () => void;
}) {
  const [status, setStatus] = useState<KioskPaymentStatus | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  useEffect(() => {
    let active = true;
    let timer = window.setTimeout(refresh, 0);
    async function refresh() {
      try {
        const next = await kioskApi.paymentStatus(payment);
        if (!active) return;
        setStatus(next);
        setConnectionError(false);
        if (next.state !== 'pending') return;
      } catch {
        if (!active) return;
        setConnectionError(true);
      }
      timer = window.setTimeout(refresh, 5000);
    }
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [payment]);
  const pending = !status || status.state === 'pending';
  const checkout = status?.confirmationUrl;
  return (
    <section className="kiosk-panel kiosk-checkout kiosk-stack">
      <CreditCard size={30} aria-hidden="true" />
      <h1>
        {pending
          ? 'Оплата бронирования'
          : status.state === 'paid'
            ? 'Оплата получена'
            : 'Платёж не состоялся'}
      </h1>
      <p className="kiosk-price">{officeMoney(payment.amount)}</p>
      {pending && checkout?.startsWith('https://') && (
        <>
          <div className="kiosk-qr">
            <QRCode
              value={checkout}
              size={224}
              title="QR-код для оплаты в ЮKassa"
            />
          </div>
          <p>Наведите камеру телефона на QR-код и оплатите бронь в ЮKassa.</p>
        </>
      )}
      <p role="status" className="kiosk-muted">
        {connectionError
          ? 'Не удалось проверить статус. Повторяем запрос…'
          : pending
            ? checkout
              ? 'Ожидаем подтверждение оплаты'
              : 'Подготавливаем оплату…'
            : status.statusLabel}
      </p>
      <button className="btn btn-secondary" onClick={onExit}>
        К расписанию
      </button>
    </section>
  );
}

export default function KioskPage() {
  const config = useConfig();
  const [ready, setReady] = useState(false);
  const [deviceToken, setDeviceToken] = useState('');
  const [status, setStatus] = useState<KioskStatus | null>(null);
  const [screen, setScreen] = useState<Screen>('status');
  const [session, setSession] = useState<KioskSession | null>(null);
  const [payment, setPayment] = useState<KioskPayment | null>(null);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  const [receipt, setReceipt] = useState('');
  const [formKey, setFormKey] = useState(0);
  const [remaining, setRemaining] = useState(60);
  const deadline = useRef(Date.now() + IDLE_MS);
  const finish = useCallback(() => {
    setSession(null);
    setPayment(null);
    setScreen('status');
    setFormKey((n) => n + 1);
  }, []);
  const touch = useCallback(() => {
    const duration = screen === 'payment' ? 3 * IDLE_MS : IDLE_MS;
    deadline.current = Date.now() + duration;
    setRemaining(duration / 1000);
  }, [screen]);
  const completeLogin = useCallback(
    (value: KioskSession) => {
      touch();
      setSession(value);
      if (screen === 'login') setScreen('booking');
    },
    [screen, touch],
  );
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);
  useEffect(() => {
    try {
      setDeviceToken(localStorage.getItem(DEVICE_KEY) || '');
    } catch {
      setError('Разрешите хранение данных сайта для привязки планшета.');
    }
    setReady(true);
    const leave = () => finish();
    const hide = () => {
      if (document.hidden) finish();
    };
    window.addEventListener('pagehide', leave);
    window.addEventListener('pageshow', leave);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('pageshow', leave);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [finish]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
      const left = Math.max(
        0,
        Math.ceil((deadline.current - Date.now()) / 1000),
      );
      setRemaining(left);
      if (screen !== 'status' && left === 0) finish();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [screen, finish]);
  useEffect(() => {
    if (!deviceToken) return;
    let active = true;
    let fetching = false;
    const refresh = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const data = await kioskApi.status(deviceToken);
        if (active) {
          setStatus(data);
          setOffset(Date.parse(data.serverTime) - Date.now());
          setLastUpdate(Date.now());
          setError('');
        }
      } catch (e) {
        if (active) {
          setError(getErrorMessage(e));
          setLastUpdate(0);
          if (getErrorStatus(e) === 401 || getErrorStatus(e) === 404) {
            setStatus(null);
            finish();
          }
        }
      } finally {
        fetching = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    window.addEventListener('online', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('online', refresh);
    };
  }, [deviceToken, finish, receipt]);
  useEffect(() => {
    if (!receipt) return;
    const timer = window.setTimeout(() => setReceipt(''), 6000);
    return () => window.clearTimeout(timer);
  }, [receipt]);
  function bind(token: string) {
    try {
      localStorage.setItem(DEVICE_KEY, token);
    } catch {
      setError(
        'Не удалось сохранить привязку. Разрешите хранение данных сайта.',
      );
      return;
    }
    setDeviceToken(token);
    setStatus(null);
    setLastUpdate(0);
    finish();
  }
  function reset() {
    localStorage.removeItem(DEVICE_KEY);
    setDeviceToken('');
    setStatus(null);
    setLastUpdate(0);
    finish();
  }
  function open(next: Screen) {
    deadline.current = Date.now() + IDLE_MS;
    setRemaining(60);
    setSession(null);
    setPayment(null);
    setReceipt('');
    setScreen(next);
  }
  const connected =
    !!status && lastUpdate > 0 && now - lastUpdate < 45000 && !error;
  const current = new Date(now + offset);
  const clock = current.toLocaleTimeString('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
  });
  const today = current.toLocaleDateString('sv-SE', {
    timeZone: 'Europe/Moscow',
  });
  const minute = Number(clock.split(':')[0]) * 60 + Number(clock.split(':')[1]);
  const currentSlot = status?.slots.find(
    (s) => s.start_minute <= minute && s.end_minute > minute,
  );
  const available = currentSlot?.state === 'free';
  const state =
    !connected || status?.date !== today
      ? 'Нет актуальных данных'
      : !currentSlot
        ? 'Вне часов работы'
        : available
          ? 'Свободна'
          : 'Занята';
  const schedule = (status?.slots || []).reduce<KioskSlot[]>((rows, slot) => {
    const last = rows[rows.length - 1];
    if (
      last &&
      last.state === slot.state &&
      last.end_minute === slot.start_minute
    )
      last.end_minute = slot.end_minute;
    else rows.push({ ...slot });
    return rows;
  }, []);
  const until = schedule.find(
    (s) => s.start_minute <= minute && s.end_minute > minute,
  )?.end_minute;
  return (
    <main
      className={`kiosk kiosk-screen-${screen}`}
      onPointerDownCapture={touch}
      onKeyDownCapture={touch}
    >
      <header className="kiosk-header">
        <div>
          <SiteBrand
            config={config}
            variant="dark"
            size="sm"
            className="kiosk-brand"
          />
          <p className="kiosk-room-title">
            {status?.room.title || 'Планшет переговорной'}
          </p>
        </div>
        <div className="kiosk-clock">
          <strong>{clock}</strong>
          <span>
            {current.toLocaleDateString('ru-RU', {
              timeZone: 'Europe/Moscow',
              day: 'numeric',
              month: 'long',
            })}{' '}
            · МСК
          </span>
        </div>
      </header>
      <div className="kiosk-content">
        {!ready ? (
          <p role="status">Загрузка…</p>
        ) : (
          <>
            {receipt && (
              <div className="kiosk-receipt" role="status">
                <CheckCircle2 size={30} />
                <div>
                  <strong>{receipt}</strong>
                  <p>Вы вышли из аккаунта.</p>
                </div>
              </div>
            )}
            {error && (screen === 'status' || screen === 'booking') && (
              <div className="kiosk-error" role="alert">
                <WifiOff size={20} />
                <span>
                  {error}{' '}
                  {deviceToken && 'Повторяем подключение каждые 15 секунд.'}
                </span>
              </div>
            )}
            {screen === 'status' &&
              (!deviceToken ? (
                <section className="kiosk-panel kiosk-stack">
                  <h1>Настройте планшет</h1>
                  <p className="kiosk-muted">
                    Привяжите устройство к переговорной, чтобы показывать
                    расписание и принимать бронирования.
                  </p>
                  <button
                    className="btn btn-primary"
                    onClick={() => open('admin')}
                  >
                    Войти как администратор
                  </button>
                </section>
              ) : (
                <div className="kiosk-dashboard">
                  <section className="kiosk-availability">
                    <p
                      className={`kiosk-state ${connected && currentSlot ? (available ? 'is-free' : 'is-busy') : ''}`}
                    >
                      <span />
                      {state}
                    </p>
                    {connected && until && (
                      <p className="kiosk-until">
                        До {kioskTime(until)} · {until - minute} мин
                      </p>
                    )}
                    <button
                      className="btn btn-primary"
                      disabled={!connected || status?.date !== today}
                      onClick={() => open('login')}
                    >
                      Забронировать
                    </button>
                  </section>
                  <section className="kiosk-panel kiosk-stack">
                    <h2>
                      <CalendarDays size={24} />
                      Сегодня
                    </h2>
                    {!status && !error && (
                      <p role="status">Загрузка расписания…</p>
                    )}
                    {status && !status.slots.length && (
                      <p>Рабочие интервалы не заданы.</p>
                    )}
                    <div
                      className={`kiosk-schedule ${!connected ? 'is-stale' : ''}`}
                    >
                      {schedule.map((s) => (
                        <div
                          key={s.start_minute}
                          className={`kiosk-schedule-row ${s.state === 'free' ? 'is-free' : ''}`}
                        >
                          <span>
                            {kioskTime(s.start_minute)}–
                            {kioskTime(s.end_minute)}
                          </span>
                          <strong>
                            {s.state === 'free' ? 'Свободно' : 'Занято'}
                          </strong>
                        </div>
                      ))}
                    </div>
                    {!connected && status && (
                      <p className="kiosk-muted">
                        Последние полученные данные. Доступность не
                        подтверждена.
                      </p>
                    )}
                  </section>
                </div>
              ))}
            {(screen === 'login' || screen === 'admin') && !session && (
              <LoginForm
                key={`${screen}-${formKey}`}
                admin={screen === 'admin'}
                deviceToken={deviceToken}
                onCancel={finish}
                onLogin={completeLogin}
              />
            )}
            {screen === 'admin' && session && (
              <Setup
                session={session}
                deviceToken={deviceToken}
                onBound={bind}
                onReset={reset}
                onExit={finish}
              />
            )}
            {screen === 'booking' && session && status && (
              <Booking
                session={session}
                status={{ ...status, serverTime: current.toISOString() }}
                connected={connected && status.date === today}
                onExit={finish}
                onPayment={(value) => {
                  deadline.current = Date.now() + 3 * IDLE_MS;
                  setRemaining(180);
                  setSession(null);
                  setPayment(value);
                  setScreen('payment');
                }}
                onSuccess={(message) => {
                  finish();
                  setReceipt(message);
                }}
              />
            )}
            {screen === 'payment' && payment && (
              <Payment payment={payment} onExit={finish} />
            )}
            {screen !== 'status' && screen !== 'payment' && remaining <= 15 && (
              <p className="kiosk-idle">
                <span role="status">Сессия скоро завершится.</span>{' '}
                <span aria-hidden="true">{remaining} сек.</span>
              </p>
            )}
          </>
        )}
      </div>
      {screen === 'status' && (
        <footer className="kiosk-footer">
          <span>
            {connected
              ? 'Расписание обновляется автоматически'
              : 'Pass · Переговорные'}
          </span>
          <button
            aria-label="Настройки планшета"
            title="Настройки планшета"
            onClick={() => open('admin')}
          >
            <Settings size={22} />
          </button>
        </footer>
      )}
    </main>
  );
}
