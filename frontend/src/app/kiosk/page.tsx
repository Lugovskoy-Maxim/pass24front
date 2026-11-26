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
import { normalizeRuMobilePhone } from '@/lib/phone';
import {
  kioskApi,
  kioskRangeFree,
  kioskStandbyVideoUrl,
  kioskTime,
  KioskBookingContext,
  KioskLoginChallenge,
  KioskPayment,
  KioskPaymentSetup,
  KioskPaymentStatus,
  KioskSession,
  KioskSlot,
  KioskStatus,
} from '@/lib/kiosk';
import { BookingDraft, BookingQuote, officeMoney } from '@/lib/office-services';
import { SiteBrand } from '@/components/SiteBrand';
import { MSTYLE_BRAND_DEFAULTS, resolveSiteIcon } from '@/lib/brand-defaults';
import { useConfig } from '@/hooks/useConfig';
import './kiosk.css';

const minutePlural = new Intl.PluralRules('ru');
function durationLabel(minutes: number) {
  const form = minutePlural.select(minutes);
  return `${minutes} ${form === 'one' ? 'минута' : form === 'few' ? 'минуты' : 'минут'}`;
}

const DEVICE_KEY = 'pass24_kiosk_device';
const IDLE_MS = 60_000;
const STANDBY_IDLE_MS = 45_000;
const MIN_BOOKING_MINUTES = 60;
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

const weekdayLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const calendarDateLabel = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'full',
  timeZone: 'UTC',
});
const calendarMonthLabel = new Intl.DateTimeFormat('ru-RU', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function BookingDates({
  today,
  date,
  disabled,
  onChange,
}: {
  today: string;
  date: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [month, setMonth] = useState<string | null>(null);
  const monthStart =
    month && month >= today.slice(0, 7) ? month : today.slice(0, 7);
  const first = new Date(`${monthStart}-01T00:00:00Z`);
  const previous = new Date(first);
  previous.setUTCMonth(first.getUTCMonth() - 1);
  const next = new Date(first);
  next.setUTCMonth(first.getUTCMonth() + 1);
  const last = new Date(+next - 86_400_000).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  const calendarToggle = useRef<HTMLButtonElement>(null);
  const choose = (value: string) => {
    onChange(value);
    if (month) calendarToggle.current?.focus({ preventScroll: true });
    setMonth(null);
  };

  return (
    <div
      className="kiosk-date-picker"
      role="group"
      aria-label="Дата бронирования"
    >
      <div className="kiosk-date-current">
        <strong>
          {calendarDateLabel.format(new Date(`${date}T00:00:00Z`))}
        </strong>
        <button
          ref={calendarToggle}
          type="button"
          className="btn btn-secondary"
          disabled={disabled}
          aria-expanded={!!month}
          aria-controls="kiosk-calendar"
          onClick={() => setMonth(month ? null : date.slice(0, 7))}
        >
          <CalendarDays size={19} aria-hidden="true" /> Календарь
        </button>
      </div>
      <div className="kiosk-date-week" role="group" aria-label="Ближайшие даты">
        {Array.from({ length: 7 }, (_, index) => {
          const value = shiftBookingDate(today, index);
          const day = new Date(`${value}T00:00:00Z`);
          return (
            <button
              key={value}
              type="button"
              className="btn btn-secondary"
              disabled={disabled}
              aria-label={calendarDateLabel.format(day)}
              aria-pressed={date === value}
              onClick={() => choose(value)}
            >
              <span>
                {index === 0
                  ? 'Сегодня'
                  : index === 1
                    ? 'Завтра'
                    : weekdayLabels[(day.getUTCDay() + 6) % 7]}
              </span>
              <strong>{day.getUTCDate()}</strong>
            </button>
          );
        })}
      </div>
      {month && (
        <div id="kiosk-calendar" className="kiosk-calendar">
          <div className="kiosk-calendar-nav">
            <button
              type="button"
              className="btn btn-secondary"
              aria-label="Предыдущий месяц"
              disabled={disabled || monthStart <= today.slice(0, 7)}
              onClick={() => setMonth(previous.toISOString().slice(0, 7))}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <strong aria-live="polite">
              {calendarMonthLabel.format(first)}
            </strong>
            <button
              type="button"
              className="btn btn-secondary"
              aria-label="Следующий месяц"
              disabled={disabled || next.getUTCFullYear() > 9999}
              onClick={() => setMonth(next.toISOString().slice(0, 7))}
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="kiosk-calendar-grid">
            {weekdayLabels.map((label) => (
              <span key={label} aria-hidden="true">
                {label}
              </span>
            ))}
            {Array.from({ length: last }, (_, index) => {
              const value = `${monthStart}-${String(index + 1).padStart(2, '0')}`;
              return (
                <button
                  key={value}
                  type="button"
                  className="btn btn-secondary"
                  disabled={disabled || value < today}
                  style={
                    index === 0 ? { gridColumnStart: offset + 1 } : undefined
                  }
                  aria-label={calendarDateLabel.format(
                    new Date(`${value}T00:00:00Z`),
                  )}
                  aria-pressed={date === value}
                  onClick={() => choose(value)}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
function groupSchedule(slots: KioskSlot[] = []) {
  return slots.reduce<KioskSlot[]>((rows, slot) => {
    const last = rows[rows.length - 1];
    if (last?.state === slot.state && last.end_minute === slot.start_minute) {
      last.end_minute = slot.end_minute;
    } else {
      rows.push({ ...slot });
    }
    return rows;
  }, []);
}
const LOGIN_METHODS = [
  {
    id: 'phone',
    label: 'Телефон',
    icon: Smartphone,
    hint: '+7 (900) 000-00-00',
    type: 'tel',
  },
  {
    id: 'login',
    label: 'Логин',
    icon: KeyRound,
    hint: 'Ваш логин в Pass',
    type: 'text',
  },
  {
    id: 'email',
    label: 'Почта',
    icon: Mail,
    hint: 'name@example.ru',
    type: 'email',
  },
] as const;

function kioskPhoneInput(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const national = /^[78]/.test(digits) ? digits.slice(1) : digits;
  return `+7${national.slice(0, 10)}`;
}

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
  const [sms, setSms] = useState(!admin && !!deviceToken);
  const [smsSent, setSmsSent] = useState(false);
  const [recover, setRecover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [qr, setQr] = useState<KioskLoginChallenge | null>(null);
  const passwordHeading = useRef<HTMLHeadingElement>(null);
  const returningFromQr = useRef(false);
  const active = useRef(true);
  const loginValue =
    method.id === 'phone' ? normalizeRuMobilePhone(login) : login.trim();
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
    if (busy || !loginValue) return;
    setBusy(true);
    setError('');
    try {
      if (sms && !smsSent) {
        await kioskApi.requestSms(deviceToken, loginValue);
        if (active.current) setSmsSent(true);
      } else {
        const result = sms
          ? await kioskApi.confirmSms(deviceToken, loginValue, password)
          : await kioskApi.login(loginValue, password);
        if (active.current) onLogin(result);
      }
    } catch (e) {
      if (active.current) setError(getErrorMessage(e));
    } finally {
      if (active.current) {
        setPassword('');
        setBusy(false);
      }
    }
  }
  if (recover)
    return (
      <section className="kiosk-panel kiosk-login kiosk-stack">
        <button className="kiosk-back" onClick={() => setRecover(false)}>
          <ArrowLeft size={20} /> Назад
        </button>
        <h1 tabIndex={-1}>Восстановление пароля</h1>
        <div className="kiosk-qr">
          <QRCode
            value={new URL('/login?mode=forgot', window.location.origin).href}
            size={224}
            title="QR-код для восстановления пароля Pass"
          />
        </div>
        <p>
          Отсканируйте QR-код камерой телефона, чтобы восстановить пароль Pass.
        </p>
      </section>
    );
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
                  setPassword('');
                  setSms(option.id === 'phone' && !admin && !!deviceToken);
                  setSmsSent(false);
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
            onChange={(e) =>
              setLogin(
                method.id === 'phone'
                  ? kioskPhoneInput(e.target.value)
                  : e.target.value,
              )
            }
            disabled={busy || smsSent}
          />
        </label>
        {(!sms || smsSent) && (
          <label>
            {sms ? 'Код из СМС' : 'Пароль'}
            <input
              className="input"
              name="kiosk-password"
              type={sms ? 'text' : 'password'}
              inputMode={sms ? 'numeric' : undefined}
              maxLength={sms ? 6 : undefined}
              pattern={sms ? '[0-9]{6}' : undefined}
              required
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>
        )}
        {smsSent && (
          <p role="status">
            Если для номера доступен вход, мы отправили СМС с кодом.
          </p>
        )}
        {error && (
          <p className="kiosk-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="btn btn-primary"
          disabled={busy || !loginValue || (!password && (!sms || smsSent))}
        >
          {busy ? 'Подождите…' : sms && !smsSent ? 'Получить код' : 'Войти'}
        </button>
        {!admin && deviceToken && method.id === 'phone' && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => {
              setSms(!sms);
              setSmsSent(false);
              setPassword('');
              setError('');
            }}
          >
            {sms ? 'Войти с паролем' : 'Войти по СМС'}
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => {
            setPassword('');
            setError('');
            setRecover(true);
          }}
        >
          Забыли пароль?
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
  const [context, setContext] = useState<KioskBookingContext | null>(null);
  const [slots, setSlots] = useState<KioskSlot[]>([]);
  const [slotRefreshFailed, setSlotRefreshFailed] = useState(false);
  const [start, setStart] = useState(-1);
  const [end, setEnd] = useState(-1);
  const [useHours, setUseHours] = useState(false);
  const [preferredPayment, setPaymentMethod] = useState('card_online');
  const cardAvailable = context?.onlinePayment === 'configured';
  const paymentMethod = cardAvailable ? preferredPayment : 'cash';
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
    void (async () => {
      const nextContext = await kioskApi.context(session.token, officeId);
      if (!active) return;
      setContext(nextContext);
      if (
        nextContext.bookingProfileReady !== false &&
        nextContext.rooms.some((room) => room.id === status.room.id)
      ) {
        const result = await kioskApi.slots(
          session.token,
          officeId,
          status.room.id,
          date,
        );
        if (!active) return;
        setSlots(result.slots);
      }
      setLoadedKey(availabilityKey);
    })()
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
  const room =
    loaded && context?.bookingProfileReady !== false
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
    .map((slot) => {
      const minimumEnd = slots.find(
        (item) => item.end_minute >= slot.start_minute + MIN_BOOKING_MINUTES,
      )?.end_minute;
      const canStart =
        minimumEnd !== undefined &&
        kioskRangeFree(slots, slot.start_minute, minimumEnd) &&
        kioskRangeFree(availableSlots, slot.start_minute, minimumEnd);
      const canExtend =
        start >= 0 &&
        slot.end_minute > end &&
        kioskRangeFree(slots, start, slot.end_minute) &&
        kioskRangeFree(availableSlots, start, slot.end_minute);
      return {
        ...slot,
        minimumEnd,
        canStart,
        canExtend,
        selectable: canStart || canExtend || slot.start_minute === start,
      };
    });
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
  const valid =
    !!room &&
    free &&
    end - start >= MIN_BOOKING_MINUTES &&
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
            <BookingDates
              today={status.date}
              date={date}
              disabled={busy || !!retry}
              onChange={setSelectedDate}
            />
          </div>
          {!offices.length && (
            <p role="alert">
              Для бронирования нужен назначенный офис. Обратитесь к
              администратору.
            </p>
          )}
          {loading && <p role="status">Загрузка свободного времени…</p>}
          {loaded && context?.bookingProfileReady === false && (
            <div className="kiosk-panel kiosk-stack">
              <h2>Заполните профиль для бронирования</h2>
              <p>
                Для брони нужен подтверждённый телефон или адрес электронной
                почты.
              </p>
              <div className="kiosk-qr">
                <QRCode
                  value={
                    new URL(
                      '/login?next=%2Fprofile%23booking-contact',
                      window.location.origin,
                    ).href
                  }
                  size={224}
                  title="QR-код для заполнения профиля Pass"
                />
              </div>
              <p>Отсканируйте код, чтобы открыть профиль на телефоне.</p>
              <button
                className="btn btn-primary"
                onClick={() => setRevision((value) => value + 1)}
              >
                Проверить профиль
              </button>
            </div>
          )}
          {loaded &&
            !loading &&
            context &&
            context.bookingProfileReady !== false &&
            !room && (
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
                  Выберите время начала. Минимальная длительность брони — 1 час.
                  Чтобы продлить бронь, нажмите последний нужный интервал.
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
                            if (s.start_minute === start) {
                              setStart(-1);
                              setEnd(-1);
                            } else if (s.canExtend) {
                              setEnd(s.end_minute);
                            } else if (
                              s.canStart &&
                              s.minimumEnd !== undefined
                            ) {
                              setStart(s.start_minute);
                              setEnd(s.minimumEnd);
                            }
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
                  {durationLabel(context.availableMinutes)}
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
              {kioskTime(start)}–{kioskTime(end)} · {durationLabel(end - start)}
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
                  {cardAvailable && (
                    <option value="card_online">
                      Картой на телефоне · ЮKassa
                    </option>
                  )}
                  <option value="cash">Наличными</option>
                </select>
                {!cardAvailable && (
                  <p className="kiosk-muted">
                    Оплата картой временно недоступна.
                  </p>
                )}
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
                      <dd>{durationLabel(currentQuote.writeoff_min)}</dd>
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

function KioskStandby({
  logoSrc,
  onWake,
}: {
  logoSrc: string;
  onWake: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [videoVersion, setVideoVersion] = useState<string | null>(null);
  const [failedVersion, setFailedVersion] = useState<string>();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (visible) return;
    let timer: number;
    const arm = () => {
      window.clearTimeout(timer);
      if (!document.hidden) {
        timer = window.setTimeout(() => setVisible(true), STANDBY_IDLE_MS);
      }
    };
    arm();
    window.addEventListener('pointerdown', arm);
    window.addEventListener('keydown', arm);
    document.addEventListener('visibilitychange', arm);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
      document.removeEventListener('visibilitychange', arm);
    };
  }, [visible]);
  useEffect(() => {
    let active = true;
    let timer: number;
    const refreshVideo = async () => {
      try {
        const { version } = await kioskApi.standby();
        if (active) setVideoVersion(version);
      } catch {
        // Keep the last known video while the server is unavailable.
      } finally {
        if (active)
          timer = window.setTimeout(refreshVideo, SCHEDULE_REFRESH_MS);
      }
    };
    void refreshVideo();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    const element = dialog.current;
    if (!visible || !element) return;
    if (typeof element.showModal === 'function') element.showModal();
    else element.setAttribute('open', '');
  }, [visible]);

  if (!visible) return null;
  const wake = () => {
    setVisible(false);
    onWake();
  };
  return (
    <dialog
      ref={dialog}
      className="kiosk-standby"
      aria-label="Киоск в режиме ожидания"
      onCancel={(event) => {
        event.preventDefault();
        wake();
      }}
    >
      {!window.matchMedia('(prefers-reduced-motion: reduce)').matches && (
        <video
          src={kioskStandbyVideoUrl(
            videoVersion === failedVersion ? null : videoVersion,
          )}
          onError={() => {
            if (videoVersion) setFailedVersion(videoVersion);
          }}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
        />
      )}
      <button type="button" className="kiosk-standby-wake" onClick={wake}>
        <span>Коснитесь экрана</span>
        <span>Чтобы посмотреть расписание и забронировать переговорную</span>
      </button>
      <div className="kiosk-standby-brand" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} alt="" />
      </div>
    </dialog>
  );
}

export default function KioskPage() {
  const config = useConfig();
  const logoSrc = resolveSiteIcon(config, 'dark');
  const logoIncludesName =
    config?.brandMarkType !== 'text' &&
    logoSrc === MSTYLE_BRAND_DEFAULTS.siteIconDark;
  const [ready, setReady] = useState(false);
  const [deviceToken, setDeviceToken] = useState('');
  const [status, setStatus] = useState<KioskStatus | null>(null);
  const [scheduleTomorrow, setScheduleTomorrow] = useState(false);
  const [tomorrowStatus, setTomorrowStatus] = useState<KioskStatus | null>(
    null,
  );
  const [tomorrowError, setTomorrowError] = useState('');
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
          : bookControl.current
        : null;
    const target =
      returnControl && !returnControl.disabled
        ? returnControl
        : kioskRoot.current?.querySelector<HTMLElement>('h1');
    target?.focus({ preventScroll: true });
  }, [screen, settingUp]);
  useEffect(() => {
    if (!scheduleTomorrow || !deviceToken || screen !== 'status') return;
    let active = true;
    void kioskApi.status(deviceToken, true).then(
      (value) => {
        if (!active) return;
        setTomorrowStatus(value);
        setTomorrowError('');
      },
      () => {
        if (active)
          setTomorrowError('Не удалось загрузить расписание на завтра.');
      },
    );
    return () => {
      active = false;
    };
  }, [scheduleTomorrow, deviceToken, screen, lastUpdate]);
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
  const todaySchedule = groupSchedule(status?.slots);
  const currentPeriod = todaySchedule.find(
    (s) => s.start_minute <= minute && s.end_minute > minute,
  );
  const liveSchedule = connected && status?.date === today;
  const hasFutureSlotToday = status?.slots.some(
    (slot) =>
      slot.start_minute > minute &&
      kioskRangeFree(
        status.slots,
        slot.start_minute,
        status.slots.find(
          (end) => end.end_minute >= slot.start_minute + MIN_BOOKING_MINUTES,
        )?.end_minute ?? -1,
      ),
  );
  const nextFree =
    liveSchedule &&
    todaySchedule.find((s) => s.state === 'free' && s.start_minute > minute);
  const tomorrowDate = shiftBookingDate(today, 1);
  const shownStatus = scheduleTomorrow
    ? tomorrowStatus?.date === tomorrowDate &&
      tomorrowStatus.room.id === status?.room.id
      ? tomorrowStatus
      : null
    : status;
  const schedule = scheduleTomorrow
    ? groupSchedule(shownStatus?.slots)
    : todaySchedule;
  const showCurrentPeriod = !scheduleTomorrow && liveSchedule;
  const workStart = schedule[0]?.start_minute ?? 0;
  const workEnd = schedule[schedule.length - 1]?.end_minute ?? 0;
  const workSpan = workEnd - workStart;
  const pastWidth = showCurrentPeriod
    ? Math.max(0, Math.min(minute, workEnd) - workStart)
    : 0;
  const firstTick = (Math.floor(workStart / 30) + 1) * 30;
  const ticks = Array.from(
    { length: Math.max(0, Math.ceil((workEnd - firstTick) / 30)) },
    (_, index) => firstTick + index * 30,
  );
  return (
    <main
      ref={kioskRoot}
      className={`kiosk kiosk-screen-${screen}${screen === 'status' && deviceToken ? ' kiosk-dashboard-screen' : ''}`}
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
            showName={!logoIncludesName}
            variant="dark"
            size="sm"
            className="kiosk-brand"
          />
          {logoIncludesName && <span className="sr-only">M-STYLE</span>}
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
                      {liveSchedule &&
                        currentSlot &&
                        (available ? (
                          <CheckCircle2 aria-hidden="true" />
                        ) : (
                          <Clock3 aria-hidden="true" />
                        ))}
                      {state}
                    </h1>
                    {liveSchedule &&
                      currentPeriod &&
                      (available ||
                        !nextFree ||
                        nextFree.start_minute !== currentPeriod.end_minute) && (
                        <p className="kiosk-until">
                          До {kioskTime(currentPeriod.end_minute)} ·{' '}
                          {durationLabel(currentPeriod.end_minute - minute)}
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
                        На сегодня нет свободного интервала от 1 часа.
                      </p>
                    )}
                    <div className="kiosk-dashboard-actions">
                      <button
                        className="btn btn-primary"
                        ref={bookControl}
                        disabled={!liveSchedule}
                        onClick={() =>
                          open(
                            'login',
                            scheduleTomorrow ? tomorrowDate : undefined,
                          )
                        }
                      >
                        Забронировать
                      </button>
                    </div>
                  </section>
                  <section className="kiosk-dashboard-schedule kiosk-stack">
                    <h2>Расписание</h2>
                    <div
                      className="kiosk-schedule-days"
                      role="group"
                      aria-label="День расписания"
                    >
                      <button
                        type="button"
                        aria-pressed={!scheduleTomorrow}
                        onClick={() => setScheduleTomorrow(false)}
                      >
                        Сегодня
                      </button>
                      <button
                        type="button"
                        aria-pressed={scheduleTomorrow}
                        onClick={() => setScheduleTomorrow(true)}
                      >
                        Завтра
                      </button>
                    </div>
                    {scheduleTomorrow && tomorrowError && (
                      <p role="alert">{tomorrowError}</p>
                    )}
                    {!shownStatus &&
                      !error &&
                      !(scheduleTomorrow && tomorrowError) && (
                        <p role="status">Загрузка расписания…</p>
                      )}
                    {shownStatus && !shownStatus.slots.length && (
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
                          {pastWidth > 0 && (
                            <span
                              className="kiosk-timeline-segment is-past"
                              style={{
                                width: `${(100 * pastWidth) / workSpan}%`,
                              }}
                            />
                          )}
                          {ticks.map((tick) => (
                            <span
                              key={tick}
                              className={`kiosk-timeline-tick ${tick % 60 === 0 ? 'is-hour' : ''}`}
                              style={{
                                left: `${(100 * (tick - workStart)) / workSpan}%`,
                              }}
                            />
                          ))}
                          {showCurrentPeriod &&
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
                            showCurrentPeriod && s === currentPeriod
                              ? 'time'
                              : undefined
                          }
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
          {!deviceToken && (
            <span>
              {connected
                ? 'Расписание обновляется автоматически'
                : 'Pass · Переговорные'}
            </span>
          )}
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
      {screen === 'status' && deviceToken && liveSchedule && !receipt && (
        <KioskStandby
          logoSrc={logoSrc}
          onWake={() =>
            window.requestAnimationFrame(() =>
              bookControl.current?.focus({ preventScroll: true }),
            )
          }
        />
      )}
    </main>
  );
}
