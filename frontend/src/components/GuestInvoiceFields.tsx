'use client';

export type GuestInvoiceParty = {
  profile_type: string;
  legal_form: string | null;
  values: Record<string, string>;
  email: string;
};

export function guestInvoicePayload(value: GuestInvoiceParty) {
  const values: Record<string, Record<string, string>> = {};
  for (const [path, field] of Object.entries(value.values)) {
    const [group, key] = path.split('.');
    (values[group] ||= {})[key] = field;
  }
  return { ...value, values };
}

const fields: Record<string, Array<[string, string, string?]>> = {
  individual: [
    ['individual.birthDate', 'Дата рождения *', 'date'],
    ['individual.inn', 'ИНН'],
    ['individual.registrationAddress', 'Адрес регистрации'],
  ],
  ooo: [
    ['company.fullName', 'Полное наименование *'],
    ['company.inn', 'ИНН (10 цифр) *'],
    ['company.ogrn', 'ОГРН (13 цифр) *'],
    ['company.kpp', 'КПП'],
    ['company.legalAddress', 'Юридический адрес'],
  ],
  ip: [
    ['entrepreneur.inn', 'ИНН *'],
    ['entrepreneur.ogrnip', 'ОГРНИП *'],
    ['entrepreneur.registrationAddress', 'Адрес регистрации'],
  ],
};

export function GuestInvoiceFields({
  value,
  onChange,
}: {
  value: GuestInvoiceParty;
  onChange: (value: GuestInvoiceParty) => void;
}) {
  const type =
    value.profile_type === 'individual'
      ? 'individual'
      : value.legal_form || 'ooo';
  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--muted)]">
        Заполните реквизиты для счёта. Они сохранятся в документе; автор заявки
        останется прежним.
      </p>
      <label className="block text-sm">
        Заказчик счёта
        <select
          className="input mt-1"
          value={type}
          onChange={(e) =>
            onChange({
              ...value,
              profile_type:
                e.target.value === 'individual' ? 'individual' : 'company',
              legal_form:
                e.target.value === 'individual' ? null : e.target.value,
              values: {},
            })
          }
        >
          <option value="individual">Физическое лицо</option>
          <option value="ooo">ООО</option>
          <option value="ip">ИП</option>
        </select>
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields[type].map(([key, label, inputType]) => (
          <label key={key} className="block text-sm">
            {label}
            <input
              className="input mt-1"
              type={inputType || 'text'}
              maxLength={500}
              value={value.values[key] || ''}
              onChange={(e) =>
                onChange({
                  ...value,
                  values: { ...value.values, [key]: e.target.value },
                })
              }
            />
          </label>
        ))}
        <label className="block text-sm">
          Email для отправки
          <input
            className="input mt-1"
            type="email"
            maxLength={191}
            value={value.email}
            onChange={(e) => onChange({ ...value, email: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
