'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { SettingsNav } from '@/components/SettingsNav';
import { PageError } from '@/components/PageError';
import { useToast } from '@/components/Toast';
import {
  api,
  getErrorMessage,
  SiteLinkRow,
  SiteOfficeLinkRow,
} from '@/lib/api';

type LinksPayload = Awaited<ReturnType<typeof api.admin.getSiteLinks>>;

export default function MysqlLinksPage() {
  const { toast } = useToast();
  const [data, setData] = useState<LinksPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [propertyPick, setPropertyPick] = useState<Record<string, string>>({});
  const [officePick, setOfficePick] = useState<Record<string, string>>({});

  const load = () => {
    setError('');
    return api.admin
      .getSiteLinks()
      .then((payload) => {
        setData(payload);
        const nextProps: Record<string, string> = {};
        const nextOffices: Record<string, string> = {};
        payload.properties.forEach((row) => {
          nextProps[row.sourceCode] = row.linkedId || row.suggestedId || '';
        });
        payload.offices.forEach((row) => {
          nextOffices[row.externalId] = row.linkedId || row.suggestedId || '';
        });
        setPropertyPick(nextProps);
        setOfficePick(nextOffices);
      })
      .catch((err) => setError(getErrorMessage(err, 'Ошибка загрузки')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void load();
  }, []);

  const suggested = useMemo(() => {
    if (!data) return { properties: 0, offices: 0 };
    return {
      properties: data.properties.filter((row) => row.status === 'suggested').length,
      offices: data.offices.filter((row) => row.status === 'suggested').length,
    };
  }, [data]);

  const confirmAuto = async () => {
    setBusy(true);
    try {
      const result = await api.admin.confirmSuggestedLinks();
      toast(
        `Подтверждено: БЦ ${result.properties}, офисов ${result.offices}`,
        'success',
      );
      await load();
    } catch (err) {
      toast(getErrorMessage(err, 'Не удалось подтвердить'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const confirmManual = async () => {
    if (!data) return;
    const properties = data.properties
      .filter((row) => row.status !== 'linked' && propertyPick[row.sourceCode])
      .map((row) => ({
        sourceCode: row.sourceCode,
        targetId: propertyPick[row.sourceCode],
      }));
    const offices = data.offices
      .filter((row) => row.status !== 'linked' && officePick[row.externalId])
      .map((row) => ({
        externalId: row.externalId,
        targetId: officePick[row.externalId],
      }));
    if (!properties.length && !offices.length) {
      toast('Нечего связывать', 'error');
      return;
    }
    setBusy(true);
    try {
      const result = await api.admin.confirmSiteLinks({ properties, offices });
      toast(
        `Связано вручную: БЦ ${result.properties}, офисов ${result.offices}`,
        'success',
      );
      await load();
    } catch (err) {
      toast(getErrorMessage(err, 'Не удалось связать'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    try {
      const result = await api.admin.syncLinkedOffices();
      toast(
        `Обновлено связанных: ${result.updated}, без связи ${result.skipped}`,
        'success',
      );
      await load();
    } catch (err) {
      toast(getErrorMessage(err, 'Синк не выполнен'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const createMissing = async () => {
    setBusy(true);
    try {
      const result = await api.admin.importSiteOffices();
      toast(
        `Создано ${result.created}, обновлено ${result.updated}, связано ${result.linked}`,
        'success',
      );
      await load();
    } catch (err) {
      toast(getErrorMessage(err, 'Создание не выполнено'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setBusy(true);
    try {
      const result = await api.admin.checkSiteSource();
      toast(
        result.changed
          ? `Есть изменения в MySQL${result.autoApplied ? ', связанные обновлены' : ''}`
          : 'MySQL без изменений',
        result.changed ? 'success' : 'info',
      );
      await load();
    } catch (err) {
      toast(getErrorMessage(err, 'Проверка не удалась'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const unlinkProperty = async (id: string) => {
    setBusy(true);
    try {
      await api.admin.unlinkSite({ propertyId: id });
      await load();
    } catch (err) {
      toast(getErrorMessage(err, 'Не снял связь'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const unlinkOffice = async (id: string) => {
    setBusy(true);
    try {
      await api.admin.unlinkSite({ officeId: id });
      await load();
    } catch (err) {
      toast(getErrorMessage(err, 'Не снял связь'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const push = async (id: string) => {
    setBusy(true);
    try {
      await api.admin.pushOfficeToMysql(id);
      toast('Офис записан в MySQL', 'success');
    } catch (err) {
      toast(getErrorMessage(err, 'Запись в MySQL не прошла'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <AdminLayout title="Связи MySQL">
        <SettingsNav />
        <PageError message={error} onRetry={load} />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Связи MySQL">
      <SettingsNav />
      <p className="text-[var(--muted)] -mt-2 mb-6">
        Сначала подтвердите автоматические совпадения или укажите пару вручную.
        Потом обновляйте только связанные. Создание дублей на этой странице
        выключено.
      </p>

      {loading || !data ? (
        <div className="text-[var(--muted)]">Загрузка…</div>
      ) : (
        <>
          {data.note && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
              {data.note}
            </p>
          )}
          <div className="card p-5 mb-6 flex flex-wrap gap-2 items-center">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || (suggested.properties === 0 && suggested.offices === 0)}
              onClick={() => void confirmAuto()}
            >
              Подтвердить авто ({suggested.properties} БЦ / {suggested.offices} оф.)
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void confirmManual()}
            >
              Связать выбранные вручную
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void sync()}
            >
              Обновить связанные из MySQL
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void check()}
            >
              Проверить БД
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void createMissing()}
            >
              Создать несвязанные
            </button>
            {data.pendingChanges && (
              <span className="text-sm text-amber-700">Есть изменения в MySQL</span>
            )}
            {data.lastCheckedAt && (
              <span className="text-xs text-[var(--muted)]">
                проверка {new Date(data.lastCheckedAt).toLocaleString('ru-RU')}
              </span>
            )}
          </div>

          <section className="card p-5 mb-6 space-y-3">
            <h2 className="font-semibold">Бизнес-центры</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="text-[var(--muted)]">
                  <tr>
                    <th className="text-left p-2">Сайт</th>
                    <th className="text-left p-2">Статус</th>
                    <th className="text-left p-2">Pass</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.properties.map((row) => (
                    <tr key={row.sourceCode} className="border-t border-[var(--border)]">
                      <td className="p-2">
                        <div className="font-medium">{row.sourceName}</div>
                        <div className="font-mono text-xs text-[var(--muted)]">
                          {row.sourceCode}
                        </div>
                      </td>
                      <td className="p-2">{statusLabel(row.status)}</td>
                      <td className="p-2">
                        {row.status === 'linked' ? (
                          row.linkedName
                        ) : (
                          <select
                            className="input"
                            value={propertyPick[row.sourceCode] || ''}
                            onChange={(e) =>
                              setPropertyPick((prev) => ({
                                ...prev,
                                [row.sourceCode]: e.target.value,
                              }))
                            }
                          >
                            <option value="">— выбрать БЦ —</option>
                            {data.passProperties.map((bc) => (
                              <option key={bc.id} value={bc.id}>
                                {bc.name}
                                {bc.code ? ` (${bc.code})` : ''}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        {row.linkedId && (
                          <button
                            type="button"
                            className="btn btn-secondary text-xs"
                            disabled={busy}
                            onClick={() => void unlinkProperty(row.linkedId!)}
                          >
                            Снять
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card p-5 space-y-3">
            <h2 className="font-semibold">Офисы</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead className="text-[var(--muted)]">
                  <tr>
                    <th className="text-left p-2">Сайт</th>
                    <th className="text-left p-2">Статус</th>
                    <th className="text-left p-2">Pass</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.offices.map((row) => (
                    <tr key={row.externalId} className="border-t border-[var(--border)]">
                      <td className="p-2">
                        <div className="font-medium">
                          {row.number}
                          {row.floor ? ` эт.${row.floor}` : ''}
                        </div>
                        <div className="text-xs text-[var(--muted)]">
                          {row.propertyName || '—'} · {row.externalId}
                        </div>
                      </td>
                      <td className="p-2">{statusLabel(row.status)}</td>
                      <td className="p-2">
                        {row.status === 'linked' ? (
                          `оф. ${row.linkedNumber}`
                        ) : (
                          <select
                            className="input"
                            value={officePick[row.externalId] || ''}
                            onChange={(e) =>
                              setOfficePick((prev) => ({
                                ...prev,
                                [row.externalId]: e.target.value,
                              }))
                            }
                          >
                            <option value="">— выбрать офис —</option>
                            {data.passOffices.map((office) => (
                              <option key={office.id} value={office.id}>
                                {office.number}
                                {office.externalId ? ` (${office.externalId})` : ''}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="p-2 text-right whitespace-nowrap">
                        {row.linkedId && (
                          <>
                            <button
                              type="button"
                              className="btn btn-secondary text-xs mr-1"
                              disabled={busy}
                              onClick={() => void push(row.linkedId!)}
                            >
                              В MySQL
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary text-xs"
                              disabled={busy}
                              onClick={() => void unlinkOffice(row.linkedId!)}
                            >
                              Снять
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </AdminLayout>
  );
}

function statusLabel(status: SiteLinkRow['status'] | SiteOfficeLinkRow['status']) {
  if (status === 'linked') return 'связан';
  if (status === 'suggested') return 'авто';
  return 'нет пары';
}
