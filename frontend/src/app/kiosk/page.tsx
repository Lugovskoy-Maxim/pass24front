'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CircleAlert,
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
  KioskPaymentSetup,
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
const SCHEDULE_REFRESH_MS = 15_000;
type Screen = 'status' | 'login' | 'booking' | 'payment' | 'admin';
type BookingReceipt = {
  statusLabel: string;
  bookingNumber?: string;
  cashDue: boolean;
};
function shiftBookingDate(date: string, days: number) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
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
  onQrStart,
}: {
  admin: boolean;
  deviceToken: string;
  onLogin: (session: KioskSession) => void;
  onCancel: () => void;
  onQrStart: () => void;
}) {
  const [method, setMethod] = useState<(typeof LOGIN_METHODS)[number]>(
    LOGIN_METHODS[0],
  );
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [qr, setQr] = useState<KioskLoginChallenge | null>(null);
  const passwordHeading = useRef<HTMLHeadingElement>(null);
  const returningFromQr = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (qr || !returningFromQr.current) return;
    returningFromQr.current = false;
    passwordHeading.current?.focus({ preventScroll: true });
  }, [qr]);
  async function startQr() {
    if (busy) return;
    setBusy(true);
    setPassword('');
    setError('');
    try {
      const challenge = await kioskApi.startLogin(deviceToken);
      if (active.current) {
        setQr(challenge);
        onQrStart();
      }
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
        key={qr.claimCode}
        challenge={qr}
        deviceToken={deviceToken}
        onBack={() => {
          returningFromQr.current = true;
          setQr(null);
        }}
        onLogin={onLogin}
        onRefresh={startQr}
        refreshing={busy}
        refreshError={error}
      />
    );
  return (
    <section className="kiosk-panel kiosk-login kiosk-stack">
      <button className="kiosk-back" onClick={onCancel}>
        <ArrowLeft size={20} />
        Назад
      </button>
      <h1 ref={passwordHeading} tabIndex={-1}>
        {admin ? 'Настройка планшета' : 'Войдите для бронирования'}
      </h1>
      {!admin && deviceToken && (
        <button
          className="btn btn-secondary kiosk-qr-button"
          disabled={busy}
          onClick={() => void startQr()}
        >
          <QrCode size={22} aria-hidden="true" />
          {busy && !password ? 'Подготавливаем QR…' : 'Войти по QR-коду'}
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
  onRefresh,
  refreshing,
  refreshError,
}: {
  challenge: KioskLoginChallenge;
  deviceToken: string;
  onBack: () => void;
  onLogin: (session: KioskSession) => void;
  onRefresh: () => Promise<void>;
  refreshing: boolean;
  refreshError: string;
}) {
  const [state, setState] = useState<
    'waiting' | 'offline' | 'expired' | 'unauthorized'
  >('waiting');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
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
        setState('waiting');
      } catch (e) {
        if (!active) return;
        const status = getErrorStatus(e);
        if (status === 404 || status === 401) {
          setState(status === 404 ? 'expired' : 'unauthorized');
          return;
        }
        setState('offline');
      }
      timer = window.setTimeout(poll, 1800);
    }
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [challenge, deviceToken, onLogin]);
  return (
    <section className="kiosk-panel kiosk-checkout kiosk-stack kiosk-qr-login">
      <button className="kiosk-back" onClick={onBack}>
        <ArrowLeft size={20} /> Вход с паролем
      </button>
      <h1 ref={heading} tabIndex={-1}>
        Вход по QR-коду
      </h1>
      {state === 'expired' || state === 'unauthorized' ? (
        <>
          <p role="status">
            {state === 'expired'
              ? 'QR-код истёк. Получите новый код и отсканируйте его ещё раз.'
              : 'Планшет потерял доступ к QR-входу. Используйте пароль.'}
          </p>
          {refreshError && (
            <p className="kiosk-error" role="alert">
              {refreshError}
            </p>
          )}
          {state === 'expired' && (
            <button
              className="btn btn-primary"
              disabled={refreshing}
              onClick={() => void onRefresh()}
            >
              {refreshing ? 'Получаем код…' : 'Получить новый QR-код'}
            </button>
          )}
        </>
      ) : (
        <div className="kiosk-scan-layout">
          <div className="kiosk-qr">
            <QRCode
              value={`${window.location.origin}/kiosk/approve#${challenge.approvalCode}`}
              size={224}
              title="QR-код для входа в Pass"
            />
          </div>
          <div className="kiosk-scan-instructions">
            <p>
              Отсканируйте QR камерой телефона, сверьте код и подтвердите вход.
            </p>
            <strong className="kiosk-pair-code">{challenge.displayCode}</strong>
            <p role="status" className="kiosk-muted">
              {state === 'offline'
                ? 'Связь прервалась. Подключаемся снова…'
                : 'Ожидаем подтверждение с телефона'}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function Setup({
  session,
  deviceToken,
  boundRoomId,
  onBound,
  onReset,
  onExit,
}: {
  session: KioskSession;
  deviceToken: string;
  boundRoomId?: number;
  onBound: (token: string) => void;
  onReset: () => void;
  onExit: () => void;
}) {
  const [rooms, setRooms] = useState<{ id: number; title: string }[]>([]);
  const [onlinePayment, setOnlinePayment] = useState<KioskPaymentSetup>();
  const [roomId, setRoomId] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [catalogStatus, setCatalogStatus] = useState<
    'loading' | 'loaded' | 'failed'
  >('loading');
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    let current = true;
    const timer = window.setTimeout(() => {
      void kioskApi
        .rooms(session.token)
        .then((r) => {
          if (current) {
            setRooms(r.rooms);
            setOnlinePayment(r.onlinePayment);
            setRoomId(
              r.rooms.find((room) => room.id === boundRoomId)?.id ??
                (r.rooms.length === 1 ? r.rooms[0].id : 0),
            );
            setCatalogStatus('loaded');
          }
        })
        .catch((e) => {
          if (current) {
            setError(getErrorMessage(e));
            setCatalogStatus('failed');
          }
        });
    }, 0);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [session.token, boundRoomId, catalogAttempt]);
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
  const paymentSetupMessage = {
    configured:
      'Настройки заполнены. Для проверки оплаты нужен тестовый платёж.',
    incomplete: 'Оплата выключена или не заданы данные магазина.',
    capture_required:
      'В настройках ЮKassa нужно включить автоматическое списание.',
    unavailable: 'Pass не смог прочитать настройки оплаты.',
  };
  return (
    <section className="kiosk-panel kiosk-stack kiosk-login">
      <h1 tabIndex={-1}>Привязка к переговорной</h1>
      <p className="kiosk-muted">
        Планшет показывает расписание только выбранной комнаты. Аккаунт
        администратора на устройстве не сохраняется.
      </p>
      {error && (
        <p role="alert" className="kiosk-error">
          {error}
        </p>
      )}
      {catalogStatus === 'loading' && (
        <p role="status">Загружаем переговорные…</p>
      )}
      {catalogStatus === 'failed' && (
        <button
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => {
            setError('');
            setCatalogStatus('loading');
            setCatalogAttempt((attempt) => attempt + 1);
          }}
        >
          Повторить загрузку
        </button>
      )}
      {catalogStatus === 'loaded' &&
        (rooms.length ? (
          <div>
            <label htmlFor="kiosk-setup-room">Переговорная</label>
            <select
              id="kiosk-setup-room"
              className="input"
              value={roomId}
              disabled={busy}
              onChange={(e) => setRoomId(Number(e.target.value))}
            >
              <option value={0}>Выберите переговорную</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                  {r.id === boundRoomId ? ' · текущая' : ''}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p role="status">Для этого аккаунта нет доступных переговорных.</p>
        ))}
      {catalogStatus === 'loaded' && rooms.length > 0 && (
        <button
          className="btn btn-primary"
          disabled={busy || !roomId}
          onClick={() => void save()}
        >
          {busy ? 'Сохранение…' : 'Привязать планшет'}
        </button>
      )}
      {deviceToken && (
        <button
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void save(true)}
        >
          Отозвать доступ планшета
        </button>
      )}
      {catalogStatus === 'loaded' && onlinePayment && (
        <details className="kiosk-payment-diagnostic">
          <summary>Настройки ЮKassa</summary>
          <p>{paymentSetupMessage[onlinePayment]}</p>
        </details>
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
  initialDate,
  onExit,
  onSuccess,
  onPayment,
}: {
  session: KioskSession;
  status: KioskStatus;
  connected: boolean;
  initialDate?: string;
  onExit: () => void;
  onSuccess: (receipt: BookingReceipt) => void;
  onPayment: (payment: KioskPayment) => void;
}) {
  const offices = session.user.offices || [];
  const [officeId, setOfficeId] = useState(offices[0]?.id || '');
  const [selectedDate, setSelectedDate] = useState(initialDate || status.date);
  const date = selectedDate < status.date ? status.date : selectedDate;
  const isToday = date === status.date;
  const tomorrowDate = shiftBookingDate(status.date, 1);
  const [context, setContext] = useState<BookingContext | null>(null);
  const [slots, setSlots] = useState<KioskSlot[]>([]);
  const [slotRefreshFailed, setSlotRefreshFailed] = useState(false);
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
  const [submissionError, setSubmissionError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const summary = useRef<HTMLHeadingElement>(null);
  const [summaryVisible, setSummaryVisible] = useState(false);
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
    setSlotRefreshFailed(false);
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
  const canRefreshSlots = !!room;
  useEffect(() => {
    if (!canRefreshSlots) return;
    let active = true;
    let timer: number;
    async function refresh() {
      try {
        const result = await kioskApi.slots(
          session.token,
          officeId,
          status.room.id,
          date,
        );
        if (!active) return;
        setSlots(result.slots);
        setSlotRefreshFailed(false);
      } catch (e) {
        if (!active) return;
        if (getErrorStatus(e) === 401) {
          onExit();
          return;
        }
        setSlotRefreshFailed(true);
      }
      timer = window.setTimeout(refresh, SCHEDULE_REFRESH_MS);
    }
    timer = window.setTimeout(refresh, SCHEDULE_REFRESH_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    canRefreshSlots,
    session.token,
    officeId,
    status.room.id,
    date,
    availabilityKey,
    onExit,
  ]);
  const hasSelection = loaded && start >= 0;
  useEffect(() => {
    if (
      !hasSelection ||
      !summary.current ||
      !('IntersectionObserver' in window)
    ) {
      setSummaryVisible(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setSummaryVisible(entry.isIntersecting);
      },
      { rootMargin: '0px 0px -72px' },
    );
    observer.observe(summary.current);
    return () => observer.disconnect();
  }, [hasSelection]);
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
  const currentSubmissionError = retry
    ? 'Статус бронирования пока неизвестен. Проверьте его повторно.'
    : submissionError?.key === key
      ? submissionError.message
      : '';
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
  const upcomingSlots = slots
    .filter((slot) => slot.start_minute > serverMinute)
    .map((slot) => ({
      ...slot,
      selectable:
        slot.state === 'free' &&
        kioskRangeFree(availableSlots, slot.start_minute, slot.end_minute),
    }));
  const slotGroups = [
    { label: 'Утро', from: 0, to: 720 },
    { label: 'День', from: 720, to: 1080 },
    { label: 'Вечер', from: 1080, to: 1440 },
  ]
    .map(({ label, from, to }) => ({
      label,
      slots: upcomingSlots.filter(
        (slot) => slot.start_minute >= from && slot.start_minute < to,
      ),
    }))
    .filter((group) => group.slots.length);
  const hasAvailableSlots = upcomingSlots.some((slot) => slot.selectable);
  const free =
    kioskRangeFree(slots, start, end) &&
    kioskRangeFree(availableSlots, start, end);
  const dateLabel = new Date(`${date}T12:00:00+03:00`).toLocaleDateString(
    'ru-RU',
    { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' },
  );
  function shiftDate(days: number) {
    setSelectedDate(shiftBookingDate(date, days));
  }
  const valid =
    !!room &&
    free &&
    start > serverMinute &&
    connected &&
    !slotRefreshFailed &&
    context?.mode === 'pass';
  async function submit() {
    if ((!valid && !retry) || working.current) return;
    let command = retry;
    working.current = true;
    setBusy(true);
    setSubmissionError(null);
    const submittedKey = key;
    try {
      if (!command && currentQuote) {
        const nonce = crypto.getRandomValues(new Uint8Array(16));
        command = {
          draft: {
            ...draft,
            pricingFingerprint: currentQuote.pricing_fingerprint,
          },
          key: Array.from(nonce, (byte) =>
            byte.toString(16).padStart(2, '0'),
          ).join(''),
        };
      }
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
            bookingNumber: result.booking.number,
            token: result.payment.payment_token,
            amount: result.booking.total_amount_minor,
          });
        } else {
          onSuccess({
            statusLabel: result.booking.status_label,
            bookingNumber: result.booking.number,
            cashDue:
              command.draft.paymentMethod === 'cash' &&
              result.booking.status === 'awaiting_payment',
          });
        }
      }
    } catch (e) {
      if (alive.current) {
        const status = getErrorStatus(e);
        if (status === 401) onExit();
        else {
          if (command && (isNetworkError(e) || (status ?? 0) >= 500)) {
            setRetry(command);
          } else {
            setRetry(null);
            setSubmissionError({
              key: submittedKey,
              message: getErrorMessage(e),
            });
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
      <h1 tabIndex={-1}>Бронирование</h1>
      <div
        className={`kiosk-booking-grid${loaded && start >= 0 ? ' has-summary' : ''}`}
      >
        <div className="kiosk-panel kiosk-stack">
          <div className="kiosk-booking-fields">
            <div>
              <label htmlFor="kiosk-booking-office">Ваш офис</label>
              <select
                id="kiosk-booking-office"
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
            </div>
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
              <div
                className="kiosk-quick-dates"
                role="group"
                aria-label="Быстрый выбор даты"
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  aria-pressed={isToday}
                  disabled={busy || !!retry}
                  onClick={() => setSelectedDate(status.date)}
                >
                  Сегодня
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  aria-pressed={date === tomorrowDate}
                  disabled={busy || !!retry}
                  onClick={() => setSelectedDate(tomorrowDate)}
                >
                  Завтра
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
              {hasAvailableSlots && (
                <p className="kiosk-muted">
                  Нажмите свободный интервал. Чтобы продлить бронь, нажмите
                  последний интервал нужного времени.
                </p>
              )}
              {slotRefreshFailed && (
                <p role="status" className="kiosk-error">
                  Не удалось обновить интервалы. Киоск повторит запрос
                  автоматически.
                </p>
              )}
              {slotGroups.map(({ label, slots: group }) => (
                <div
                  key={label}
                  className="kiosk-slot-group"
                  role="group"
                  aria-label={label}
                >
                  {slotGroups.length > 1 && <h3>{label}</h3>}
                  <div className="kiosk-slots">
                    {group.map((s) => {
                      const selected =
                        s.start_minute >= start && s.end_minute <= end;
                      return (
                        <button
                          key={s.start_minute}
                          className={`btn ${selected ? 'btn-primary' : 'btn-secondary'}`}
                          disabled={
                            !s.selectable ||
                            busy ||
                            !!retry ||
                            !connected ||
                            slotRefreshFailed
                          }
                          aria-pressed={selected}
                          aria-label={`${kioskTime(s.start_minute)}–${kioskTime(s.end_minute)}${s.selectable ? '' : ', недоступно'}`}
                          onClick={() => {
                            if (
                              s.start_minute === start &&
                              s.end_minute === end
                            ) {
                              setStart(-1);
                              setEnd(-1);
                            } else if (
                              end - start !== step ||
                              !kioskRangeFree(slots, start, s.end_minute) ||
                              !kioskRangeFree(
                                availableSlots,
                                start,
                                s.end_minute,
                              )
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
                </div>
              ))}
              {!hasAvailableSlots && (
                <p>На выбранный день свободных интервалов нет.</p>
              )}
              {upcomingSlots.length > 0 && (
                <p className="kiosk-small kiosk-muted">
                  Недоступные интервалы затемнены. Время московское.
                </p>
              )}
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
        {(error || (retry && !hasSelection)) && (
          <div className="kiosk-error" role="alert">
            {error || currentSubmissionError}{' '}
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
            <h2 ref={summary} tabIndex={-1}>
              Ваша бронь
            </h2>
            <p>
              {status.room.title} · {dateLabel}
            </p>
            <p className="kiosk-selection">
              <Clock3 size={22} />
              {kioskTime(start)}–{kioskTime(end)} · {end - start} мин
            </p>
            {currentQuote?.total_amount_minor !== 0 && (
              <div>
                <label htmlFor="kiosk-booking-payment">Способ оплаты</label>
                <select
                  id="kiosk-booking-payment"
                  className="input"
                  value={paymentMethod}
                  disabled={busy || !!retry}
                  onChange={(e) => {
                    setPaymentMethod(e.target.value);
                    setQuote(null);
                  }}
                >
                  <option value="card_online">
                    Картой на телефоне · ЮKassa
                  </option>
                  <option value="cash">Наличными</option>
                </select>
              </div>
            )}
            {(!free || start <= serverMinute) && (
              <p role="alert" className="kiosk-error">
                Выбранное время больше недоступно. Выберите другой интервал.
              </p>
            )}
            {currentQuote && (
              <div className="kiosk-quote" role="status">
                <dl>
                  {currentQuote.discount_minor > 0 && (
                    <>
                      <div>
                        <dt>Стоимость по тарифу</dt>
                        <dd>{officeMoney(currentQuote.base_amount_minor)}</dd>
                      </div>
                      <div>
                        <dt>Скидка</dt>
                        <dd>−{officeMoney(currentQuote.discount_minor)}</dd>
                      </div>
                    </>
                  )}
                  {currentQuote.writeoff_min > 0 && (
                    <div>
                      <dt>Спишем из бесплатных минут</dt>
                      <dd>{currentQuote.writeoff_min} мин</dd>
                    </div>
                  )}
                  <div className="kiosk-quote-total">
                    <dt>
                      {currentQuote.total_amount_minor === 0
                        ? 'Оплата не требуется'
                        : 'К оплате'}
                    </dt>
                    <dd>{officeMoney(currentQuote.total_amount_minor)}</dd>
                  </div>
                </dl>
              </div>
            )}
            {currentSubmissionError && (
              <p className="kiosk-error" role="alert">
                {currentSubmissionError}
              </p>
            )}
            <button
              className="btn btn-primary"
              disabled={(!valid && !retry) || busy}
              onClick={() => void submit()}
            >
              {busy
                ? 'Подождите…'
                : retry
                  ? 'Проверить бронирование'
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
      {hasSelection && !summaryVisible && (
        <div className="kiosk-booking-jump">
          <button
            className="btn btn-secondary"
            onClick={() => {
              summary.current?.focus({ preventScroll: true });
              summary.current?.scrollIntoView({ block: 'start' });
            }}
          >
            <span>
              {kioskTime(start)}–{kioskTime(end)}
            </span>
            К оформлению <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      )}
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
  const checkout =
    pending && status?.confirmationUrl?.startsWith('https://')
      ? status.confirmationUrl
      : null;
  const preparationMessage = {
    expired: 'Время оплаты вышло. Проверяем окончательный статус брони.',
    contact_required:
      'Для чека нужен подтверждённый телефон или почта в профиле Pass.',
    retrying: 'ЮKassa пока не создала платёж. Сервер повторяет запрос.',
  };
  const paymentState = (
    <p
      role="status"
      className={
        pending && status?.preparation === 'contact_required'
          ? 'kiosk-error'
          : 'kiosk-muted'
      }
    >
      {connectionError
        ? 'Не удалось проверить статус. Повторяем запрос…'
        : status && status.state !== 'pending'
          ? `Статус брони: ${status.statusLabel}`
          : status?.preparation
            ? preparationMessage[status.preparation]
            : checkout
              ? 'Ожидаем подтверждение оплаты'
              : 'Подготавливаем оплату…'}
    </p>
  );
  return (
    <section className="kiosk-panel kiosk-checkout kiosk-stack kiosk-scan-panel">
      {pending ? (
        <CreditCard size={30} aria-hidden="true" />
      ) : status.state === 'paid' ? (
        <CheckCircle2
          className="kiosk-payment-success"
          size={36}
          aria-hidden="true"
        />
      ) : (
        <CircleAlert size={36} aria-hidden="true" />
      )}
      <h1 tabIndex={-1}>
        {pending
          ? 'Оплата бронирования'
          : status.state === 'paid'
            ? 'Оплата получена'
            : 'Платёж не состоялся'}
      </h1>
      {payment.bookingNumber && (
        <p className="kiosk-booking-reference">Бронь {payment.bookingNumber}</p>
      )}
      {checkout ? (
        <div className="kiosk-scan-layout">
          <div className="kiosk-qr">
            <QRCode
              value={checkout}
              size={224}
              title="QR-код для оплаты в ЮKassa"
            />
          </div>
          <div className="kiosk-scan-instructions">
            <p className="kiosk-price">{officeMoney(payment.amount)}</p>
            <p>Отсканируйте QR камерой телефона и оплатите бронь в ЮKassa.</p>
            {paymentState}
          </div>
        </div>
      ) : (
        <>
          <p className="kiosk-price">{officeMoney(payment.amount)}</p>
          {paymentState}
        </>
      )}
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
  const [initialDate, setInitialDate] = useState<string>();
  const [session, setSession] = useState<KioskSession | null>(null);
  const [payment, setPayment] = useState<KioskPayment | null>(null);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [roomUnavailable, setRoomUnavailable] = useState(false);
  const refreshStatus = useRef<(() => Promise<void>) | null>(null);
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  const [receipt, setReceipt] = useState<BookingReceipt | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [remaining, setRemaining] = useState(60);
  const kioskRoot = useRef<HTMLElement>(null);
  const settingsControl = useRef<HTMLButtonElement>(null);
  const bookControl = useRef<HTMLButtonElement>(null);
  const tomorrowControl = useRef<HTMLButtonElement>(null);
  const previousScreen = useRef<Screen>('status');
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
  const settingUp = screen === 'admin' && !!session;
  useEffect(() => {
    const previous = previousScreen.current;
    previousScreen.current = screen;
    if (screen === 'status' && previous === 'status') return;
    window.scrollTo(0, 0);
    const returnControl =
      screen === 'status'
        ? previous === 'admin'
          ? settingsControl.current
          : initialDate
            ? tomorrowControl.current
            : bookControl.current
        : null;
    const target =
      returnControl && !returnControl.disabled
        ? returnControl
        : kioskRoot.current?.querySelector<HTMLElement>('h1');
    target?.focus({ preventScroll: true });
  }, [screen, settingUp, initialDate]);
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
      setRefreshing(true);
      try {
        const data = await kioskApi.status(deviceToken);
        if (active) {
          setStatus(data);
          setOffset(Date.parse(data.serverTime) - Date.now());
          setLastUpdate(Date.now());
          setRoomUnavailable(false);
          setError('');
        }
      } catch (e) {
        if (active) {
          const httpStatus = getErrorStatus(e);
          setLastUpdate(0);
          setRoomUnavailable(httpStatus === 404);
          if (httpStatus === 401) {
            try {
              localStorage.removeItem(DEVICE_KEY);
            } catch {
              // Revoked access is cleared from the current session even if storage is blocked.
            }
            setDeviceToken('');
            setError(
              'Доступ планшета отозван. Войдите как администратор и привяжите его снова.',
            );
          } else {
            setError(
              httpStatus === 404
                ? 'Переговорная больше недоступна. Откройте настройки, чтобы выбрать другую.'
                : getErrorMessage(e),
            );
          }
          if (httpStatus === 401 || httpStatus === 404) {
            setStatus(null);
            finish();
          }
        }
      } finally {
        fetching = false;
        if (active) setRefreshing(false);
      }
    };
    refreshStatus.current = refresh;
    const initial = window.setTimeout(refresh, 0);
    const timer = window.setInterval(() => void refresh(), SCHEDULE_REFRESH_MS);
    window.addEventListener('online', refresh);
    return () => {
      active = false;
      refreshStatus.current = null;
      window.clearTimeout(initial);
      window.clearInterval(timer);
      window.removeEventListener('online', refresh);
    };
  }, [deviceToken, finish, receipt]);
  useEffect(() => {
    if (!receipt) return;
    const timer = window.setTimeout(() => setReceipt(null), 12_000);
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
    setError('');
    setRoomUnavailable(false);
    setStatus(null);
    setLastUpdate(0);
    finish();
  }
  function reset() {
    try {
      localStorage.removeItem(DEVICE_KEY);
    } catch {
      // The server has already revoked this device token.
    }
    setDeviceToken('');
    setError('');
    setRoomUnavailable(false);
    setStatus(null);
    setLastUpdate(0);
    finish();
  }
  function open(next: Screen, date?: string) {
    deadline.current = Date.now() + IDLE_MS;
    setRemaining(60);
    setSession(null);
    setPayment(null);
    setReceipt(null);
    setInitialDate(date);
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
    !status && !error
      ? 'Загружаем расписание'
      : !connected || status?.date !== today
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
  const currentPeriod = schedule.find(
    (s) => s.start_minute <= minute && s.end_minute > minute,
  );
  const liveSchedule = connected && status?.date === today;
  const hasFutureSlotToday = status?.slots.some(
    (slot) => slot.state === 'free' && slot.start_minute > minute,
  );
  const nextFree =
    liveSchedule &&
    schedule.find((s) => s.state === 'free' && s.start_minute > minute);
  const workStart = schedule[0]?.start_minute ?? 0;
  const workEnd = schedule.at(-1)?.end_minute ?? 0;
  const workSpan = workEnd - workStart;
  return (
    <main
      ref={kioskRoot}
      className={`kiosk kiosk-screen-${screen}`}
      onPointerDownCapture={(event) => {
        if (!(
          event.target instanceof Element &&
          event.target.closest('.kiosk-idle button')
        ))
          touch();
      }}
      onKeyDownCapture={(event) => {
        if (!(
          event.target instanceof Element &&
          event.target.closest('.kiosk-idle button')
        ))
          touch();
      }}
      onInputCapture={touch}
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
          <strong>{ready ? clock : '—:—'}</strong>
          <span>
            {ready
              ? `${current.toLocaleDateString('ru-RU', {
                  timeZone: 'Europe/Moscow',
                  day: 'numeric',
                  month: 'long',
                })} · МСК`
              : 'МСК'}
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
                  <strong>Бронирование создано · {receipt.statusLabel}</strong>
                  {receipt.bookingNumber && (
                    <p className="kiosk-booking-reference">
                      Бронь {receipt.bookingNumber}
                    </p>
                  )}
                  {receipt.cashDue && (
                    <p>
                      Оплатите наличными у администратора. Он отметит получение
                      оплаты.
                    </p>
                  )}
                  <p>Вы вышли из аккаунта.</p>
                </div>
              </div>
            )}
            {error && (screen === 'status' || screen === 'booking') && (
              <div className="kiosk-error" role="alert">
                <WifiOff size={20} />
                <span>
                  {error}{' '}
                  {deviceToken &&
                    !roomUnavailable &&
                    'Повторяем подключение каждые 15 секунд.'}
                </span>
                {screen === 'status' && deviceToken && !roomUnavailable && (
                  <button
                    className="kiosk-back"
                    disabled={refreshing}
                    onClick={() => void refreshStatus.current?.()}
                  >
                    {refreshing ? 'Подключаемся…' : 'Повторить сейчас'}
                  </button>
                )}
              </div>
            )}
            {screen === 'status' &&
              (!deviceToken ? (
                <section className="kiosk-panel kiosk-stack">
                  <h1 tabIndex={-1}>Настройте планшет</h1>
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
                  <section
                    className={`kiosk-availability ${liveSchedule && currentSlot ? (available ? 'is-free' : 'is-busy') : ''}`}
                  >
                    <h1 className="kiosk-state" tabIndex={-1}>
                      <span aria-hidden="true" />
                      {state}
                    </h1>
                    {liveSchedule &&
                      currentPeriod &&
                      (available ||
                        !nextFree ||
                        nextFree.start_minute !== currentPeriod.end_minute) && (
                        <p className="kiosk-until">
                          До {kioskTime(currentPeriod.end_minute)} ·{' '}
                          {currentPeriod.end_minute - minute} мин
                        </p>
                      )}
                    {nextFree && !available && (
                      <p className="kiosk-next-free">
                        Следующее свободное время с{' '}
                        <strong>{kioskTime(nextFree.start_minute)}</strong>
                      </p>
                    )}
                    {liveSchedule && !hasFutureSlotToday && (
                      <p className="kiosk-muted">
                        На сегодня свободных интервалов нет.
                      </p>
                    )}
                    <div className="kiosk-dashboard-actions">
                      <button
                        className="btn btn-primary"
                        ref={bookControl}
                        disabled={!liveSchedule}
                        onClick={() => open('login')}
                      >
                        Забронировать
                        <ArrowRight size={22} aria-hidden="true" />
                      </button>
                      <button
                        className="btn btn-secondary"
                        ref={tomorrowControl}
                        disabled={!liveSchedule}
                        onClick={() =>
                          open('login', shiftBookingDate(today, 1))
                        }
                      >
                        <CalendarDays size={18} aria-hidden="true" />
                        На завтра
                      </button>
                    </div>
                  </section>
                  <section className="kiosk-panel kiosk-stack">
                    <h2>
                      <CalendarDays size={24} />
                      Расписание на сегодня
                    </h2>
                    {!status && !error && (
                      <p role="status">Загрузка расписания…</p>
                    )}
                    {status && !status.slots.length && (
                      <p>Рабочие интервалы не заданы.</p>
                    )}
                    {workSpan > 0 && (
                      <div className="kiosk-timeline" aria-hidden="true">
                        <div className="kiosk-timeline-track">
                          {schedule.map((period) => (
                            <span
                              key={period.start_minute}
                              className={`kiosk-timeline-segment ${period.state === 'free' ? 'is-free' : 'is-busy'}`}
                              style={{
                                left: `${(100 * (period.start_minute - workStart)) / workSpan}%`,
                                width: `${(100 * (period.end_minute - period.start_minute)) / workSpan}%`,
                              }}
                            />
                          ))}
                          {liveSchedule &&
                            minute >= workStart &&
                            minute < workEnd && (
                              <span
                                className="kiosk-timeline-now"
                                style={{
                                  left: `${(100 * (minute - workStart)) / workSpan}%`,
                                }}
                              />
                            )}
                        </div>
                        <div className="kiosk-timeline-labels">
                          <span>{kioskTime(workStart)}</span>
                          <span>{kioskTime(workEnd)}</span>
                        </div>
                      </div>
                    )}
                    <div
                      className={`kiosk-schedule ${!connected ? 'is-stale' : ''}`}
                    >
                      {schedule.map((s) => (
                        <div
                          key={s.start_minute}
                          className={`kiosk-schedule-row ${s.state === 'free' ? 'is-free' : ''}`}
                          aria-current={
                            liveSchedule && s === currentPeriod
                              ? 'time'
                              : undefined
                          }
                        >
                          <span>
                            {kioskTime(s.start_minute)}–
                            {kioskTime(s.end_minute)}
                          </span>
                          <strong>
                            {liveSchedule && s === currentPeriod && 'Сейчас · '}
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
                onQrStart={() => {
                  deadline.current = Date.now() + IDLE_MS + 15_000;
                  setRemaining(75);
                }}
              />
            )}
            {screen === 'admin' && session && (
              <Setup
                session={session}
                deviceToken={deviceToken}
                boundRoomId={status?.room.id}
                onBound={bind}
                onReset={reset}
                onExit={finish}
              />
            )}
            {screen === 'booking' && session && status && (
              <Booking
                session={session}
                status={{ ...status, serverTime: current.toISOString() }}
                initialDate={initialDate}
                connected={connected && status.date === today}
                onExit={finish}
                onPayment={(value) => {
                  deadline.current = Date.now() + 3 * IDLE_MS;
                  setRemaining(180);
                  setSession(null);
                  setPayment(value);
                  setScreen('payment');
                }}
                onSuccess={(result) => {
                  finish();
                  setReceipt(result);
                }}
              />
            )}
            {screen === 'payment' && payment && (
              <Payment payment={payment} onExit={finish} />
            )}
            {screen !== 'status' && screen !== 'payment' && remaining <= 15 && (
              <div className="kiosk-idle">
                <p>
                  <span role="status">Сессия скоро завершится.</span>{' '}
                  <span aria-hidden="true">{remaining} сек.</span>
                </p>
                <button
                  className="btn btn-secondary"
                  onClick={(event) => {
                    touch();
                    if (event.detail === 0)
                      kioskRoot.current
                        ?.querySelector('h1')
                        ?.focus({ preventScroll: true });
                  }}
                >
                  Продолжить
                </button>
              </div>
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
            ref={settingsControl}
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
