import { request, downloadFileResponse, getToken } from './api';

export type Segment = {
  date: string;
  start_minute: number;
  end_minute: number;
};
export type Attachment = {
  attachment_id: number;
  original_name: string;
  size: number;
  mime_type: string;
};
export type Ticket = {
  id: number;
  subject: string;
  topic_key: string;
  topic_label: string;
  status: string;
  status_label: string;
  owner_subject: string;
  profile_id?: string;
  requester_name: string;
  booking_id?: number;
  revision: number;
  last_message_at: string;
  created_at: string;
  last_message_preview: string;
  needs_action: boolean;
};
export type TicketDetail = {
  ticket: Ticket;
  can_reply: boolean;
  messages: Array<{
    id: number;
    author_type: string;
    author_label: string;
    message_text: string;
    created_at: string;
    attachments: Attachment[];
  }>;
};
export type Booking = {
  id: number;
  number: string;
  room_id: number;
  room: {
    title: string;
    type: string;
    business_center?: { id: number; name: string };
  };
  segments: Segment[];
  date: string;
  status: string;
  status_label: string;
  payment_status: string;
  payment_method: string;
  total_amount_minor: number;
  base_amount_minor: number;
  discount_minor: number;
  services_amount_minor: number;
  writeoff_min: number;
  hours_debited_min: number;
  resource_profile_id?: string;
  profile_id?: string;
  owner_subject?: string;
  guest: boolean;
  requisites_complete?: boolean;
  requester: { name: string; phone: string; email: string };
  comment_client: string;
  comment_admin: string;
  revision: number;
  created_at: string;
  needs_action: boolean;
  requires_attention: boolean;
  attention_reason?: string;
  services: Array<{
    service_id: number;
    name: string;
    quantity: number;
    total_amount_minor: number;
  }>;
  invoice_id?: number;
};
export type HoursAccount = {
  resource_profile_id: string;
  balance_min: number;
  available_balance_min?: number;
  revision: number;
  accrual_date: string;
  expires_date: string;
};
export type BookingDetail = {
  booking: Booking;
  payments: Array<{
    id: number;
    provider: string;
    amount_minor: number;
    status: string;
    paid_at?: string;
  }>;
  invoice: { id: number; invoice_no: string; status: string } | null;
  history: Array<{
    id: number;
    action: string;
    actor_label: string;
    created_at: string;
  }>;
  hours_account: HoursAccount | null;
  refundable_hours_min: number;
};
export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  topics?: Record<string, string>;
  statuses: Record<string, string>;
};
export type Counts = {
  bookings: number;
  support: number;
  total: number;
  mode: 'mstyle' | 'paused' | 'pass';
};
export type Catalog = {
  version: string;
  rooms: Array<{
    id: number;
    title: string;
    type: string;
    business_center?: { id: number; name: string };
    config: {
      work_start_minute: number;
      work_end_minute: number;
      slot_step_min: number;
      price_label: string;
    };
  }>;
  services: Array<{ id: number; name: string; price_minor: number }>;
};
const pending = new Map<string, string>();
export async function command<T>(
  path: string,
  body: unknown,
  method = 'POST',
): Promise<T> {
  const fingerprint = method + path + JSON.stringify(body);
  const key = pending.get(fingerprint) || crypto.randomUUID();
  pending.set(fingerprint, key);
  const result = await request<T>(path, {
    method,
    body: JSON.stringify(body),
    headers: { 'Idempotency-Key': key },
  });
  pending.delete(fingerprint);
  window.dispatchEvent(new Event('pass-work-queue-refresh'));
  return result;
}
export function params(values: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return '?' + query.toString();
}
export const operations = {
  counts: () => request<Counts>('/admin/work-queue/counts'),
  tickets: (q: Record<string, string | number>) =>
    request<Page<Ticket>>('/admin/service-requests' + params(q)),
  ticket: (id: number) =>
    request<TicketDetail>('/admin/service-requests/' + id),
  bookings: (q: Record<string, string | number>) =>
    request<Page<Booking>>('/admin/booking-requests' + params(q)),
  booking: (id: number) =>
    request<BookingDetail>('/admin/booking-requests/' + id),
  catalog: () => request<Catalog>('/admin/booking-requests/catalog'),
  profiles: (search: string) =>
    request<{
      items: Array<{
        profile_id: string;
        label: string;
        owner_subject: string;
        owner_name: string;
      }>;
    }>('/admin/booking-requests/profiles' + params({ q: search })),
  hours: (profile: string) =>
    request<{
      account: HoursAccount;
      history: Array<{
        id: number;
        type: string;
        amount_min: number;
        balance_after_min: number;
        comment: string;
        created_at: string;
      }>;
    }>('/admin/resident-hours/' + encodeURIComponent(profile)),
  async upload(file: File) {
    if (file.size > 10 * 1024 * 1024)
      throw new Error('Максимальный размер файла — 10 МБ.');
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.readAsDataURL(file);
    });
    return command<Attachment>('/admin/service-requests/attachments', {
      name: file.name,
      base64,
    });
  },
  async download(path: string, name: string) {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000/api';
    const response = await fetch(base + path, {
      headers: { Authorization: 'Bearer ' + getToken() },
    });
    return downloadFileResponse(response, name);
  },
};
export const money = (n: number) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 2,
  }).format(n / 100);
export const clock = (n: number) =>
  String(Math.floor(n / 60)).padStart(2, '0') +
  ':' +
  String(n % 60).padStart(2, '0');
export const minutes = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return h * 60 + m;
};
export const paymentLabels: Record<string, string> = {
  cash: 'Наличные',
  invoice: 'По счёту',
  postpay: 'Постоплата',
  card_online: 'Карта онлайн',
  qr_code: 'QR-код',
  balance: 'Резидентские часы',
};
