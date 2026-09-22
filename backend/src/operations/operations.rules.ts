import { HttpException } from '@nestjs/common';
import { createHash } from 'crypto';

export const OPERATION_PERMISSIONS = [
  'bookings.manage',
  'bookings.finance',
  'resident_hours.adjust',
  'support.manage',
] as const;
export const SUPPORT_TOPICS: Record<string, string> = {
  payment: 'Проблема с оплатой',
  guest_pass: 'Заявка на гостевой пропуск',
  plumbing: 'Сантехнические работы',
  booking: 'Вопрос по бронированию',
  services: 'Дополнительные услуги',
  resident_data: 'Изменение данных резидента',
};
export const SUPPORT_STATUSES: Record<string, string> = {
  new: 'Новый',
  in_progress: 'В работе',
  completed: 'Завершён',
  cancelled: 'Отменён',
};
export const BOOKING_STATUSES: Record<string, string> = {
  draft: 'Черновик',
  hold: 'Ожидает онлайн-оплаты',
  guest_request: 'Заявка гостя',
  awaiting_payment: 'Ожидает оплаты',
  awaiting_confirmation: 'Ожидает подтверждения',
  confirmed: 'Подтверждена',
  paid: 'Оплачена',
  cancelled: 'Отменена',
  blocked: 'Блокировка',
  awaiting_resolution: 'Требует решения',
};
export type OperationsActor = {
  ref: string;
  kind: 'admin' | 'resident' | 'guest' | 'system';
  subject?: string;
  guestPartyId?: string;
  name?: string;
  permissions?: string[];
};
export type Segment = {
  date: string;
  start_minute: number;
  end_minute: number;
  duration_min?: number;
};
export function fail(
  code: string,
  message: string,
  status = 409,
  extra: Record<string, unknown> = {},
): never {
  throw new HttpException(
    { ok: false, error: { code, message, ...extra } },
    status,
  );
}
export function requirePermission(actor: OperationsActor, permission: string) {
  if (
    actor.kind !== 'admin' ||
    !actor.permissions?.includes('admin.panel') ||
    !actor.permissions.includes(permission)
  )
    fail('forbidden', 'Недостаточно прав.', 403);
}
export function integer(
  value: unknown,
  field: string,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : NaN;
  if (!Number.isSafeInteger(n) || n < min || n > max)
    fail('validation_error', `Некорректное поле: ${field}.`, 400, {
      field_key: field,
    });
  return n;
}
export function textValue(
  value: unknown,
  max: number,
  required = false,
): string {
  if (value != null && typeof value !== 'string')
    fail('validation_error', 'Ожидался текст.', 400);
  const s = String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .trim();
  if (s.length > max || (required && !s))
    fail(
      'validation_error',
      required && !s
        ? 'Заполните обязательное поле.'
        : 'Слишком длинный текст.',
      400,
    );
  return s;
}
export function sqlNow(now = new Date()): string {
  return new Date(now.getTime() + 3 * 3600000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
}
export function parseMoscow(value: string): number {
  return Date.parse(
    value.includes('T') ? value : value.replace(' ', 'T') + '+03:00',
  );
}
export function dateValue(value: unknown): string {
  const s = String(value ?? '');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(Date.parse(s + 'T00:00:00Z')) ||
    new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) !== s
  )
    fail('validation_error', 'Некорректная дата.', 400);
  return s;
}
export function normalizeSegments(raw: unknown, step = 30): Segment[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > 100)
    fail('validation_error', 'Выберите время бронирования.', 400);
  const segments = raw
    .map((s) => {
      const date = dateValue(s?.date);
      const start = integer(s?.start_minute, 'start_minute', 0, 1439);
      const end = integer(s?.end_minute, 'end_minute', 1, 1440);
      if (end <= start || start % step || end % step)
        fail(
          'validation_error',
          'Время должно соответствовать шагу бронирования.',
          400,
        );
      return {
        date,
        start_minute: start,
        end_minute: end,
        duration_min: end - start,
      };
    })
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.start_minute - b.start_minute,
    );
  segments.forEach((s, i) => {
    if (
      i &&
      s.date === segments[i - 1].date &&
      s.start_minute < segments[i - 1].end_minute
    )
      fail('validation_error', 'Выбранные интервалы пересекаются.', 400);
  });
  return segments;
}
export function blocksAvailability(row: any, now = Date.now()): boolean {
  if (['cancelled', 'draft', 'guest_request'].includes(row.status))
    return false;
  if (
    row.expires_at &&
    Number.isFinite(parseMoscow(row.expires_at)) &&
    parseMoscow(row.expires_at) <= now
  )
    return false;
  return [
    'hold',
    'awaiting_payment',
    'awaiting_confirmation',
    'confirmed',
    'paid',
    'blocked',
  ].includes(row.status);
}
export function bookingNeedsAction(row: any): boolean {
  if (row.requires_attention) return true;
  if (['cancelled', 'draft', 'blocked'].includes(row.status)) return false;
  if (row.expires_at && parseMoscow(row.expires_at) <= Date.now()) return false;
  return (
    ['awaiting_confirmation', 'guest_request'].includes(row.status) ||
    (['cash', 'invoice', 'postpay'].includes(row.payment_method) &&
      !['paid', 'refunded'].includes(row.payment_status))
  );
}
export function supportNeedsAction(row: any): boolean {
  if (['completed', 'cancelled'].includes(row.status)) return false;
  return (
    row.status === 'new' ||
    Number(row.last_customer_seq || 0) > Number(row.last_support_seq || 0)
  );
}
export function fingerprint(value: unknown): string {
  function sort(v: any): any {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, sort(v[k])]),
      );
    return v;
  }
  return createHash('sha256')
    .update(JSON.stringify(sort(value)))
    .digest('hex');
}
export function checkVersion(row: any, version: unknown) {
  if (integer(version, 'revision', 1) !== row.revision)
    fail('revision_conflict', 'Запись уже изменена. Обновите карточку.', 409, {
      revision: row.revision,
    });
}
export function monthlyPeriod(today: string, resetDay: number) {
  const [year, month] = dateValue(today).split('-').map(Number);
  const reset = (y: number, m: number) => {
    const date = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(resetDay, end));
    return date.toISOString().slice(0, 10);
  };
  const thisReset = reset(year, month);
  const start = today < thisReset ? reset(year, month - 1) : thisReset;
  const [sy, sm] = start.split('-').map(Number);
  const next = reset(sy, sm + 1);
  return {
    start,
    end: new Date(Date.parse(next + 'T00:00:00Z') - 86400000)
      .toISOString()
      .slice(0, 10),
    next,
  };
}

export function paymentPolicy(
  method: string,
  created: string,
  date: string,
  startMinute: number,
  settings: any = {},
) {
  const policy: any = {
    kind: 'none',
    requested_payment_method: method,
    payment_method: method,
    due_at: null,
    postpay_warn_at: null,
    postpay_due_at: null,
    overdue_state: 'none',
  };
  const now = parseMoscow(created);
  if (method === 'invoice') {
    const start = Date.parse(date + 'T00:00:00+03:00') + startMinute * 60000;
    policy.kind = 'invoice';
    policy.overdue_state = 'active';
    policy.due_at = sqlNow(
      new Date(
        Math.min(
          now + Math.max(1, Number(settings.ttl_hours || 72)) * 3600000,
          start - Math.max(0, Number(settings.lead_hours ?? 6)) * 3600000,
        ),
      ),
    );
  } else if (method === 'postpay') {
    policy.kind = 'postpay';
    policy.overdue_state = 'active';
    policy.postpay_warn_at = sqlNow(new Date(now + 3 * 86400000));
    policy.postpay_due_at = sqlNow(new Date(now + 7 * 86400000));
  }
  return policy;
}
