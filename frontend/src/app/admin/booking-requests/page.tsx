'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  Search,
  RotateCcw,
  ArrowLeft,
} from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import {
  GuestInvoiceFields,
  GuestInvoiceParty,
  guestInvoicePayload,
} from '@/components/GuestInvoiceFields';
import { BookingEditor } from '@/components/BookingEditor';
import { PageError } from '@/components/PageError';
import {
  BookingRequestsList,
  BookingOverview,
} from '@/components/BookingRequestsList';
import {
  OperationsFilters,
  OperationsFilter,
  OperationsQueueTabs,
} from '@/components/OperationsWorkspace';
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
  operationDate,
} from '@/lib/operations';
import { canBookingAction } from '@/lib/booking-status';

export default function BookingRequestsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { counts } = useWorkQueue();
  const finance = user?.permissions?.includes('bookings.finance');
  const canAdjust = user?.permissions?.includes('resident_hours.adjust');
  const writable = counts?.mode === 'pass';
  const [list, setList] = useState<Page<Booking> | null>(null);
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(
    null,
  );
  const [detailLoading, setDetailLoading] = useState(false);
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
  const [listLoading, setListLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const listRequest = useRef(0);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const selection = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++listRequest.current;
    setListLoading(true);
    const query = filtersRef.current;
    try {
      const next = await operations.bookings(query);
      if (sequence !== listRequest.current || query !== filtersRef.current)
        return;
      const lastPage = Math.max(1, Math.ceil(next.total / next.per_page));
      if (query.page > lastPage) {
        setFilters((current) => ({ ...current, page: lastPage }));
        return;
      }
      setList(next);
      setError('');
    } catch (e) {
      if (sequence === listRequest.current) setError(getErrorMessage(e));
    } finally {
      if (sequence === listRequest.current) setListLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, filters]);
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
    if (id) {
      selection.current = id;
      setSelectedBookingId(id);
      setDetailLoading(true);
      void operations
        .booking(id)
        .then((next) => {
          if (selection.current === id) setDetail(next);
        })
        .catch((e) => {
          if (selection.current === id) setError(getErrorMessage(e));
        })
        .finally(() => {
          if (selection.current === id) setDetailLoading(false);
        });
    }
  }, []);
  useEffect(() => {
    let active = true;
    setCalendar(null);
    if (view === 'calendar' && filters.room_id && filters.date) {
      setCalendarLoading(true);
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
        .then((next) => {
          if (active) setCalendar(next);
        })
        .catch((e) => {
          if (active) setError(getErrorMessage(e));
        })
        .finally(() => {
          if (active) setCalendarLoading(false);
        });
    } else setCalendarLoading(false);
    return () => {
      active = false;
    };
  }, [view, filters.room_id, filters.date, list]);
  const open = async (id: number) => {
    selection.current = id;
    setSelectedBookingId(id);
    setDetail((current) => (current?.booking.id === id ? current : null));
    setDetailLoading(true);
    try {
      const next = await operations.booking(id);
      if (selection.current !== id) return;
      setDetail(next);
      setHoursHistory(null);
      setInvoiceParty({
        profile_type: 'individual',
        legal_form: null,
        values: {},
        email: '',
      });
    } catch (e) {
      toast(getErrorMessage(e), 'error');
    } finally {
      if (selection.current === id) setDetailLoading(false);
    }
  };
  const closeDetail = () => {
    selection.current = 0;
    setSelectedBookingId(null);
    setDetail(null);
    setHoursHistory(null);
    setAction('');
    setNote('');
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
  const showList = !selectedBookingId && !editor;
  const hasFilters = !!(
    filters.search ||
    filters.status ||
    filters.payment_method ||
    filters.room_id ||
    filters.date
  );
  const resetFilters = () =>
    setFilters((current) => ({
      ...current,
      search: '',
      status: '',
      payment_method: '',
      room_id: '',
      date: '',
      page: 1,
    }));
  return (
    <AdminLayout
      title={
        editor === 'new'
          ? 'Новая заявка'
          : editor === 'block'
            ? 'Блокировка времени'
            : editor === 'edit'
              ? `Редактирование ${b?.number || 'бронирования'}`
              : selectedBookingId
                ? `Заявка ${b?.number || selectedBookingId}`
                : 'Бронирования'
      }
      description={
        showList
          ? 'Переговорные и офисы на день — заявки, оплата и занятость.'
          : undefined
      }
      actions={
        showList ? (
          <>
            <button
              className="btn btn-secondary"
              disabled={!writable}
              onClick={() => setEditor('block')}
            >
              <Ban size={16} />
              Блокировка
            </button>
            <button
              className="btn btn-primary"
              disabled={!writable}
              onClick={() => setEditor('new')}
            >
              <Plus size={17} />
              Новая заявка
            </button>
          </>
        ) : undefined
      }
    >
      {showList && (
        <div className="operations-page">
          {counts && !writable && (
            <p className="operations-notice" role="status">
              {counts.mode === 'paused'
                ? 'Приём изменений временно приостановлен.'
                : 'Раздел готовится к подключению. Заявки пока обрабатываются на сайте.'}
            </p>
          )}
          <section
            className="operations-controls"
            aria-label="Очереди и фильтры бронирований"
          >
            <div className="operations-controls__top">
              <OperationsQueueTabs
                label="Очереди бронирований"
                active={filters.tab}
                items={[
                  {
                    value: 'pending',
                    label: 'Требуют действий',
                    count: counts?.bookings,
                  },
                  { value: 'conflicts', label: 'Конфликты' },
                  { value: 'history', label: 'История' },
                  { value: '', label: 'Все' },
                ]}
                onChange={(tab) =>
                  setFilters((current) => ({ ...current, tab, page: 1 }))
                }
              />
              <div
                className="operations-view"
                role="group"
                aria-label="Вид бронирований"
              >
                <button
                  type="button"
                  aria-pressed={view === 'list'}
                  onClick={() => setView('list')}
                >
                  <List size={15} />
                  Список
                </button>
                <button
                  type="button"
                  aria-pressed={view === 'calendar'}
                  onClick={() => setView('calendar')}
                >
                  <CalendarDays size={15} />
                  Занятость
                </button>
              </div>
            </div>
            <OperationsFilters
              kind="bookings"
              activeCount={
                [
                  filters.room_id,
                  filters.date,
                  filters.status,
                  filters.payment_method,
                ].filter(Boolean).length
              }
              search={
                <OperationsFilter label="Поиск">
                  <span className="operations-search">
                    <Search size={16} aria-hidden="true" />
                    <input
                      aria-label="Поиск заявок"
                      className="input"
                      placeholder="Номер, имя или телефон"
                      value={filters.search}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          search: e.target.value,
                          page: 1,
                        }))
                      }
                    />
                  </span>
                </OperationsFilter>
              }
            >
              <OperationsFilter label="Помещение">
                <select
                  aria-label="Помещение"
                  className="input"
                  value={filters.room_id}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      room_id: e.target.value,
                      page: 1,
                    }))
                  }
                >
                  <option value="">Все помещения</option>
                  {catalog?.rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title} · {r.business_center?.name}
                    </option>
                  ))}
                </select>
              </OperationsFilter>
              <OperationsFilter label="Дата">
                <input
                  aria-label="Дата бронирования"
                  className="input"
                  type="date"
                  value={filters.date}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, date: e.target.value, page: 1 }))
                  }
                />
              </OperationsFilter>
              <OperationsFilter label="Статус">
                <select
                  aria-label="Статус бронирования"
                  className="input"
                  value={filters.status}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      status: e.target.value,
                      page: 1,
                    }))
                  }
                >
                  <option value="">Все статусы</option>
                  {Object.entries(list?.statuses || {}).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </OperationsFilter>
              <OperationsFilter label="Способ оплаты">
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
              </OperationsFilter>
            </OperationsFilters>
            {hasFilters && (
              <div className="operations-filter-summary">
                <span>Применены фильтры</span>
                <button
                  type="button"
                  className="operations-reset"
                  onClick={resetFilters}
                >
                  <RotateCcw size={13} />
                  Сбросить фильтры
                </button>
              </div>
            )}
          </section>
          {error && <PageError message={error} onRetry={load} />}
          {view === 'calendar' && (
            <section className="card p-4 mb-5">
              {calendarLoading ? (
                <p className="text-[var(--muted)]" role="status">
                  Загрузка занятости…
                </p>
              ) : !calendar ? (
                <p className="text-[var(--muted)]">
                  {filters.room_id && filters.date
                    ? 'Не удалось загрузить занятость. Повторите загрузку.'
                    : 'Выберите помещение и дату.'}
                </p>
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
          <BookingRequestsList
            list={list}
            loading={listLoading}
            page={filters.page}
            onPage={(page) => setFilters((f) => ({ ...f, page }))}
            onOpen={(id) => void open(id)}
            onReset={hasFilters ? resetFilters : undefined}
          />
        </div>
      )}
      {!!selectedBookingId && !editor && (
        <section
          className="booking-workspace"
          aria-label="Карточка бронирования"
        >
          <button
            type="button"
            className="btn btn-secondary booking-workspace__back"
            onClick={closeDetail}
          >
            <ArrowLeft size={16} /> К бронированиям
          </button>
          {detailLoading && !detail && (
            <div className="card p-6" role="status">
              Загрузка заявки…
            </div>
          )}
          {!detailLoading && !detail && (
            <div className="card p-6" role="alert">
              Не удалось открыть заявку. Вернитесь к списку и попробуйте снова.
            </div>
          )}
          {b && detail && (
            <div className="booking-detail booking-workspace__content card space-y-5">
              <BookingOverview booking={b} />
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
                  <p className="text-sm whitespace-pre-wrap">
                    {b.comment_admin}
                  </p>
                </div>
              )}
              <div className="booking-detail-actions">
                {canBookingAction(b.status, 'confirm') && (
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
                  </>
                )}
                {canBookingAction(b.status, 'mark-paid') &&
                  finance &&
                  b.payment_status !== 'paid' &&
                  ['cash', 'invoice', 'postpay'].includes(b.payment_method) && (
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
                {canBookingAction(b.status, 'edit') && (
                  <button
                    className="btn btn-secondary"
                    disabled={!writable}
                    onClick={() => setEditor('edit')}
                  >
                    <Pencil className="w-4 h-4" />
                    Изменить
                  </button>
                )}
                {canBookingAction(b.status, 'cancel') && (
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
                {canBookingAction(
                  b.status,
                  'resolve-attention',
                  b.requires_attention,
                ) &&
                  finance && (
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
                <div className="booking-detail-section">
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
                          {operationDate(h.created_at)} ·{' '}
                          {h.type === 'debit' ? '−' : '+'}
                          {h.amount_min} мин · Остаток {h.balance_after_min}
                          <p className="text-[var(--muted)]">{h.comment}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {action && (
                <div className="booking-detail-section booking-detail-section--action space-y-3">
                  <h3 className="font-semibold">
                    {
                      (
                        {
                          'resolve-attention':
                            'Зафиксировать решение конфликта',
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
              <details className="booking-history">
                <summary>
                  История действий <span>{detail.history.length}</span>
                </summary>
                <ul className="space-y-2 text-sm">
                  {detail.history.map((h) => (
                    <li
                      key={h.id}
                      className="border-b border-[var(--border)] pb-2"
                    >
                      {operationDate(h.created_at)} · {h.actor_label}
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
                {!detail.history.length && (
                  <p className="booking-secondary">История пока пуста.</p>
                )}
              </details>
            </div>
          )}
        </section>
      )}
      {editor && (
        <div className="booking-workspace">
          <button
            type="button"
            className="btn btn-secondary booking-workspace__back"
            onClick={() => setEditor(null)}
          >
            <ArrowLeft size={16} />
            {editor === 'edit' ? 'К заявке' : 'К бронированиям'}
          </button>
          <BookingEditor
            key={editor + (editor === 'edit' ? b?.id : '')}
            open
            embedded
            onClose={() => setEditor(null)}
            onSaved={() => {
              void load();
              if (b) void open(b.id);
            }}
            booking={editor === 'edit' ? b : undefined}
            block={editor === 'block'}
          />
        </div>
      )}
    </AdminLayout>
  );
}
