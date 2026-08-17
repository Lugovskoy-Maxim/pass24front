'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { SettingsNav } from '@/components/SettingsNav';
import { useToast } from '@/components/Toast';
import { PageError } from '@/components/PageError';
import { api, getErrorMessage, SiteMysqlSettings } from '@/lib/api';

const EMPTY: SiteMysqlSettings = {
  enabled: false,
  host: '',
  port: 3306,
  database: '',
  user: '',
  hasPassword: false,
  tablePrefix: 'wps_',
  roomPostType: 'tf_room',
  roomNumberMeta: 'room_number',
  floorMeta: 'tf_room_floor_number',
  areaMeta: 'room_area',
  badgeMeta: 'room_badges_0_text',
  availabilityMeta: 'tf_room_availability_status',
  officeFormatMeta: 'tf_room_office_format',
  companyMeta: '',
  businessCenterTaxonomy: 'tf_business_center',
  roomTypeTaxonomy: 'tf_room_type',
  serviceRequestsTable: 'tf_service_requests',
  serviceRequestMessagesTable: 'tf_service_request_messages',
  servicesTable: 'tf_services',
  writeEnabled: false,
  autoSyncEnabled: false,
  autoSyncIntervalSec: 300,
  autoApply: false,
};

type Field = {
  key: keyof SiteMysqlSettings;
  label: string;
  hint?: string;
};

const CONNECTION_FIELDS: Field[] = [
  { key: 'host', label: 'Хост', hint: '127.0.0.1' },
  { key: 'database', label: 'База' },
  { key: 'user', label: 'Пользователь' },
];

const OFFICE_FIELDS: Field[] = [
  { key: 'tablePrefix', label: 'Префикс таблиц', hint: 'wps_' },
  { key: 'roomPostType', label: 'post_type офиса', hint: 'tf_room' },
  { key: 'roomNumberMeta', label: 'Meta: номер', hint: 'room_number' },
  { key: 'floorMeta', label: 'Meta: этаж', hint: 'tf_room_floor_number' },
  { key: 'areaMeta', label: 'Meta: площадь', hint: 'room_area' },
  { key: 'badgeMeta', label: 'Meta: бейдж (м²)', hint: 'room_badges_0_text' },
  {
    key: 'availabilityMeta',
    label: 'Meta: статус',
    hint: 'tf_room_availability_status',
  },
  {
    key: 'officeFormatMeta',
    label: 'Meta: формат',
    hint: 'tf_room_office_format',
  },
  { key: 'companyMeta', label: 'Meta: компания (опц.)' },
  {
    key: 'businessCenterTaxonomy',
    label: 'Таксономия БЦ',
    hint: 'tf_business_center',
  },
  { key: 'roomTypeTaxonomy', label: 'Таксономия типа', hint: 'tf_room_type' },
];

const TICKET_FIELDS: Field[] = [
  {
    key: 'serviceRequestsTable',
    label: 'Таблица заявок',
    hint: 'tf_service_requests',
  },
  {
    key: 'serviceRequestMessagesTable',
    label: 'Таблица сообщений',
    hint: 'tf_service_request_messages',
  },
  { key: 'servicesTable', label: 'Таблица услуг', hint: 'tf_services' },
];

