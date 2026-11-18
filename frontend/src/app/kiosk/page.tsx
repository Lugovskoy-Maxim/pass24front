'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LogOut,
  Settings,
  WifiOff,
} from 'lucide-react';
import { getErrorMessage, getErrorStatus } from '@/lib/api';
import {
  kioskApi,
  kioskRangeFree,
  kioskTime,
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
type Screen = 'status' | 'login' | 'booking' | 'admin';

function LoginForm({
  admin,
  onLogin,
  onCancel,
}: {
  admin: boolean;
  onLogin: (session: KioskSession) => void;
  onCancel: () => void;
}) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
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
  return (
    <section className="kiosk-panel kiosk-login">
      <button className="kiosk-back" onClick={onCancel}>
        <ArrowLeft size={20} />
        Назад
      </button>
      <h1>{admin ? 'Настройка планшета' : 'Войдите для бронирования'}</h1>
      <p className="kiosk-muted">
        {admin
          ? 'Войдите как администратор с правом управления бронированиями.'
          : 'Используйте свой аккаунт Pass. Бронь будет оформлена для вашего офиса.'}
      </p>
      <form onSubmit={submit} autoComplete="off" className="kiosk-stack">
        <label>
          Логин
          <input
            className="input"
            name="kiosk-login"
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
      <p className="kiosk-muted kiosk-small">
        После бронирования или минуты бездействия аккаунт выйдет автоматически.
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
}: {
  session: KioskSession;
  status: KioskStatus;
  connected: boolean;
  onExit: () => void;
  onSuccess: (message: string) => void;
}) {
  const offices = session.user.offices || [];
  const [officeId, setOfficeId] = useState(offices[0]?.id || '');
  const [context, setContext] = useState<BookingContext | null>(null);
  const [slots, setSlots] = useState<KioskSlot[]>([]);
  const [start, setStart] = useState(-1);
  const [end, setEnd] = useState(-1);
  const [useHours, setUseHours] = useState(false);
  const [quote, setQuote] = useState<{
    value: BookingQuote;
    key: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const alive = useRef(true);
  const working = useRef(false);
  const command = useRef({ draft: '', key: '' });
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
      kioskApi.slots(session.token, officeId, status.room.id, status.date),
    ])
      .then(([c, s]) => {
        if (active) {
          setContext(c);
          setSlots(s.slots);
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
  }, [session.token, officeId, status.room.id, status.date, revision, onExit]);
  const room = context?.rooms.find((r) => r.id === status.room.id);
  const step = room?.config.slot_step_min || 30;
  const hoursAllowed =
    context?.canSpendHours &&
    (!room?.office_service || room.office_service.mode === 'quota');
  const draft: BookingDraft = {
    officeId,
    roomId: status.room.id,
    date: status.date,
    startMinute: start,
    endMinute: end,
    writeoffMinutes:
      useHours && hoursAllowed
        ? Math.floor(
            Math.min(context?.availableMinutes || 0, Math.max(0, end - start)) /
              step,
          ) * step
        : 0,
    paymentMethod: 'cash',
    comment: '',
  };
  const key = JSON.stringify(draft);
  const currentKey = useRef(key);
  currentKey.current = key;
  const currentQuote = quote?.key === key ? quote.value : null;
  const serverMinute =
    Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Moscow',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .format(new Date(status.serverTime))
        .split(':')[0],
    ) *
      60 +
    new Date(status.serverTime).getUTCMinutes();
  const free =
    kioskRangeFree(slots, start, end) &&
    kioskRangeFree(status.slots, start, end);
  const valid =
    !!room &&
    free &&
    start >= serverMinute &&
    connected &&
    context?.mode === 'pass';
  async function submit() {
    if (!valid || working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    const submittedKey = key;
    try {
      if (!currentQuote) {
        const value = await kioskApi.quote(session.token, draft);
        if (alive.current && currentKey.current === submittedKey)
          setQuote({ value, key: submittedKey });
      } else {
        const commandDraft = JSON.stringify({
          ...draft,
          pricingFingerprint: currentQuote.pricing_fingerprint,
        });
        if (command.current.draft !== commandDraft)
          command.current = { draft: commandDraft, key: crypto.randomUUID() };
        const result = await kioskApi.create(
          session.token,
          { ...draft, pricingFingerprint: currentQuote.pricing_fingerprint },
          command.current.key,
        );
        if (alive.current)
          onSuccess(`Бронирование создано · ${result.booking.status_label}`);
      }
    } catch (e) {
      if (alive.current) {
        if (getErrorStatus(e) === 401) onExit();
        else {
          setError(getErrorMessage(e));
          if (getErrorStatus(e) === 409) {
            setQuote(null);
            setRevision((r) => r + 1);
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
      <div className="kiosk-panel kiosk-stack">
        <label>
          Ваш офис
          <select
            className="input"
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
        {!offices.length && (
          <p role="alert">
            Для бронирования нужен назначенный офис. Обратитесь к
            администратору.
          </p>
        )}
        {loading && <p role="status">Загрузка свободного времени…</p>}
        {!loading && context && !room && (
          <p role="alert">Эта переговорная недоступна вашему офису.</p>
        )}
        {room && (
          <>
            <h2>
              <CalendarDays size={22} />
              Сегодня ·{' '}
              {new Date(`${status.date}T12:00:00+03:00`).toLocaleDateString(
                'ru-RU',
                { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' },
              )}
            </h2>
            <p className="kiosk-muted">
              Нажмите первый, затем последний интервал бронирования.
            </p>
            <div className="kiosk-slots">
              {slots.map((s) => {
                const enabled =
                  s.start_minute >= serverMinute &&
                  s.state === 'free' &&
                  kioskRangeFree(status.slots, s.start_minute, s.end_minute);
                const selected = s.start_minute >= start && s.end_minute <= end;
                return (
                  <button
                    key={s.start_minute}
                    className={`btn ${selected ? 'btn-primary' : 'btn-secondary'}`}
                    disabled={!enabled || busy || !connected}
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
              (s) => s.state === 'free' && s.start_minute >= serverMinute,
            ) && <p>На сегодня свободных интервалов нет.</p>}
            <p className="kiosk-small kiosk-muted">
              Недоступные интервалы затемнены. Время московское.
            </p>
            {hoursAllowed && context && context.availableMinutes > 0 && (
              <label className="kiosk-check">
                <input
                  type="checkbox"
                  checked={useHours}
                  disabled={busy}
                  onChange={(e) => setUseHours(e.target.checked)}
                />
                Использовать бесплатные минуты · остаток{' '}
                {context.availableMinutes} мин
              </label>
            )}
          </>
        )}
      </div>
      {error && (
        <div className="kiosk-error" role="alert">
          {error}{' '}
          <button
            className="kiosk-back"
            disabled={busy}
            onClick={() => setRevision((r) => r + 1)}
          >
            Обновить интервалы
          </button>
        </div>
      )}
      {start >= 0 && (
        <div className="kiosk-panel kiosk-stack">
          <h2>Ваша бронь</h2>
          <p>{status.room.title}</p>
          <p className="kiosk-selection">
            <Clock3 size={22} />
            {kioskTime(start)}–{kioskTime(end)} · {end - start} мин
          </p>
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
            disabled={!valid || busy}
            onClick={() => void submit()}
          >
            {busy
              ? 'Подождите…'
              : currentQuote
                ? 'Подтвердить бронирование'
                : 'Рассчитать стоимость'}
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

export default function KioskPage() {
  const config = useConfig();
  const [ready, setReady] = useState(false);
  const [deviceToken, setDeviceToken] = useState('');
  const [status, setStatus] = useState<KioskStatus | null>(null);
  const [screen, setScreen] = useState<Screen>('status');
  const [session, setSession] = useState<KioskSession | null>(null);
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
    setScreen('status');
    setFormKey((n) => n + 1);
  }, []);
  const touch = useCallback(() => {
    deadline.current = Date.now() + IDLE_MS;
    setRemaining(60);
  }, []);
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
    touch();
    setSession(null);
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
      className="kiosk"
      onPointerDownCapture={touch}
      onKeyDownCapture={touch}
    >
      <header className="kiosk-header">
        <div>
          <SiteBrand config={config} variant="dark" size="sm" />
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
            {error && (
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
                <>
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
                      disabled={
                        !connected ||
                        status?.date !== today ||
                        !status?.slots.some(
                          (s) => s.state === 'free' && s.start_minute >= minute,
                        )
                      }
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
                </>
              ))}
            {(screen === 'login' || screen === 'admin') && !session && (
              <LoginForm
                key={`${screen}-${formKey}`}
                admin={screen === 'admin'}
                onCancel={finish}
                onLogin={(s) => {
                  touch();
                  setSession(s);
                  if (screen === 'login') setScreen('booking');
                }}
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
                onSuccess={(message) => {
                  finish();
                  setReceipt(message);
                }}
              />
            )}
            {screen !== 'status' && (
              <p
                className={`kiosk-idle ${remaining <= 15 ? 'is-warning' : ''}`}
                role={remaining <= 15 ? 'status' : undefined}
              >
                {remaining <= 15
                  ? `Аккаунт выйдет через ${remaining} сек. Коснитесь экрана, чтобы продолжить.`
                  : 'Автоматический выход после минуты бездействия'}
              </p>
            )}
          </>
        )}
      </div>
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
    </main>
  );
}
