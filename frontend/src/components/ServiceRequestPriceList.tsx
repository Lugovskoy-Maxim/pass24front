'use client';

import { useEffect, useId, useState } from 'react';
import { List, ChevronDown } from 'lucide-react';
import { getErrorMessage } from '@/lib/api';
import {
  OfficeService,
  officeMoney,
  officeServices,
  publishedServicePrices,
  SERVICE_UNITS,
} from '@/lib/office-services';

export function ServiceRequestPriceList({ officeId }: { officeId: string }) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [services, setServices] = useState<OfficeService[] | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setServices(null);
    setError('');
    if (expanded && officeId) {
      void officeServices
        .tenantOffice(officeId)
        .then(({ office }) => {
          if (active)
            setServices(publishedServicePrices(office.services || []));
        })
        .catch((err) => {
          if (active) setError(getErrorMessage(err));
        });
    }
    return () => {
      active = false;
    };
  }, [expanded, officeId, retry]);
  return (
    <div className="request-price-list">
      <button
        type="button"
        className="btn btn-secondary"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded((value) => !value)}
      >
        <List size={16} /> Прайс на услуги <ChevronDown size={14} />
      </button>
      {expanded && (
        <div
          className="request-price-list__content"
          id={id}
          aria-label="Прайс на услуги"
        >
          {!officeId ? (
            <p>Выберите офис, чтобы посмотреть его прайс.</p>
          ) : error ? (
            <div role="alert">
              <p>{error}</p>
              <button
                type="button"
                className="btn btn-secondary btn-sm mt-2"
                onClick={() => setRetry((value) => value + 1)}
              >
                Повторить загрузку
              </button>
            </div>
          ) : services == null ? (
            <p role="status">Загрузка прайса…</p>
          ) : services.length ? (
            <ul>
              {services.map((service) => (
                <li key={service.id}>
                  <strong>{service.name}</strong>
                  <span>
                    {officeMoney(service.priceMinor!)} /{' '}
                    {SERVICE_UNITS[service.unit]}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Прайс пока не заполнен.</p>
          )}
        </div>
      )}
    </div>
  );
}