export default function MysqlAdminPage() {
  const { toast } = useToast();
  const [form, setForm] = useState<SiteMysqlSettings>(EMPTY);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');

  const load = () => {
    setError('');
    return api.admin
      .getSiteSource()
      .then((data) => setForm({ ...EMPTY, ...data }))
      .catch((err) => setError(getErrorMessage(err, 'Ошибка загрузки')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void load();
  }, []);

  const setField = (key: keyof SiteMysqlSettings, value: string | number) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { settings } = await api.admin.updateSiteSource({
        enabled: form.enabled,
        host: form.host,
        port: form.port,
        database: form.database,
        user: form.user,
        tablePrefix: form.tablePrefix,
        roomPostType: form.roomPostType,
        roomNumberMeta: form.roomNumberMeta,
        floorMeta: form.floorMeta,
        areaMeta: form.areaMeta,
        badgeMeta: form.badgeMeta,
        availabilityMeta: form.availabilityMeta,
        officeFormatMeta: form.officeFormatMeta,
        companyMeta: form.companyMeta,
        businessCenterTaxonomy: form.businessCenterTaxonomy,
        roomTypeTaxonomy: form.roomTypeTaxonomy,
        serviceRequestsTable: form.serviceRequestsTable,
        serviceRequestMessagesTable: form.serviceRequestMessagesTable,
        servicesTable: form.servicesTable,
        writeEnabled: !!form.writeEnabled,
        autoSyncEnabled: !!form.autoSyncEnabled,
        autoSyncIntervalSec: form.autoSyncIntervalSec || 300,
        autoApply: !!form.autoApply,
        ...(password ? { password } : {}),
      });
      setForm({ ...EMPTY, ...settings });
      setPassword('');
      toast('Настройки MySQL сохранены', 'success');
    } catch (err) {
      toast(getErrorMessage(err, 'Не удалось сохранить'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult('');
    try {
      const result = await api.admin.testSiteSource();
      setTestResult(
        `Ок: ${result.database}, таблиц ${result.tables}. ${result.tableNames.slice(0, 12).join(', ')}`,
      );
    } catch (err) {
      setTestResult(getErrorMessage(err, 'Нет связи'));
    } finally {
      setTesting(false);
    }
  };

  if (error) {
    return (
      <AdminLayout title="MySQL">
        <SettingsNav />
        <PageError message={error} onRetry={load} />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="MySQL">
      <SettingsNav />
      <p className="text-[var(--muted)] -mt-2 mb-6">
        Отдельная админка источника сайта. Дамп: база mstyle_wp, префикс wps_,
        офисы wps_posts (tf_room), заявки wps_tf_service_requests. Поля ниже
        можно менять, если схема WordPress другая.
      </p>

      {loading ? (
        <div className="text-[var(--muted)]">Загрузка…</div>
      ) : (
        <form onSubmit={save} className="space-y-6 mb-6">
          <section className="card p-5 space-y-4">
            <h2 className="font-semibold">Подключение</h2>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, enabled: e.target.checked }))
                }
              />
              Включено
            </label>
            <div className="grid sm:grid-cols-2 gap-3">
              {CONNECTION_FIELDS.map((field) => (
                <TextField
                  key={field.key}
                  field={field}
                  value={String(form[field.key] ?? '')}
                  onChange={(value) => setField(field.key, value)}
                />
              ))}
              <div>
                <label className="label">Порт</label>
                <input
                  className="input"
                  type="number"
                  value={form.port}
                  onChange={(e) =>
                    setField('port', Number(e.target.value) || 3306)
                  }
                />
              </div>
              <div>
                <label className="label">
                  Пароль {form.hasPassword ? '(сохранён)' : ''}
                </label>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={form.hasPassword ? 'оставить как есть' : ''}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-secondary" disabled={testing} type="button" onClick={() => void test()}>
                {testing ? 'Проверка…' : 'Проверить связь'}
              </button>
            </div>
            {testResult && (
              <p className="text-sm text-[var(--muted)]">{testResult}</p>
            )}
          </section>

          <section className="card p-5 space-y-4">
            <h2 className="font-semibold">Поля офисов</h2>
            <p className="text-sm text-[var(--muted)]">
              Имена post_type, meta_key и taxonomy из WordPress. Префикс
              подставляется сам, если в имени таблицы его нет.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {OFFICE_FIELDS.map((field) => (
                <TextField
                  key={field.key}
                  field={field}
                  value={String(form[field.key] ?? '')}
                  onChange={(value) => setField(field.key, value)}
                />
              ))}
            </div>
          </section>

          <section className="card p-5 space-y-4">
            <h2 className="font-semibold">Поля заявок</h2>
            <p className="text-sm text-[var(--muted)]">
              Суффикс без префикса или полное имя таблицы. Pass заявки не
              копирует — только читает.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {TICKET_FIELDS.map((field) => (
                <TextField
                  key={field.key}
                  field={field}
                  value={String(form[field.key] ?? '')}
                  onChange={(value) => setField(field.key, value)}
                />
              ))}
            </div>
          </section>

          <section className="card p-5 space-y-4">
            <h2 className="font-semibold">Запись и автопроверка</h2>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!form.writeEnabled}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, writeEnabled: e.target.checked }))
                }
              />
              Разрешить запись в MySQL (офисы и ответы на заявки)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!form.autoSyncEnabled}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    autoSyncEnabled: e.target.checked,
                  }))
                }
              />
              Автопроверка изменений в БД
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!form.autoApply}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, autoApply: e.target.checked }))
                }
              />
              При изменении сразу обновлять связанные офисы
            </label>
            <div>
              <label className="label">Интервал проверки, сек</label>
              <input
                className="input"
                type="number"
                min={60}
                value={form.autoSyncIntervalSec || 300}
                onChange={(e) =>
                  setField('autoSyncIntervalSec', Number(e.target.value) || 300)
                }
              />
            </div>
            {form.lastCheckedAt && (
              <p className="text-xs text-[var(--muted)]">
                Проверка: {new Date(form.lastCheckedAt).toLocaleString('ru-RU')}
                {form.pendingChanges ? ' · есть изменения' : ''}
              </p>
            )}
          </section>

          <button className="btn btn-primary" disabled={saving} type="submit">
            {saving ? 'Сохранение…' : 'Сохранить настройки'}
          </button>
        </form>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <a href="/admin/mysql/links" className="card p-5 hover:bg-[var(--surface-muted)]">
          <div className="font-semibold">Связи</div>
          <p className="text-sm text-[var(--muted)] mt-1">
            Подтвердить пары, обновить связанные, записать в MySQL.
          </p>
        </a>
        <a href="/admin/mysql/tickets" className="card p-5 hover:bg-[var(--surface-muted)]">
          <div className="font-semibold">Заявки</div>
          <p className="text-sm text-[var(--muted)] mt-1">
            Сервисные сообщения сайта. Pass их не копирует.
          </p>
        </a>
      </div>
    </AdminLayout>
  );
}

function TextField({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="label">{field.label}</label>
      <input
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.hint}
      />
    </div>
  );
}


