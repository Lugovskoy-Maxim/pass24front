import { request } from './api';

export type OfficeCategory = {
  code: string;
  name: string;
  color: string;
  order: number;
};
export type ServiceRule = {
  categoryCode: string;
  show: boolean;
  orderable: boolean;
  mode: 'paid' | 'included' | 'quota' | 'unavailable' | 'request';
  priceMinor: number | null;
  unit: 'hour' | 'item' | 'order' | 'month';
  freeMinutes: number;
  conditions: string;
  serviceId?: string;
};
export type OfficeService = ServiceRule & {
  id: string;
  name: string;
  description: string;
  revision: number;
  bookingRoomIds: number[];
};
export type PriceService = {
  id: string;
  name: string;
  description: string;
  propertyId: string | null;
  active: boolean;
  order: number;
  rules: ServiceRule[];
  bookingRoomIds: number[];
  revision: number;
};
export type OfficeDetails = {
  values: Record<string, string>;
  visibleFields: string[];
  serviceOverrides: ServiceRule[];
};
export type OfficeFeatures = {
  category?: OfficeCategory | null;
  details?: Record<string, string>;
  services?: OfficeService[];
  serviceRevision?: number;
};
export type AdminOfficeDetails = {
  id: string;
  propertyId: string;
  officeFormat: string;
  category: OfficeCategory | null;
  externalId?: string;
  revision: number;
  details: OfficeDetails;
};
export const OFFICE_FIELD_LABELS: Record<string, string> = {
  packageName: 'Текущий пакет обслуживания',
  includedServices: 'Что входит в обслуживание',
  provider: 'Провайдер',
  connectionStatus: 'Статус подключения',
  downloadMbps: 'Входящая скорость, Мбит/с',
  uploadMbps: 'Исходящая скорость, Мбит/с',
  measuredDownloadMbps: 'Измеренная входящая скорость, Мбит/с',
  measuredUploadMbps: 'Измеренная исходящая скорость, Мбит/с',
  measuredAt: 'Дата измерения',
  connectionMode: 'Способ подключения (DHCP / статический)',
  localIp: 'Локальный IP',
  subnet: 'Маска / префикс сети',
  gateway: 'Шлюз',
  dns: 'DNS',
  networkPort: 'Порт подключения',
  vlan: 'VLAN',
  publicIp: 'Публичный IP',
  publicIpStatus: 'Состояние публичного IP',
  routerModel: 'Модель роутера',
  routerStatus: 'Состояние роутера',
  instructions: 'Инструкция подключения',
  category: 'Категория офиса',
  services: 'Услуги и прайс',
};
export const SERVICE_MODES = {
  paid: 'Платно',
  included: 'Включено',
  quota: 'Бесплатно в пределах лимита',
  unavailable: 'Недоступно',
  request: 'Стоимость уточняется',
};
export const SERVICE_UNITS = {
  hour: 'час',
  item: 'шт.',
  order: 'заказ',
  month: 'месяц',
};
export const officeMoney = (minor: number) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 2,
  }).format(minor / 100);
export function publishedServicePrices(services: OfficeService[]) {
  return services.filter(
    (service) =>
      service.show &&
      service.name.trim() &&
      service.mode !== 'unavailable' &&
      service.priceMinor != null &&
      Number.isFinite(service.priceMinor) &&
      service.priceMinor >= 0,
  );
}
export function servicePrice(service: ServiceRule) {
  if (service.mode === 'included') return 'Включено';
  if (service.mode === 'unavailable') return 'Недоступно';
  if (service.mode === 'request' || service.priceMinor == null)
    return 'Стоимость уточняется';
  const price = `${officeMoney(service.priceMinor)} / ${SERVICE_UNITS[service.unit]}`;
  return service.mode === 'quota'
    ? `${service.freeMinutes / 60} ч в месяц бесплатно, далее ${price}`
    : price;
}
const body = (value: unknown, method = 'POST') => ({
  method,
  body: JSON.stringify(value),
});
function editableOffice(office: AdminOfficeDetails): AdminOfficeDetails {
  return {
    ...office,
    details: {
      values: office.details?.values ?? {},
      visibleFields: office.details?.visibleFields ?? [],
      serviceOverrides: office.details?.serviceOverrides ?? [],
    },
  };
}
export const officeServices = {
  categories: () =>
    request<{ categories: OfficeCategory[] }>('/office-services/categories'),
  saveCategory: (value: OfficeCategory) =>
    request<OfficeCategory>('/office-services/admin/categories', body(value)),
  prices: () =>
    request<{ services: PriceService[] }>('/office-services/admin/prices'),
  savePrice: (value: Omit<PriceService, 'id'>, id?: string) =>
    request<{ service: PriceService }>(
      `/office-services/admin/prices${id ? `/${id}` : ''}`,
      body(value, id ? 'PATCH' : 'POST'),
    ),
  office: async (id: string) => {
    const result = await request<{ office: AdminOfficeDetails }>(
      `/office-services/admin/offices/${id}`,
    );
    return { ...result, office: editableOffice(result.office) };
  },
  saveOffice: async (
    id: string,
    value: { details: OfficeDetails; officeFormat: string; revision: number },
  ) => {
    const result = await request<{ office: AdminOfficeDetails }>(
      `/office-services/admin/offices/${id}`,
      body(value, 'PATCH'),
    );
    return { ...result, office: editableOffice(result.office) };
  },
  tenantOffice: (id: string) =>
    request<{ office: OfficeFeatures & { id: string; number: string } }>(
      `/office-services/offices/${id}`,
    ),
  order: (
    value: {
      officeId: string;
      serviceId: string;
      quantity: number;
      subject: string;
      body: string;
    },
    key: string,
  ) =>
    request<{ ticket: { id: string } }>('/service-requests', {
      ...body({ ...value, topic: 'services' }),
      headers: { 'Idempotency-Key': key },
    }),
};
export type BookingRoom = {
  id: number;
  title: string;
  type: string;
  config: {
    price_label: string;
    work_start_minute: number;
    work_end_minute: number;
    slot_step_min: number;
  };
  office_service?: OfficeService;
};
export type BookingContext = {
  rooms: BookingRoom[];
  officeId: string;
  profileId: string;
  availableMinutes: number;
  monthlyMinutes: number;
  canSpendHours: boolean;
  mode: string;
};
export type BookingDraft = {
  officeId: string;
  roomId: number;
  date: string;
  startMinute: number;
  endMinute: number;
  writeoffMinutes: number;
  paymentMethod: string;
  comment: string;
  pricingFingerprint?: string;
};
export type BookingQuote = {
  total_amount_minor: number;
  base_amount_minor: number;
  discount_minor: number;
  writeoff_min: number;
  pricing_fingerprint: string;
};
export const officeBookings = {
  context: (officeId: string) =>
    request<BookingContext>(
      `/office-services/bookings/context?officeId=${encodeURIComponent(officeId)}`,
    ),
  slots: (officeId: string, roomId: number, date: string) =>
    request<{
      slots: { start_minute: number; end_minute: number; state: string }[];
    }>(
      `/office-services/bookings/rooms/${roomId}/slots?officeId=${encodeURIComponent(officeId)}&date=${encodeURIComponent(date)}`,
    ),
  quote: (value: BookingDraft) =>
    request<BookingQuote>('/office-services/bookings/quote', body(value)),
  create: (value: BookingDraft, key: string) =>
    request<{ booking: { id: number; number: string; status_label: string } }>(
      '/office-services/bookings',
      { ...body(value), headers: { 'Idempotency-Key': key } },
    ),
};
