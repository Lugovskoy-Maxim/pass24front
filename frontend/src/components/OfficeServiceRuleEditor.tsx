'use client';
import {
  ServiceRule,
  SERVICE_MODES,
  SERVICE_UNITS,
} from '@/lib/office-services';
export function OfficeServiceRuleEditor({
  value,
  onChange,
}: {
  value: ServiceRule;
  onChange: (value: ServiceRule) => void;
}) {
  const update = (patch: Partial<ServiceRule>) =>
    onChange({ ...value, ...patch });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-sm">
        <label>
          <input
            type="checkbox"
            checked={value.show}
            onChange={(e) => update({ show: e.target.checked })}
          />{' '}
          Показывать арендатору
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.orderable}
            onChange={(e) => update({ orderable: e.target.checked })}
          />{' '}
          Можно заказать
        </label>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm">
          Условия
          <select
            className="input mt-1"
            value={value.mode}
            onChange={(e) =>
              update({ mode: e.target.value as ServiceRule['mode'] })
            }
          >
            {Object.entries(SERVICE_MODES).map(([key, text]) => (
              <option key={key} value={key}>
                {text}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Единица расчёта
          <select
            className="input mt-1"
            value={value.unit}
            onChange={(e) =>
              update({ unit: e.target.value as ServiceRule['unit'] })
            }
          >
            {Object.entries(SERVICE_UNITS).map(([key, text]) => (
              <option key={key} value={key}>
                {text}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm">
          Цена, ₽
          <input
            className="input mt-1"
            type="number"
            min="0"
            max="1000000"
            step="0.01"
            value={value.priceMinor == null ? '' : value.priceMinor / 100}
            onChange={(e) =>
              update({
                priceMinor:
                  e.target.value === ''
                    ? null
                    : Math.round(Number(e.target.value) * 100),
              })
            }
            required={['paid', 'quota'].includes(value.mode)}
          />
        </label>
        {value.mode === 'quota' && (
          <label className="text-sm">
            Бесплатные минуты в месяц
            <input
              className="input mt-1"
              type="number"
              min="1"
              max="44640"
              value={value.freeMinutes || ''}
              onChange={(e) => update({ freeMinutes: Number(e.target.value) })}
              required
            />
          </label>
        )}
      </div>
      <label className="block text-sm">
        Описание условий
        <textarea
          className="input mt-1"
          rows={3}
          maxLength={4000}
          value={value.conditions}
          onChange={(e) => update({ conditions: e.target.value })}
        />
      </label>
    </div>
  );
}
export const emptyServiceRule = (categoryCode: string): ServiceRule => ({
  categoryCode,
  show: false,
  orderable: false,
  mode: 'request',
  priceMinor: null,
  unit: 'order',
  freeMinutes: 0,
  conditions: '',
});
