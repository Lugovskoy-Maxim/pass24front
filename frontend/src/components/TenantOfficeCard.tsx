'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  OfficeFeatures,
  OfficeService,
  OFFICE_FIELD_LABELS,
  officeServices,
  servicePrice,
} from '@/lib/office-services';
import { OfficeCategoryBadge } from './OfficeCategoryBadge';
import { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useConfig } from '@/hooks/useConfig';
import { canUseTenantServiceRequests } from '@/lib/permissions';

export function TenantOfficeCard({
  office,
  preview = false,
}: {
  office: OfficeFeatures & {
    id: string;
    number?: string;
    title?: string;
    floor?: string;
    businessCenterName?: string;
  };
  preview?: boolean;
}) {
  const { user } = useAuth();
  const config = useConfig();
  const requestsEnabled = canUseTenantServiceRequests(user, config);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<OfficeService | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [receipt, setReceipt] = useState<string | null>(null);
  const [key, setKey] = useState('');
  async function order() {
    if (!requestsEnabled || !selected || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await officeServices.order(
        {
          officeId: office.id,
          serviceId: selected.id,
          quantity,
          subject: selected.name,
          body: `${selected.name}: ${quantity} ${selected.unit}. ${comment.trim()}`,
        },
        key,
      );
      setReceipt(result.ticket.id);
      setSelected(null);
    } catch (e) {
      setMessage(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const fields = Object.entries(office.details || {}).filter(
    ([, value]) => value,
  );
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
      <div className="flex justify-between gap-3 items-start">
        <div>
          <h3 className="font-semibold">
            {office.number ? `Офис ${office.number}` : office.title}
          </h3>
          <p className="text-xs text-[var(--muted)]">
            {[office.businessCenterName, office.floor && `${office.floor} этаж`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <OfficeCategoryBadge category={office.category} />
      </div>
      {office.details?.packageName && (
        <p className="text-sm">{office.details.packageName}</p>
      )}
      {(fields.length > 0 || !!office.services?.length) && (
        <button
          type="button"
          className="btn btn-secondary text-sm"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {expanded ? 'Свернуть' : 'Информация и услуги'}
        </button>
      )}
      {expanded && (
        <div className="space-y-4">
          <dl className="grid sm:grid-cols-2 gap-3">
            {fields
              .filter(([field]) => field !== 'packageName')
              .map(([field, value]) => (
                <div key={field} className="min-w-0">
                  <dt className="text-xs text-[var(--muted)]">
                    {OFFICE_FIELD_LABELS[field] || field}
                  </dt>
                  <dd className="text-sm whitespace-pre-wrap break-words mt-1">
                    {value}
                  </dd>
                </div>
              ))}
          </dl>
          {!!office.services?.length && (
            <div className="space-y-2">
              <h4 className="font-semibold">Услуги и условия</h4>
              {office.services.map((service) => (
                <div
                  key={service.id}
                  className="rounded-lg bg-[var(--surface-muted)] p-3 space-y-1"
                >
                  <div className="font-medium">{service.name}</div>
                  <div className="text-sm">{servicePrice(service)}</div>
                  {service.description && (
                    <p className="text-xs text-[var(--muted)] whitespace-pre-wrap">
                      {service.description}
                    </p>
                  )}
                  {service.conditions && (
                    <p className="text-sm whitespace-pre-wrap">
                      {service.conditions}
                    </p>
                  )}
                  {!preview &&
                    service.orderable &&
                    service.mode !== 'unavailable' &&
                    (service.bookingRoomIds?.length ? (
                      <Link
                        className="btn btn-secondary text-sm mt-2"
                        href={`/meeting-rooms?officeId=${encodeURIComponent(office.id)}`}
                      >
                        Забронировать
                      </Link>
                    ) : (
                      requestsEnabled && (
                        <button
                          type="button"
                          className="btn btn-secondary text-sm mt-2"
                          onClick={() => {
                            setSelected(service);
                            setKey(crypto.randomUUID());
                            setQuantity(1);
                            setComment('');
                            setMessage('');
                          }}
                        >
                          {service.mode === 'request'
                            ? 'Уточнить стоимость'
                            : 'Заказать'}
                        </button>
                      )
                    ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {selected && requestsEnabled && (
        <div className="rounded-lg border border-[var(--border)] p-3 space-y-3">
          <h4 className="font-semibold">{selected.name}</h4>
          <label className="block text-sm">
            Количество
            <input
              className="input mt-1"
              type="number"
              min={1}
              max={1000}
              value={quantity}
              onChange={(e) => {
                setQuantity(Number(e.target.value));
                setKey(crypto.randomUUID());
              }}
            />
          </label>
          <label className="block text-sm">
            Комментарий
            <textarea
              className="input mt-1"
              value={comment}
              maxLength={3000}
              onChange={(e) => {
                setComment(e.target.value);
                setKey(crypto.randomUUID());
              }}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || quantity < 1 || !Number.isInteger(quantity)}
              onClick={() => void order()}
            >
              {busy ? 'Отправка…' : 'Отправить заявку'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
      {message && (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {message}
        </p>
      )}
      {receipt && (
        <p className="text-sm" role="status">
          Создана заявка №{receipt}
        </p>
      )}
    </article>
  );
}
