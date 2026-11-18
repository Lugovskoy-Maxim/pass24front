import { request, User } from './api';
import type {
  BookingContext,
  BookingDraft,
  BookingQuote,
} from './office-services';

export type KioskSlot = {
  start_minute: number;
  end_minute: number;
  state: string;
};
export type KioskStatus = {
  room: { id: number; title: string };
  date: string;
  serverTime: string;
  slots: KioskSlot[];
};
export type KioskSession = { token: string; user: User };
export const kioskTime = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

export function kioskRangeFree(slots: KioskSlot[], start: number, end: number) {
  if (start < 0 || end <= start) return false;
  const range = slots.filter(
    (s) => s.start_minute >= start && s.end_minute <= end,
  );
  return (
    range.length > 0 &&
    range[0].start_minute === start &&
    range[range.length - 1].end_minute === end &&
    range.every(
      (s, i) =>
        s.state === 'free' &&
        (i === 0 || range[i - 1].end_minute === s.start_minute),
    )
  );
}

// An explicit token bypasses the ordinary site's localStorage session and redirects.
const call = <T>(
  path: string,
  token: string | null,
  value?: unknown,
  method = 'POST',
) =>
  request<T>(
    path,
    value === undefined
      ? { cache: 'no-store' }
      : {
          method,
          body: JSON.stringify(value),
          cache: 'no-store',
        },
    { token },
  );

export const kioskApi = {
  login: (login: string, password: string) =>
    call<KioskSession>('/auth/login', null, { login, email: login, password }),
  rooms: (token: string) =>
    call<{ rooms: { id: number; title: string }[] }>('/kiosk/rooms', token),
  bind: (token: string, roomId: number, previousToken?: string) =>
    call<{ token: string }>('/kiosk/device', token, { roomId, previousToken }),
  revoke: (token: string, deviceToken: string) =>
    call('/kiosk/device', token, { token: deviceToken }, 'DELETE'),
  status: (token: string) => call<KioskStatus>('/kiosk/status', token),
  context: (token: string, officeId: string) =>
    call<BookingContext>(
      `/office-services/bookings/context?officeId=${encodeURIComponent(officeId)}`,
      token,
    ),
  slots: (token: string, officeId: string, roomId: number, date: string) =>
    call<{ slots: KioskSlot[] }>(
      `/office-services/bookings/rooms/${roomId}/slots?officeId=${encodeURIComponent(officeId)}&date=${encodeURIComponent(date)}`,
      token,
    ),
  quote: (token: string, draft: BookingDraft) =>
    call<BookingQuote>('/office-services/bookings/quote', token, draft),
  create: (token: string, draft: BookingDraft, key: string) =>
    request<{
      booking: { id: number; number: string; status_label: string };
    }>(
      '/office-services/bookings',
      {
        method: 'POST',
        body: JSON.stringify(draft),
        headers: { 'Idempotency-Key': key },
      },
      { token },
    ),
};
