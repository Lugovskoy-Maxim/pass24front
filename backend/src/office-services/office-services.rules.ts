import { BadRequestException } from '@nestjs/common';
import { isIP } from 'node:net';

export const DEFAULT_OFFICE_CATEGORIES = [
  { code: 'standard', name: 'Стандарт', color: '#64748b', order: 0 },
  { code: 'standard_plus', name: 'Стандарт+', color: '#2563eb', order: 1 },
  { code: 'vip', name: 'VIP', color: '#9333ea', order: 2 },
  { code: 'design', name: 'Дизайн', color: '#b45309', order: 3 },
];
export const OFFICE_FIELDS = [
  'packageName',
  'includedServices',
  'provider',
  'connectionStatus',
  'downloadMbps',
  'uploadMbps',
  'measuredDownloadMbps',
  'measuredUploadMbps',
  'measuredAt',
  'connectionMode',
  'localIp',
  'subnet',
  'gateway',
  'dns',
  'networkPort',
  'vlan',
  'publicIp',
  'publicIpStatus',
  'routerModel',
  'routerStatus',
  'instructions',
  'category',
  'services',
] as const;
export type OfficeDetails = {
  values: Record<string, string>;
  visibleFields: string[];
  serviceOverrides: ServiceRule[];
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
export function invalid(message: string): never {
  throw new BadRequestException(message);
}
export function object(value: any, keys: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid('Ожидается объект');
  if (Object.keys(value).some((key) => !keys.includes(key)))
    invalid('Неизвестное поле');
  return value;
}
export function str(value: any, max = 2000) {
  if (typeof value !== 'string' || value.length > max)
    invalid('Некорректный текст');
  return value.trim();
}
export function num(value: any, max = 100000000, min = 0) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    invalid('Некорректное число');
  return value as number;
}
function bool(value: any) {
  if (typeof value !== 'boolean') invalid('Ожидается переключатель');
  return value;
}
export function normalizeOfficeCategory(value?: string) {
  const code = (value || '').trim().toLowerCase();
  if (
    [
      'standard+',
      'standard +',
      'standard-plus',
      'standart_plus',
      'стандарт+',
      'стандарт +',
    ].includes(code)
  )
    return 'standard_plus';
  return code;
}
export function categoryInput(value: any) {
  object(value, ['code', 'name', 'color', 'order']);
  const code = normalizeOfficeCategory(str(value.code, 64));
  if (!/^[a-z0-9_][a-z0-9_-]{0,63}$/.test(code))
    invalid('Некорректный код категории');
  const name = str(value.name, 80);
  const color = str(value.color, 7);
  if (!name || !/^#[0-9a-f]{6}$/i.test(color))
    invalid('Укажите название и цвет категории');
  return { code, name, color, order: num(value.order ?? 0, 1000) };
}
export function ruleInput(value: any, override = false): ServiceRule {
  object(value, [
    'categoryCode',
    'show',
    'orderable',
    'mode',
    'priceMinor',
    'unit',
    'freeMinutes',
    'conditions',
    ...(override ? ['serviceId'] : []),
  ]);
  const categoryCode = normalizeOfficeCategory(str(value.categoryCode, 64));
  if (!categoryCode) invalid('Выберите категорию');
  if (
    !['paid', 'included', 'quota', 'unavailable', 'request'].includes(
      value.mode,
    )
  )
    invalid('Выберите условия услуги');
  if (!['hour', 'item', 'order', 'month'].includes(value.unit))
    invalid('Выберите единицу расчёта');
  const priceMinor = value.priceMinor == null ? null : num(value.priceMinor);
  if (['paid', 'quota'].includes(value.mode) && priceMinor == null)
    invalid('Заполните стоимость');
  const freeMinutes = num(value.freeMinutes ?? 0, 44640);
  if (value.mode === 'quota' && (!freeMinutes || value.unit !== 'hour'))
    invalid('Для лимита укажите бесплатные минуты и расчёт по часам');
  return {
    categoryCode,
    show: bool(value.show),
    orderable: bool(value.orderable),
    mode: value.mode,
    priceMinor,
    unit: value.unit,
    freeMinutes,
    conditions: str(value.conditions ?? '', 4000),
    ...(override ? { serviceId: str(value.serviceId, 64) } : {}),
  };
}
export function detailsInput(value: any): OfficeDetails {
  object(value, ['values', 'visibleFields', 'serviceOverrides']);
  const values = object(
    value.values || {},
    OFFICE_FIELDS.filter((f) => !['category', 'services'].includes(f)),
  );
  const clean: Record<string, string> = {};
  for (const [key, raw] of Object.entries(values)) {
    const text = str(
      raw,
      ['instructions', 'includedServices'].includes(key) ? 8000 : 500,
    );
    if (text && ['localIp', 'gateway', 'publicIp'].includes(key) && !isIP(text))
      invalid('Проверьте IP-адрес');
    if (text && key === 'dns' && text.split(/[\s,;]+/).some((ip) => !isIP(ip)))
      invalid('Проверьте DNS');
    if (
      text &&
      /Mbps$/.test(key) &&
      (!/^\d+(\.\d+)?$/.test(text) || Number(text) > 100000)
    )
      invalid('Проверьте скорость интернета');
    clean[key] = text;
  }
  const visible = value.visibleFields || [];
  if (
    !Array.isArray(visible) ||
    visible.some((f) => !OFFICE_FIELDS.includes(f))
  )
    invalid('Некорректные настройки видимости');
  const overrides = value.serviceOverrides || [];
  if (!Array.isArray(overrides) || overrides.length > 200)
    invalid('Слишком много индивидуальных условий');
  const rules = overrides.map((rule) => ruleInput(rule, true));
  if (new Set(rules.map((r) => r.serviceId)).size !== rules.length)
    invalid('Услуга повторяется');
  return {
    values: clean,
    visibleFields: [...new Set(visible)] as string[],
    serviceOverrides: rules,
  };
}
export function serviceInput(value: any) {
  object(value, [
    'name',
    'description',
    'propertyId',
    'active',
    'order',
    'rules',
    'bookingRoomIds',
    'revision',
  ]);
  const name = str(value.name, 160);
  if (!name) invalid('Введите название услуги');
  if (!Array.isArray(value.rules) || value.rules.length > 100)
    invalid('Некорректные условия');
  const rules = value.rules.map((r) => ruleInput(r));
  if (new Set(rules.map((r) => r.categoryCode)).size !== rules.length)
    invalid('Категория повторяется');
  const bookingRoomIds = value.bookingRoomIds || [];
  if (!Array.isArray(bookingRoomIds) || bookingRoomIds.length > 200)
    invalid('Некорректные помещения');
  if (bookingRoomIds.length && rules.some((rule) => rule.unit !== 'hour'))
    invalid('Для переговорной укажите расчёт по часам');
  return {
    name,
    description: str(value.description ?? '', 4000),
    propertyId:
      value.propertyId == null || value.propertyId === ''
        ? null
        : str(value.propertyId, 24),
    active: bool(value.active),
    order: num(value.order ?? 0, 1000),
    rules,
    bookingRoomIds: [
      ...new Set(bookingRoomIds.map((id) => num(id, 2147483647, 1))),
    ],
  };
}
export function visibleOfficeValues(details?: Partial<OfficeDetails>) {
  const visible = new Set(details?.visibleFields || []);
  return Object.fromEntries(
    Object.entries(details?.values || {}).filter(
      ([key, value]) =>
        OFFICE_FIELDS.includes(key as any) && visible.has(key) && value,
    ),
  );
}
export function effectiveRule(
  service: any,
  office: any,
): ServiceRule | undefined {
  const code = normalizeOfficeCategory(office.officeFormat);
  return (
    office.serviceDetails?.serviceOverrides?.find(
      (rule: ServiceRule) =>
        rule.serviceId === String(service._id) && rule.categoryCode === code,
    ) || service.rules?.find((rule: ServiceRule) => rule.categoryCode === code)
  );
}
