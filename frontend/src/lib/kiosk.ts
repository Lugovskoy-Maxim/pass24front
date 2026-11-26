import { API_URL, request, User } from './api';
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
export type KioskBookingContext = BookingContext & {
  onlinePayment?: KioskPaymentSetup;
  bookingProfileReady?: boolean;
};
export type KioskLoginChallenge = {
  approvalCode: string;
  claimCode: string;
  displayCode: string;
};
export type KioskPayment = {
  bookingId: number;
  bookingNumber?: string;
  token: string;
  amount: number;
};
export type KioskPaymentStatus = {
  state: 'pending' | 'paid' | 'canceled';
  statusLabel: string;
  confirmationUrl: string | null;
  preparation: 'expired' | 'contact_required' | 'retrying' | null;
};
export type KioskPaymentSetup =
  'incomplete' | 'capture_required' | 'configured' | 'unavailable';
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

export const kioskStandbyVideoUrl = (version: string | null) =>
  version
    ? `${API_URL}/kiosk/standby/video/${encodeURIComponent(version)}`
    : '/kiosk-standby.mp4';

export const kioskApi = {
  standby: () => call<{ version: string | null }>('/kiosk/standby', null),
  uploadStandby: (file: File) => {
    const body = new FormData();
    body.append('video', file);
    return request<{ version: string }>('/kiosk/standby', {
      method: 'PUT',
      body,
    });
  },
  resetStandby: () =>
    request<{ version: null }>('/kiosk/standby', { method: 'DELETE' }),
  startLogin: (deviceToken: string) =>
    call<KioskLoginChallenge>('/kiosk/login/start', deviceToken, {}),
  claimLogin: (deviceToken: string, code: string) =>
    call<{ state: 'pending' } | { state: 'approved'; session: KioskSession }>(
      '/kiosk/login/claim',
      deviceToken,
      { code },
    ),
  previewLogin: (token: string, code: string) =>
    call<{ roomTitle: string; displayCode: string }>(
      '/kiosk/login/preview',
      token,
      { code },
    ),
  approveLogin: (token: string, code: string) =>
    call<{ ok: true }>('/kiosk/login/approve', token, { code }),
  login: (login: string, password: string) =>
    call<KioskSession>('/auth/login', null, { login, password }),
  requestSms: (token: string, phone: string) =>
    call<{ ok: true }>('/kiosk/login/sms/request', token, { phone }),
  confirmSms: (token: string, phone: string, code: string) =>
    call<KioskSession>('/kiosk/login/sms/confirm', token, { phone, code }),
  rooms: (token: string) =>
    call<{
      rooms: { id: number; title: string }[];
      onlinePayment?: KioskPaymentSetup;
    }>('/kiosk/rooms', token),
  bind: (token: string, roomId: number, previousToken?: string) =>
    call<{ token: string }>('/kiosk/device', token, { roomId, previousToken }),
  revoke: (token: string, deviceToken: string) =>
    call('/kiosk/device', token, { token: deviceToken }, 'DELETE'),
  status: (token: string, tomorrow = false) =>
    call<KioskStatus>(
      tomorrow ? '/kiosk/status?day=tomorrow' : '/kiosk/status',
      token,
    ),
  context: (token: string, officeId: string) =>
    call<KioskBookingContext>(
      `/office-services/bookings/context?kiosk=1&officeId=${encodeURIComponent(officeId)}`,
      token,
    ),
  slots: (token: string, officeId: string, roomId: number, date: string) =>
    call<{ slots: KioskSlot[] }>(
      `/office-services/bookings/rooms/${roomId}/slots?officeId=${encodeURIComponent(officeId)}&date=${encodeURIComponent(date)}`,
      token,
    ),
  quote: (token: string, draft: BookingDraft) =>
    call<BookingQuote>('/office-services/bookings/quote?kiosk=1', token, draft),
  paymentStatus: ({ bookingId, token }: KioskPayment) =>
    call<KioskPaymentStatus>('/kiosk/payment-status', null, {
      bookingId,
      token,
    }),
  create: (token: string, draft: BookingDraft, key: string) =>
    request<{
      booking: {
        id: number;
        number?: string;
        status: string;
        status_label: string;
        total_amount_minor: number;
      };
      payment: { payment_token: string };
    }>(
      '/office-services/bookings/kiosk',
      {
        method: 'POST',
        body: JSON.stringify(draft),
        headers: { 'Idempotency-Key': key },
      },
      { token },
    ),
};
