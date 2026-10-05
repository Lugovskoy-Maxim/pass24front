import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Clock3,
  CreditCard,
  UserRound,
} from 'lucide-react';
import { OperationsStatusBadge } from './OperationsStatusBadge';
import {
  OperationsEmptyState,
  OperationsPagination,
} from './OperationsWorkspace';
import {
  Booking,
  clock,
  money,
  operationDate,
  Page,
  paymentLabels,
} from '@/lib/operations';

export const bookingModeLabel = (mode?: string) =>
  mode === 'day_office' ? 'Офис на день' : 'Почасовая бронь';
export const roomOfficeNumber = (room: Booking['room']) =>
  room.office_number ?? room.number;
export function bookingDuration(booking: Booking) {
  const minutes = booking.segments.reduce(
    (sum, slot) => sum + slot.end_minute - slot.start_minute,
    0,
  );
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return (
    [hours ? `${hours} ч` : '', rest ? `${rest} мин` : '']
      .filter(Boolean)
      .join(' ') || '0 мин'
  );
}

function BookingSchedule({
  booking,
  compact = false,
}: {
  booking: Booking;
  compact?: boolean;
}) {
  const slots = compact ? booking.segments.slice(0, 2) : booking.segments;
  return (
    <span className="booking-schedule">
      {slots.map((slot, index) => (
        <span key={index} className="booking-schedule__slot">
          <span>{operationDate(slot.date)}</span>
          <strong>
            {clock(slot.start_minute)} — {clock(slot.end_minute)}
          </strong>
        </span>
      ))}
      <span className="booking-schedule__duration">
        <Clock3 size={12} aria-hidden="true" />
        {bookingDuration(booking)}
        {compact &&
          booking.segments.length > 2 &&
          ` · ещё ${booking.segments.length - 2} интервала`}
      </span>
    </span>
  );
}

function BookingPayment({ booking }: { booking: Booking }) {
  const paid = booking.payment_status === 'paid';
  return (
    <span className="booking-payment">
      <strong>{money(booking.total_amount_minor)}</strong>
      <span className="booking-payment__state" data-paid={paid}>
        <i aria-hidden="true" />
        {paid
          ? 'Оплачено'
          : booking.payment_method === 'postpay'
            ? 'Постоплата'
            : 'Не оплачено'}
      </span>
      <span className="booking-secondary">
        {paymentLabels[booking.payment_method] || booking.payment_method}
      </span>
      {booking.writeoff_min > 0 && (
        <span className="booking-secondary">
          Часы: {booking.writeoff_min} мин
        </span>
      )}
    </span>
  );
}

function BookingStatus({ booking }: { booking: Booking }) {
  return (
    <span className="booking-status">
      <OperationsStatusBadge
        status={booking.status}
        label={booking.status_label}
      />
      {booking.requires_attention ? (
        <span className="booking-attention">
          <AlertCircle size={12} aria-hidden="true" />
          Требует проверки
        </span>
      ) : (
        booking.needs_action && (
          <span className="booking-secondary">Требует действия</span>
        )
      )}
    </span>
  );
}

