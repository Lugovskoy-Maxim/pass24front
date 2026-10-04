'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AdminOfficeDetails,
  OFFICE_FIELD_LABELS,
  OfficeCategory,
  PriceService,
  officeServices,
} from '@/lib/office-services';
import { getErrorMessage } from '@/lib/api';
import { OfficeCategoryBadge } from './OfficeCategoryBadge';
import {
  OfficeServiceRuleEditor,
  emptyServiceRule,
} from './OfficeServiceRuleEditor';
import { TenantOfficeCard } from './TenantOfficeCard';

export function OfficeServiceEditor({ officeId }: { officeId: string }) {
  const [office, setOffice] = useState<AdminOfficeDetails | null>(null);
  const [categories, setCategories] = useState<OfficeCategory[]>([]);
  const [allServices, setServices] = useState<PriceService[]>([]);
  const [tab, setTab] = useState('service');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const load = useCallback(async () => {
    try {
      const [o, c, p] = await Promise.all([
        officeServices.office(officeId),
        officeServices.categories(),
        officeServices.prices(),
      ]);
      setOffice(o.office);
      setCategories(c.categories);
      setServices(p.services);
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [officeId]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!office)
    return (
      <div className="card p-5">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button className="btn btn-secondary" onClick={() => void load()}>
              Повторить
            </button>
          </>
        ) : (
          'Загрузка обслуживания…'
        )}
      </div>
    );
  const category = categories.find((c) => c.code === office.officeFormat);
  const services = allServices.filter(
    (s) => !s.propertyId || s.propertyId === office.propertyId,
  );
  function setValue(field: string, value: string) {
    setSaved(false);
    setOffice(
      (o) =>
        o && {
          ...o,
          details: {
            ...o.details,
            values: { ...o.details.values, [field]: value },
          },
        },
    );
  }
  function visible(field: string, checked: boolean) {
    setSaved(false);
    setOffice(
      (o) =>
        o && {
          ...o,
          details: {
            ...o.details,
            visibleFields: checked
              ? [...new Set([...o.details.visibleFields, field])]
              : o.details.visibleFields.filter((f) => f !== field),
          },
        },
    );
  }
  const group =
    tab === 'service'
      ? ['packageName', 'includedServices', 'routerModel', 'routerStatus']
      : [
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
          'instructions',
        ];
  async function save() {
    if (!office) return;
    setBusy(true);
    setError('');
    try {
      setOffice(
        (
          await officeServices.saveOffice(officeId, {
            details: office.details,
            officeFormat: office.officeFormat,
            revision: office.revision,
          })
        ).office,
      );
      setSaved(true);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const preview = {
    id: officeId,
    title: 'Предварительный просмотр',
    category: office.details.visibleFields.includes('category')
      ? category
      : null,
    details: Object.fromEntries(
      Object.entries(office.details.values).filter(([key]) =>
        office.details.visibleFields.includes(key),
      ),
    ),
    services: office.details.visibleFields.includes('services')
      ? services
          .filter((s) => s.active)
          .flatMap((s) => {
            const rule =
              office.details.serviceOverrides.find(
                (r) =>
                  r.serviceId === s.id &&
                  r.categoryCode === office.officeFormat,
              ) || s.rules.find((r) => r.categoryCode === office.officeFormat);
            return rule?.show ? [{ ...s, ...rule }] : [];
          })
      : [],
  };
  return (
    <section className="card p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <h2 className="font-semibold text-lg">Обслуживание офиса</h2>
        <OfficeCategoryBadge category={category} />
      </div>
      {office.externalId ? (
        <p className="text-sm text-[var(--muted)]">
          Категория обновляется с подключённого сайта.
        </p>
      ) : (
        <label className="block text-sm">
          Категория
          <select
            className="input mt-1"
            value={office.officeFormat}
            onChange={(e) => {
              setOffice({ ...office, officeFormat: e.target.value });
              setSaved(false);
            }}
          >
            <option value="">Не указана</option>
            {categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex flex-wrap gap-2" role="tablist">
        {[
          ['service', 'Текущий сервис'],
          ['internet', 'Интернет'],
          ['prices', 'Индивидуальные условия'],
          ['visibility', 'Видимость'],
        ].map(([id, name]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`btn ${tab === id ? 'btn-primary' : 'btn-secondary'} text-sm`}
            onClick={() => setTab(id)}
          >
            {name}
          </button>
        ))}
      </div>
      {['service', 'internet'].includes(tab) && (
        <div className="grid sm:grid-cols-2 gap-4">
          {group.map((field) => (
            <label
              key={field}
              className={`text-sm ${['instructions', 'includedServices'].includes(field) ? 'sm:col-span-2' : ''}`}
            >
              {OFFICE_FIELD_LABELS[field]}
              {['instructions', 'includedServices'].includes(field) ? (
                <textarea
                  className="input mt-1"
                  rows={3}
                  maxLength={8000}
                  value={office.details.values[field] || ''}
                  onChange={(e) => setValue(field, e.target.value)}
                />
              ) : (
                <input
                  className="input mt-1"
                  maxLength={500}
                  value={office.details.values[field] || ''}
                  onChange={(e) => setValue(field, e.target.value)}
                />
              )}
            </label>
          ))}
        </div>
      )}
      {tab === 'prices' && (
        <div className="space-y-3">
          <Link
            className="text-[var(--primary)] underline text-sm"
            href="/admin/office-services"
          >
            Общий прайс и условия категорий
          </Link>
          {services.map((service) => {
            const override = office.details.serviceOverrides.find(
              (r) => r.serviceId === service.id,
            );
            return (
              <div
                key={service.id}
                className="border border-[var(--border)] rounded-lg p-3 space-y-3"
              >
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!override}
                    onChange={(e) =>
                      setOffice({
                        ...office,
                        details: {
                          ...office.details,
                          serviceOverrides: e.target.checked
                            ? [
                                ...office.details.serviceOverrides,
                                {
                                  ...(service.rules.find(
                                    (r) =>
                                      r.categoryCode === office.officeFormat,
                                  ) || emptyServiceRule(office.officeFormat)),
                                  serviceId: service.id,
                                },
                              ]
                            : office.details.serviceOverrides.filter(
                                (r) => r.serviceId !== service.id,
                              ),
                        },
                      })
                    }
                  />
                  Индивидуальные условия: {service.name}
                </label>
                {override && (
                  <OfficeServiceRuleEditor
                    value={override}
                    onChange={(rule) => {
                      setSaved(false);
                      setOffice({
                        ...office,
                        details: {
                          ...office.details,
                          serviceOverrides: office.details.serviceOverrides.map(
                            (r) => (r.serviceId === service.id ? rule : r),
                          ),
                        },
                      });
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      {tab === 'visibility' && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--muted)]">
            Отметьте сведения, которые увидит арендатор на сайте и в приложении.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {Object.entries(OFFICE_FIELD_LABELS).map(([field, label]) => (
              <label key={field} className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={office.details.visibleFields.includes(field)}
                  onChange={(e) => visible(field, e.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
          <TenantOfficeCard office={preview} preview />
        </div>
      )}
      {error && (
        <p className="text-[var(--danger)] text-sm" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="text-sm" role="status">
          Настройки сохранены
        </p>
      )}
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy}
        onClick={() => void save()}
      >
        {busy ? 'Сохранение…' : 'Сохранить обслуживание и видимость'}
      </button>
    </section>
  );
}
