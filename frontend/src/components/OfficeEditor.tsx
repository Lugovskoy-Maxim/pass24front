'use client';

import { Building2, Check, Link2 } from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';
import type { BusinessCenter } from '@/lib/api';

export interface OfficeEditorValues {
  propertyId: string;
  number: string;
  floor: string;
  areaSqm: string;
  company: string;
  externalId: string;
  isActive: boolean;
}

export function OfficeEditor({
  values,
  onChange,
  businessCenters,
  tenantPicker,
  onSubmit,
  onCancel,
  saving,
  editing,
  children,
}: {
  values: OfficeEditorValues;
  onChange: (values: OfficeEditorValues) => void;
  businessCenters: BusinessCenter[];
  tenantPicker: ReactNode;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
  saving: boolean;
  editing: boolean;
  children?: ReactNode;
}) {
  const center = businessCenters.find((bc) => bc.id === values.propertyId);
  return (
    <section id="office-editor" className="office-editor">
      <div className="office-editor__summary card">
        <span className="office-editor__icon" aria-hidden="true">
          <Building2 size={24} />
        </span>
        <div>
          <strong>
            {values.number.trim() ? `Офис ${values.number}` : 'Новый офис'}
          </strong>
          <p>
            {[center?.name, values.floor ? `Этаж ${values.floor}` : '']
              .filter(Boolean)
              .join(' · ') || 'Выберите бизнес-центр и укажите номер офиса'}
          </p>
        </div>
        <span
          className={`office-editor__status ${values.isActive ? 'is-active' : ''}`}
        >
          {values.isActive ? 'Активен' : 'Неактивен'}
        </span>
      </div>
      <form id="office-editor-form" onSubmit={onSubmit}>
        <fieldset className="office-editor__grid" disabled={saving}>
          <section
            className="office-editor__section card"
            aria-labelledby="office-parameters-heading"
          >
            <div className="office-editor__section-heading">
              <Building2 size={18} aria-hidden="true" />
              <div>
                <h2 id="office-parameters-heading">Параметры офиса</h2>
                <p>Расположение и основные данные помещения</p>
              </div>
            </div>
            <div className="office-editor__fields">
              <div className="office-editor__wide">
                <label className="label" htmlFor="office-property">
                  Бизнес-центр *
                </label>
                <div className="select-wrap">
                  <select
                    id="office-property"
                    className="input"
                    value={values.propertyId}
                    onChange={(event) =>
                      onChange({ ...values, propertyId: event.target.value })
                    }
                    required
                  >
                    <option value="">Выберите БЦ</option>
                    {businessCenters.map((bc) => (
                      <option key={bc.id} value={bc.id}>
                        {bc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="office-number">
                  Номер офиса *
                </label>
                <input
                  id="office-number"
                  className="input"
                  value={values.number}
                  onChange={(event) =>
                    onChange({ ...values, number: event.target.value })
                  }
                  required
                  placeholder="Например, 102"
                />
              </div>
              <div>
                <label className="label" htmlFor="office-floor">
                  Этаж
                </label>
                <input
                  id="office-floor"
                  className="input"
                  value={values.floor}
                  onChange={(event) =>
                    onChange({ ...values, floor: event.target.value })
                  }
                  placeholder="Например, 2"
                />
              </div>
              <div>
                <label className="label" htmlFor="office-area">
                  Площадь, м²
                </label>
                <input
                  id="office-area"
                  className="input"
                  type="number"
                  min={0}
                  step="any"
                  value={values.areaSqm}
                  onChange={(event) =>
                    onChange({ ...values, areaSqm: event.target.value })
                  }
                  placeholder="18"
                />
              </div>
              <label className="office-editor__active">
                <input
                  type="checkbox"
                  checked={values.isActive}
                  onChange={(event) =>
                    onChange({ ...values, isActive: event.target.checked })
                  }
                />
                <span>Офис активен</span>
              </label>
              <div className="office-editor__wide">
                <label className="label" htmlFor="office-company">
                  Компания на табличке офиса
                </label>
                <input
                  id="office-company"
                  className="input"
                  value={values.company}
                  onChange={(event) =>
                    onChange({ ...values, company: event.target.value })
                  }
                  placeholder="Название компании"
                />
                <p className="office-editor__hint">
                  Название для этого офиса. Можно указать независимо от
                  выбранных арендаторов.
                </p>
              </div>
            </div>
            <details className="office-editor__sync">
              <summary>
                Связь с основным сайтом
                {values.externalId && <span>{values.externalId}</span>}
              </summary>
              <div>
                <label className="label" htmlFor="office-external-id">
                  Код офиса на сайте (externalId)
                </label>
                <input
                  id="office-external-id"
                  className="input"
                  value={values.externalId}
                  onChange={(event) =>
                    onChange({ ...values, externalId: event.target.value })
                  }
                  placeholder="tf-room:107"
                />
                <p className="office-editor__hint">
                  Используется для сопоставления с офисом на основном сайте.
                </p>
              </div>
            </details>
          </section>
          <section
            className="office-editor__section card"
            aria-labelledby="office-tenants-heading"
          >
            <div className="office-editor__section-heading">
              <Link2 size={18} aria-hidden="true" />
              <div>
                <h2 id="office-tenants-heading">Арендаторы офиса</h2>
                <p>Кому доступен заказ пропусков в этот офис</p>
              </div>
            </div>
            {tenantPicker}
          </section>
        </fieldset>
        <div className="office-editor__actions">
          <p>Параметры офиса и назначения арендаторов сохраняются вместе.</p>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <Check size={16} aria-hidden="true" />
            {saving ? 'Сохранение…' : editing ? 'Сохранить' : 'Добавить офис'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={saving}
            onClick={onCancel}
          >
            Отмена
          </button>
        </div>
      </form>
      {children && (
        <div className="office-editor__services">
          <p className="office-editor__hint">
            Категория, обслуживание и интернет настраиваются и сохраняются
            отдельно.
          </p>
          {children}
        </div>
      )}
    </section>
  );
}