export function BookingRequestsList({
  list,
  loading,
  page,
  onPage,
  onOpen,
  onReset,
}: {
  list: Page<Booking> | null;
  loading: boolean;
  page: number;
  onPage: (page: number) => void;
  onOpen: (id: number) => void;
  onReset?: () => void;
}) {
  return (
    <section
      className="booking-register"
      aria-label="Список бронирований"
      aria-busy={loading}
    >
      <div className="booking-register__heading">
        <h2>
          Заявки <span>{list?.total ?? '…'}</span>
        </h2>
        <span className="booking-secondary" role="status">
          {loading ? 'Обновляем…' : 'Время московское'}
        </span>
      </div>
      {!list ? (
        <div className="operations-loading" role="status">
          Загрузка бронирований…
        </div>
      ) : !list.items.length ? (
        <OperationsEmptyState
          title="Заявок пока нет"
          description="Измените фильтры или выберите другую очередь."
          onReset={onReset}
        />
      ) : (
        <>
          <div className="booking-table-wrap">
            <table className="booking-table">
              <thead>
                <tr>
                  <th scope="col">Заявка</th>
                  <th scope="col">Заказчик</th>
                  <th scope="col">Помещение</th>
                  <th scope="col">Дата и время</th>
                  <th scope="col">Оплата</th>
                  <th scope="col">Статус</th>
                  <th scope="col">
                    <span className="sr-only">Открыть</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((item) => (
                  <tr key={item.id} data-attention={item.requires_attention}>
                    <td>
                      <button
                        className="booking-number"
                        onClick={() => onOpen(item.id)}
                      >
                        {item.number}
                      </button>
                      <span className="booking-secondary booking-created">
                        {operationDate(item.created_at)}
                      </span>
                    </td>
                    <td>
                      <strong className="booking-name">
                        {item.requester.name || 'Заказчик'}
                      </strong>
                      <span className="booking-secondary">
                        {item.guest ? 'Гость' : 'Резидент'}
                      </span>
                      <span className="booking-secondary">
                        {item.requester.phone ||
                          item.requester.email ||
                          'Контакт не указан'}
                      </span>
                    </td>
                    <td>
                      <strong className="booking-name">
                        {item.room.title}
                      </strong>
                      <span className="booking-secondary">
                        {item.room.business_center?.name}
                      </span>
                      <span className="booking-kind">
                        {bookingModeLabel(item.booking_mode)}
                      </span>
                    </td>
                    <td>
                      <BookingSchedule booking={item} compact />
                    </td>
                    <td>
                      <BookingPayment booking={item} />
                    </td>
                    <td>
                      <BookingStatus booking={item} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="booking-open"
                        aria-label={`Открыть заявку ${item.number}`}
                        onClick={() => onOpen(item.id)}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="booking-mobile-list">
            {list.items.map((item) => (
              <button
                type="button"
                key={item.id}
                className="booking-mobile-card"
                data-attention={item.requires_attention}
                onClick={() => onOpen(item.id)}
                aria-label={`Открыть заявку ${item.number}`}
              >
                <span className="booking-mobile-card__top">
                  <strong className="booking-number">{item.number}</strong>
                  <BookingStatus booking={item} />
                </span>
                <span className="booking-mobile-card__room">
                  <Building2 size={16} aria-hidden="true" />
                  <strong>{item.room.title}</strong>
                  <ArrowUpRight size={16} aria-hidden="true" />
                </span>
                <span className="booking-secondary">
                  {item.room.business_center?.name} ·{' '}
                  {bookingModeLabel(item.booking_mode)}
                </span>
                <span className="booking-mobile-card__body">
                  <BookingSchedule booking={item} compact />
                  <BookingPayment booking={item} />
                </span>
                <span className="booking-mobile-card__customer">
                  <UserRound size={13} aria-hidden="true" />
                  {item.requester.name || 'Заказчик'}
                  <span>{item.guest ? 'Гость' : 'Резидент'}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      {list && (
        <OperationsPagination
          page={page}
          total={list.total}
          perPage={list.per_page}
          onChange={onPage}
        />
      )}
    </section>
  );
}

export function BookingOverview({ booking }: { booking: Booking }) {
  return (
    <div className="booking-overview">
      <div className="booking-overview__status">
        <BookingStatus booking={booking} />
        <span className="booking-secondary">
          Создана {operationDate(booking.created_at)}
        </span>
      </div>
      {booking.requires_attention && (
        <p className="booking-alert">
          <AlertCircle size={18} aria-hidden="true" />
          {booking.attention_reason || 'Требуется проверка администратора.'}
        </p>
      )}
      <div className="booking-overview__grid">
        <section className="booking-fact">
          <h3>
            <Building2 size={16} aria-hidden="true" />
            Помещение
          </h3>
          <strong>{booking.room.title}</strong>
          <span className="booking-secondary">
            {booking.room.business_center?.name}
            {roomOfficeNumber(booking.room)
              ? ` · Офис ${roomOfficeNumber(booking.room)}`
              : ''}
          </span>
          <span className="booking-kind">
            {bookingModeLabel(booking.booking_mode)}
          </span>
        </section>
        <section className="booking-fact">
          <h3>
            <CalendarDays size={16} aria-hidden="true" />
            Дата и время
          </h3>
          <BookingSchedule booking={booking} />
        </section>
        <section className="booking-fact">
          <h3>
            <UserRound size={16} aria-hidden="true" />
            Заказчик
          </h3>
          <strong>{booking.requester.name || 'Заказчик'}</strong>
          <span className="booking-secondary">
            {booking.guest ? 'Гость' : 'Резидент'}
          </span>
          <span>{booking.requester.phone}</span>
          <span className="booking-fact__email">{booking.requester.email}</span>
        </section>
        <section className="booking-fact">
          <h3>
            <CreditCard size={16} aria-hidden="true" />
            Оплата
          </h3>
          <BookingPayment booking={booking} />
          {booking.writeoff_min > 0 && (
            <span className="booking-secondary">
              Списано часов: {booking.hours_debited_min || 0} мин
            </span>
          )}
        </section>
      </div>
    </div>
  );
}
