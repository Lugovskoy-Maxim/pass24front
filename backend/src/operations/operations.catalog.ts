import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID } from 'crypto';
import {
  fail,
  fingerprint,
  integer,
  normalizeSegments,
} from './operations.rules';

@Injectable()
export class OperationsCatalog {
  constructor(private readonly config: ConfigService) {}
  async siteRequest(path: 'catalog' | 'render-invoice', payload: any = {}) {
    const base = (
      this.config.get<string>('MSTYLE_OPERATIONS_SITE_URL') || ''
    ).replace(/\/$/, '');
    const secret =
      this.config.get<string>('MSTYLE_OPERATIONS_SHARED_SECRET') || '';
    if (!base || secret.length < 32)
      fail(
        'catalog_unavailable',
        'Связь с каталогом Mstyle не настроена.',
        503,
      );
    const url = new URL(
      base + '/wp-json/tf-mstyle-theme/v1/pass-operations/' + path,
    );
    if (
      url.protocol !== 'https:' &&
      !(
        this.config.get('NODE_ENV') !== 'production' &&
        ['127.0.0.1', 'localhost'].includes(url.hostname)
      )
    )
      fail(
        'catalog_unavailable',
        'Требуется защищённое подключение к Mstyle.',
        503,
      );
    const body = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = randomUUID();
    const signature = createHmac('sha256', secret)
      .update(timestamp + '\n' + nonce + '\n' + path + '\n' + body)
      .digest('hex');
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Pass-Timestamp': timestamp,
          'X-Pass-Nonce': nonce,
          'X-Pass-Signature': signature,
        },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      fail(
        'catalog_unavailable',
        'Mstyle временно недоступен. Повторите позже.',
        503,
      );
    }
    if (!response.ok)
      fail('catalog_unavailable', 'Не удалось получить данные Mstyle.', 503);
    if (path === 'render-invoice')
      return Buffer.from(await response.arrayBuffer());
    return response.json();
  }
  async get(): Promise<any> {
    const data = await this.siteRequest('catalog');
    if (
      !data?.version ||
      !Array.isArray(data.rooms) ||
      !Array.isArray(data.services)
    )
      fail('catalog_unavailable', 'Некорректный ответ каталога.', 503);
    return data;
  }
  quote(catalog: any, input: any) {
    const roomId = integer(input.room_id, 'room_id', 1);
    const room = catalog.rooms.find(
      (r: any) => r.id === roomId && r.active !== false,
    );
    if (!room) fail('room_not_found', 'Помещение недоступно.', 404);
    const cfg = room.config;
    const segments = normalizeSegments(input.segments, cfg.slot_step_min || 30);
    const duration = segments.reduce((sum, s) => sum + s.duration_min!, 0);
    for (const s of segments) {
      if (
        s.start_minute < cfg.work_start_minute ||
        s.end_minute > cfg.work_end_minute
      )
        fail(
          'outside_working_hours',
          'Время выходит за часы работы помещения.',
          400,
        );
    }
    const price = integer(cfg.price_amount_minor, 'price_amount_minor');
    const slotPrice = (minutes: number) =>
      cfg.price_unit === 'hour' ? Math.round((price * minutes) / 60) : price;
    const dayOffice =
      room.type === 'office' && input.booking_mode === 'day_office';
    const base = dayOffice
      ? integer(cfg.daily_price_minor || price, 'daily_price_minor') *
        new Set(segments.map((s) => s.date)).size
      : slotPrice(duration);
    const requestedHours =
      input.payment_method === 'balance'
        ? duration
        : integer(input.writeoff_min || 0, 'writeoff_min');
    if (requestedHours > duration || requestedHours % (cfg.slot_step_min || 30))
      fail(
        'validation_error',
        'Некорректное количество резидентских часов.',
        400,
      );
    if (dayOffice && requestedHours)
      fail(
        'validation_error',
        'Резидентские часы недоступны для посуточной аренды офиса.',
        400,
      );
    const selected: any[] = [];
    if (input.services != null && !Array.isArray(input.services))
      fail('validation_error', 'Некорректные дополнительные услуги.', 400);
    for (const requested of input.services || []) {
      const id = integer(
        typeof requested === 'number'
          ? requested
          : (requested.id ?? requested.service_id),
        'service_id',
        1,
      );
      if (selected.some((s) => s.service_id === id))
        fail('validation_error', 'Услуга указана повторно.', 400);
      const service = catalog.services.find(
        (s: any) => s.id === id && s.is_active && s.booking_enabled !== false,
      );
      if (
        !service ||
        (service.binding_required &&
          !service.room_ids?.includes(roomId) &&
          !service.room_types?.includes(room.type))
      )
        fail(
          'service_unavailable',
          'Выбранная услуга недоступна для помещения.',
          400,
        );
      const quantity = integer(
        requested.quantity ?? requested.qty ?? 1,
        'quantity',
        1,
        1000,
      );
      const amount =
        (service.price_unit === 'per_hour'
          ? Math.round((service.price_minor * duration) / 60)
          : service.price_minor) * quantity;
      selected.push({
        service_id: id,
        name: service.name,
        quantity,
        qty: quantity,
        price_minor: Math.round(amount / quantity),
        unit_price_minor: service.price_minor,
        price_unit: service.price_unit,
        total_amount_minor: amount,
      });
    }
    const servicesAmount = selected.reduce(
      (sum, s) => sum + s.total_amount_minor,
      0,
    );
    if (input.payment_method === 'balance' && servicesAmount)
      fail(
        'balance_services_not_supported',
        'Часы покрывают только время бронирования. Для услуг выберите другой способ оплаты.',
        400,
      );
    const dueBase = requestedHours
      ? slotPrice(Math.max(0, duration - requestedHours))
      : base;
    // Zero duration must never charge the flat price a second time.
    const paidBase = requestedHours === duration ? 0 : dueBase;
    return {
      booking_mode: dayOffice ? 'day_office' : 'slots',
      room,
      room_id: roomId,
      segments,
      date: segments[0].date,
      start_minute: segments[0].start_minute,
      end_minute: segments[segments.length - 1].end_minute,
      duration_min: duration,
      services: selected,
      base_amount_minor: base,
      services_amount_minor: servicesAmount,
      discount_minor: base - paidBase,
      total_amount_minor: paidBase + servicesAmount,
      writeoff_min: requestedHours,
      currency: 'RUB',
      catalog_version: catalog.version,
      pricing_fingerprint: fingerprint({
        version: catalog.version,
        roomId,
        segments,
        selected,
        requestedHours,
      }),
    };
  }
}
