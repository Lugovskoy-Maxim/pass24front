'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  Check,
  Download,
  Plus,
  List,
  Pencil,
  Ban,
  Wallet,
} from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { AdminModal } from '@/components/AdminModal';
import {
  GuestInvoiceFields,
  GuestInvoiceParty,
  guestInvoicePayload,
} from '@/components/GuestInvoiceFields';
import { BookingEditor } from '@/components/BookingEditor';
import { PageError } from '@/components/PageError';
import { useToast } from '@/components/Toast';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useWorkQueue } from '@/hooks/useWorkQueue';
import { useAuth } from '@/lib/auth';
import { getErrorMessage, request } from '@/lib/api';
import {
  Booking,
  BookingDetail,
  Catalog,
  clock,
  command,
  money,
  operations,
  Page,
  params,
  paymentLabels,
} from '@/lib/operations';

export default function BookingRequestsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { counts } = useWorkQueue();
  const finance = user?.permissions?.includes('bookings.finance');
  const canAdjust = user?.permissions?.includes('resident_hours.adjust');
  const writable = counts?.mode === 'pass';
  const [list, setList] = useState<Page<Booking> | null>(null);
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    payment_method: '',
    room_id: '',
    date: '',
    tab: 'pending',
    page: 1,
  });
  const [view, setView] = useState('list');
  const [calendar, setCalendar] = useState<{
    slots: Array<{ start_minute: number; end_minute: number; state: string }>;
  } | null>(null);
  const [editor, setEditor] = useState<'new' | 'edit' | 'block' | null>(null);
  const [action, setAction] = useState('');
  const [note, setNote] = useState('');
  const [invoiceParty, setInvoiceParty] = useState<GuestInvoiceParty>({
    profile_type: 'individual',
    legal_form: null,
    values: {},
    email: '',
  });
  const [amount, setAmount] = useState(30);
  const [hoursType, setHoursType] = useState('debit');
  const [hoursHistory, setHoursHistory] = useState<Awaited<
    ReturnType<typeof operations.hours>
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setList(await operations.bookings(filters));
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [filters]);
  useEffect(() => {
    void load();
  }, [load]);
  useAutoRefresh(load);
  useEffect(() => {
    void operations
      .catalog()
      .then(setCatalog)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const id = Number(query.get('id'));
    if (id)
      void operations
        .booking(id)
        .then(setDetail)
        .catch((e) => setError(getErrorMessage(e)));
  }, []);
  useEffect(() => {
    if (view === 'calendar' && filters.room_id && filters.date)
      void request<{
        slots: Array<{
          start_minute: number;
          end_minute: number;
          state: string;
        }>;
      }>(
        '/admin/booking-requests/availability' +
          params({ room_id: filters.room_id, date: filters.date }),
      )
        .then(setCalendar)
        .catch((e) => setError(getErrorMessage(e)));
    else setCalendar(null);
  }, [view, filters.room_id, filters.date, list]);
  const open = async (id: number) => {
    try {
      setDetail(await operations.booking(id));
      setHoursHistory(null);
      setInvoiceParty({
        profile_type: 'individual',
        legal_form: null,
        values: {},
        email: '',
      });
    } catch (e) {
      toast(getErrorMessage(e), 'error');
    }
  };
  const run = async () => {
    if (!detail || busy) return;
    setBusy(true);
    try {
      if (
        action === 'hours' &&
        detail.booking.resource_profile_id &&
        detail.hours_account
      ) {
        await command(
          `/admin/resident-hours/${detail.booking.resource_profile_id}/adjustments`,
          {
            amount_min: amount,
            type: hoursType,
            reason: note,
            revision: detail.hours_account.revision,
            booking_id: detail.booking.id,
          },
        );
        await open(detail.booking.id);
      } else {
        const result = await command<BookingDetail>(
          `/admin/booking-requests/${detail.booking.id}/${action}`,
          {
            revision: detail.booking.revision,
            note,
            reason: note,
            comment_admin: note,
            ...(action === 'issue-invoice' &&
            detail.booking.requisites_complete === false
              ? { invoice_party: guestInvoicePayload(invoiceParty) }
              : {}),
          },
        );
        if (result.booking) setDetail(result);
        else await open(detail.booking.id);
      }
      setAction('');
      setNote('');
      await load();
      toast('Изменения сохранены', 'success');
    } catch (e) {
      toast(getErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const b = detail?.booking;
  return (
    <AdminLayout title="Заявки">
      {counts && !writable && (
        <p className="card p-3 mb-4 text-sm text-[var(--muted)]">
          {counts.mode === 'paused'
            ? 'Приём изменений временно приостановлен.'
            : 'Раздел готовится к подключению. Заявки пока обрабатываются на сайте.'}
        </p>
      )}
      <div className="flex flex-wrap justify-between gap-3 mb-4">
        <div className="flex gap-2">
          <button
            className={`btn ${view === 'list' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setView('list')}
          >
            <List className="w-4 h-4" />
            Список
          </button>
          <button
            className={`btn ${view === 'calendar' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setView('calendar')}
          >
            <CalendarDays className="w-4 h-4" />
            Занятость
          </button>
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-secondary"
            disabled={!writable}
            onClick={() => setEditor('block')}
          >
            <Ban className="w-4 h-4" />
            Блокировка
          </button>
          <button
            className="btn btn-primary"
            disabled={!writable}
            onClick={() => setEditor('new')}
          >
            <Plus className="w-4 h-4" />
            Новая заявка
          </button>
        </div>
      </div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          ['pending', 'Требуют действий'],
          ['conflicts', 'Конфликты'],
          ['history', 'История'],
          ['', 'Все'],
        ].map(([v, label]) => (
          <button
            key={v}
            className={`btn text-sm ${filters.tab === v ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilters((f) => ({ ...f, tab: v, page: 1 }))}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-5">
        <input
          aria-label="Поиск заявок"
          className="input"
          placeholder="Номер, имя или телефон"
          value={filters.search}
          onChange={(e) =>
            setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))
          }
        />
        <select
          aria-label="Помещение"
          className="input"
          value={filters.room_id}
          onChange={(e) =>
            setFilters((f) => ({ ...f, room_id: e.target.value, page: 1 }))
          }
        >
          <option value="">Все помещения</option>
          {catalog?.rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title} · {r.business_center?.name}
            </option>
          ))}
        </select>
        <input
          aria-label="Дата бронирования"
          className="input"
          type="date"
          value={filters.date}
          onChange={(e) =>
            setFilters((f) => ({ ...f, date: e.target.value, page: 1 }))
          }
        />
        <select
          aria-label="Статус бронирования"
          className="input"
          value={filters.status}
          onChange={(e) =>
            setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))
          }
        >
          <option value="">Все статусы</option>
          {Object.entries(list?.statuses || {}).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Способ оплаты"
          className="input"
          value={filters.payment_method}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              payment_method: e.target.value,
              page: 1,
            }))
          }
        >
          <option value="">Все способы оплаты</option>
          {Object.entries(paymentLabels).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {error && <PageError message={error} onRetry={load} />}
      {view === 'calendar' && (
        <section className="card p-4 mb-5">
          {!calendar ? (
            <p className="text-[var(--muted)]">Выберите помещение и дату.</p>
          ) : (
            <>
              <p className="text-sm text-[var(--muted)] mb-3">
                Время московское
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {calendar.slots.map((s) => (
                  <div
                    key={s.start_minute}
                    className={`rounded p-2 border text-sm ${s.state === 'free' ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-[var(--border)] bg-[var(--surface-muted)]'}`}
                  >
                    <strong>
                      {clock(s.start_minute)}–{clock(s.end_minute)}
                    </strong>
                    <p className="text-xs text-[var(--muted)]">
                      {(
                        {
                          free: 'Свободно',
                          hold: 'Ожидает оплаты',
                          paid: 'Оплачено',
                          reserved: 'Занято',
                          blocked: 'Блокировка',
                        } as Record<string, string>
                      )[s.state] || s.state}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
              <th className="p-4">Заявка</th>
              <th className="p-4">Заказчик</th>
              <th className="p-4">Помещение и время</th>
              <th className="p-4">Оплата</th>
              <th className="p-4">Статус</th>
            </tr>
          </thead>
          <tbody>
            {list?.items.map((item) => (
              <tr
                key={item.id}
                className="border-b border-[var(--border)] hover:bg-[var(--surface-muted)]"
              >
                <td className="p-4">
                  <button
                    onClick={() => void open(item.id)}
                    className="font-semibold text-[var(--primary)] hover:underline"
                  >
                    {item.number}
                  </button>
                  <p className="text-xs text-[var(--muted)] mt-1">
                    {item.created_at}
                  </p>
                </td>
                <td className="p-4">
                  <div>{item.requester.name || 'Заказчик'}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {item.guest ? 'Гость' : 'Резидент'} · {item.requester.phone}
                  </div>
                </td>
                <td className="p-4">
                  <div>{item.room.title}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {item.room.business_center?.name}
                  </div>
                  {item.segments.map((s, i) => (
                    <div key={i} className="whitespace-nowrap">
                      {s.date} · {clock(s.start_minute)}–{clock(s.end_minute)}
                    </div>
                  ))}
                </td>
                <td className="p-4 whitespace-nowrap">
                  <strong>{money(item.total_amount_minor)}</strong>
                  <div className="text-xs text-[var(--muted)]">
                    {paymentLabels[item.payment_method]} ·{' '}
                    {item.payment_status === 'paid'
                      ? 'Оплачено'
                      : 'Не оплачено'}
                  </div>
                  {item.writeoff_min > 0 && (
                    <div className="text-xs">Часы: {item.writeoff_min} мин</div>
                  )}
                </td>
                <td className="p-4">
                  <span
                    className={
                      item.requires_attention ? 'text-[var(--danger)]' : ''
                    }
                  >
                    {item.status_label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list ? (
          <p className="p-5 text-[var(--muted)]">Загрузка…</p>
        ) : (
          !list.items.length && (
            <p className="p-5 text-[var(--muted)]">
              Заявок по выбранным условиям нет.
            </p>
          )
        )}
        {list && (
          <div className="flex items-center justify-between p-4">
            <button
              className="btn btn-secondary"
              disabled={filters.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            >
              Назад
            </button>
            <span className="text-sm text-[var(--muted)]">
              Всего: {list.total} · Страница {filters.page}
            </span>
            <button
              className="btn btn-secondary"
              disabled={filters.page * list.per_page >= list.total}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            >
              Далее
            </button>
          </div>
        )}
      </div>
      <AdminModal
        open={!!detail && !editor}
        onClose={() => {
          setDetail(null);
          setAction('');
        }}
        title={b ? `Заявка ${b.number}` : 'Заявка'}
        wide
      >
        {b && detail && (
          <div className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <h3 className="font-semibold">
                  {b.requester.name || 'Заказчик'}
                </h3>
                <p className="text-sm text-[var(--muted)]">
                  {b.guest ? 'Гость' : 'Резидент'}
                </p>
                <p>{b.requester.phone}</p>
                <p className="break-words">{b.requester.email}</p>
              </div>
              <div>
                <h3 className="font-semibold">{b.room.title}</h3>
                {b.segments.map((s, i) => (
                  <p key={i}>
                    {s.date} · {clock(s.start_minute)}–{clock(s.end_minute)}
                  </p>
                ))}
                <p>{b.status_label}</p>
              </div>
            </div>
            {b.requires_attention && (
              <p className="p-3 border border-[var(--danger)] rounded text-sm text-[var(--danger)]">
                {b.attention_reason || 'Требуется проверка администратора.'}
              </p>
            )}
            <div className="card p-4">
              <p className="font-semibold">
                {money(b.total_amount_minor)} ·{' '}
                {paymentLabels[b.payment_method]}
              </p>
              <p className="text-sm">
                {b.payment_status === 'paid'
                  ? 'Оплачено'
                  : 'Оплата не получена'}
              </p>
              {b.writeoff_min > 0 && (
                <p className="text-sm mt-1">
                  Резидентские часы: {b.writeoff_min} мин · Списано:{' '}
                  {b.hours_debited_min || 0} мин
                </p>
              )}
            </div>
            {!!b.services.length && (
              <div>
                <h3 className="font-semibold mb-2">Дополнительные услуги</h3>
                {b.services.map((s) => (
                  <p key={s.service_id} className="text-sm">
                    {s.name} × {s.quantity} · {money(s.total_amount_minor)}
                  </p>
                ))}
              </div>
            )}
            {b.comment_client && (
              <div>
                <h3 className="font-semibold">Комментарий заказчика</h3>
                <p className="text-sm whitespace-pre-wrap">
                  {b.comment_client}
                </p>
              </div>
            )}
            {b.comment_admin && (
              <div>
                <h3 className="font-semibold">Комментарий администратора</h3>
                <p className="text-sm whitespace-pre-wrap">{b.comment_admin}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {b.status !== 'cancelled' && b.status !== 'blocked' && (
                <>
                  <button
                    className="btn btn-primary"
                    disabled={
                      !writable ||
                      busy ||
                      (b.payment_method !== 'postpay' &&
                        b.payment_status !== 'paid')
                    }
                    onClick={() => setAction('confirm')}
                  >
                    <Check className="w-4 h-4" />
                    Подтвердить
                  </button>
                  {finance &&
                    b.payment_status !== 'paid' &&
                    ['cash', 'invoice', 'postpay'].includes(
                      b.payment_method,
                    ) && (
                      <button
                        className="btn btn-secondary"
                        disabled={!writable}
                        onClick={() => setAction('mark-paid')}
                      >
                        <Wallet className="w-4 h-4" />
                        {b.payment_method === 'cash'
                          ? 'Наличные получены'
                          : 'Отметить оплату'}
                      </button>
                    )}
                  <button
                    className="btn btn-secondary"
                    disabled={!writable}
                    onClick={() => setEditor('edit')}
                  >
                    <Pencil className="w-4 h-4" />
                    Изменить
                  </button>
                </>
              )}
              {b.status !== 'cancelled' && (
                <button
                  className="btn btn-secondary"
                  disabled={!writable}
                  onClick={() => setAction('cancel')}
                >
                  Отменить
                </button>
              )}
              <button
                className="btn btn-secondary"
                disabled={!writable}
                onClick={() => {
                  setAction('comment');
                  setNote(b.comment_admin);
                }}
              >
                Комментарий
              </button>
              {b.requires_attention && finance && (
                <button
                  className="btn btn-secondary"
                  disabled={!writable}
                  onClick={() => setAction('resolve-attention')}
                >
                  Конфликт разобран
                </button>
              )}
              <Link
                className="btn btn-secondary"
                href={`/admin/service-requests?booking_id=${b.id}`}
              >
                Связанные обращения
              </Link>
            </div>
            {finance && (
              <div className="flex flex-wrap gap-2">
                {!detail.invoice ? (
                  <button
                    className="btn btn-secondary"
                    disabled={!writable}
                    onClick={() => setAction('issue-invoice')}
                  >
                    Выставить счёт
                  </button>
                ) : (
                  <>
                    <button
                      className="btn btn-secondary"
                      onClick={() =>
                        void operations
                          .download(
                            `/admin/booking-requests/${b.id}/invoice.pdf`,
                            `Счёт-${detail.invoice!.invoice_no}.pdf`,
                          )
                          .catch((e) => toast(getErrorMessage(e), 'error'))
                      }
                    >
                      <Download className="w-4 h-4" />
                      Счёт №{detail.invoice.invoice_no}
                    </button>
                    <button
                      className="btn btn-secondary"
                      disabled={!writable}
                      onClick={() => setAction('send-invoice')}
                    >
                      Отправить счёт
                    </button>
                  </>
                )}
              </div>
            )}
            {detail.hours_account && (
              <div className="card p-4">
                <h3 className="font-semibold">
                  Баланс часов: {detail.hours_account.balance_min} мин
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  {detail.hours_account.accrual_date} —{' '}
                  {detail.hours_account.expires_date}
                </p>
                <div className="flex gap-2 mt-3">
                  {canAdjust && (
                    <button
                      className="btn btn-secondary text-sm"
                      disabled={!writable}
                      onClick={() => setAction('hours')}
                    >
                      Списать / вернуть часы
                    </button>
                  )}
                  <button
                    className="btn btn-secondary text-sm"
                    onClick={() =>
                      void operations
                        .hours(b.resource_profile_id!)
                        .then(setHoursHistory)
                        .catch((e) => toast(getErrorMessage(e), 'error'))
                    }
                  >
                    История баланса
                  </button>
                </div>
                {hoursHistory && (
                  <ul className="mt-3 space-y-2 max-h-52 overflow-auto">
                    {hoursHistory.history.map((h) => (
                      <li
                        key={h.id}
                        className="text-sm border-b border-[var(--border)] pb-2"
                      >
                        {h.created_at} · {h.type === 'debit' ? '−' : '+'}
                        {h.amount_min} мин · Остаток {h.balance_after_min}
                        <p className="text-[var(--muted)]">{h.comment}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {action && (
              <div className="card p-4 space-y-3">
                <h3 className="font-semibold">
                  {
                    (
                      {
                        'resolve-attention': 'Зафиксировать решение конфликта',
                        confirm: 'Подтвердить бронирование',
                        'mark-paid': 'Подтвердить получение оплаты',
                        cancel: 'Отменить бронирование',
                        comment: 'Комментарий администратора',
                        hours: 'Корректировка часов',
                        'issue-invoice': 'Выставить счёт',
                        'send-invoice': 'Отправить счёт заказчику',
                      } as Record<string, string>
                    )[action]
                  }
                </h3>
                {action === 'issue-invoice' &&
                  b.guest &&
                  b.requisites_complete === false && (
                    <GuestInvoiceFields
                      value={invoiceParty}
                      onChange={setInvoiceParty}
                    />
                  )}
                {action === 'cancel' && (
                  <p className="text-sm text-[var(--muted)]">
                    Будет возвращено {detail.refundable_hours_min} мин. Отмена
                    не выполняет денежный возврат.
                  </p>
                )}
                {action === 'hours' && (
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      aria-label="Операция с часами"
                      className="input"
                      value={hoursType}
                      onChange={(e) => setHoursType(e.target.value)}
                    >
                      <option value="debit">Списать</option>
                      <option value="credit">Вернуть по брони</option>
                    </select>
                    <input
                      aria-label="Количество минут"
                      className="input"
                      type="number"
                      min="1"
                      value={amount}
                      onChange={(e) => setAmount(Number(e.target.value))}
                    />
                  </div>
                )}
                {[
                  'cancel',
                  'comment',
                  'hours',
                  'mark-paid',
                  'resolve-attention',
                ].includes(action) && (
                  <textarea
                    aria-label="Причина или комментарий"
                    placeholder={
                      action === 'cancel' || action === 'hours'
                        ? 'Причина (обязательно)'
                        : 'Комментарий'
                    }
                    className="input"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                )}
                <div className="flex gap-2">
                  <button
                    className="btn btn-primary"
                    disabled={
                      busy ||
                      (['cancel', 'hours', 'resolve-attention'].includes(
                        action,
                      ) &&
                        !note.trim())
                    }
                    onClick={() => void run()}
                  >
                    {busy ? 'Сохранение…' : 'Выполнить'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => {
                      setAction('');
                      setNote('');
                    }}
                  >
                    Назад
                  </button>
                </div>
              </div>
            )}
            <div>
              <h3 className="font-semibold mb-2">История действий</h3>
              <ul className="space-y-2 text-sm">
                {detail.history.map((h) => (
                  <li
                    key={h.id}
                    className="border-b border-[var(--border)] pb-2"
                  >
                    {h.created_at} · {h.actor_label}
                    <p className="text-[var(--muted)]">
                      {(
                        {
                          'booking.created': 'Заявка создана',
                          'booking.confirm': 'Бронь подтверждена',
                          'booking.mark-paid': 'Получена оплата',
                          'booking.cancelled': 'Бронь отменена',
                          'booking.edit': 'Бронь изменена',
                          'booking.transfer': 'Бронь перенесена',
                          'booking.extend': 'Бронь продлена',
                          'payment.received': 'Получена онлайн-оплата',
                          'invoice.issued': 'Выставлен счёт',
                          'booking.comment': 'Изменён комментарий',
                          'booking.blocked': 'Время заблокировано',
                        } as Record<string, string>
                      )[h.action] || 'Действие с бронированием'}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </AdminModal>
      {editor && (
        <BookingEditor
          key={editor + (editor === 'edit' ? b?.id : '')}
          open
          onClose={() => setEditor(null)}
          onSaved={() => {
            void load();
            if (b) void open(b.id);
          }}
          booking={editor === 'edit' ? b : undefined}
          block={editor === 'block'}
        />
      )}
    </AdminLayout>
  );
}
