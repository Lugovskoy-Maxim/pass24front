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
  const [tab, setTab] = useState<'bc' | 'offices'>('bc');

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
    <AdminLayout title="Связи">
      <SettingsNav />
      <p className="text-[var(--muted)] -mt-2 mb-6">
        Одна запись сайта = один БЦ или офис в Pass. Сначала подтвердите пару,
        потом обновите данные.
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

          <div className="card p-4 mb-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  busy ||
                  (suggested.properties === 0 && suggested.offices === 0)
                }
                onClick={() => void confirmAuto()}
              >
                Подтвердить авто
                {suggested.properties + suggested.offices > 0
                  ? ` (${suggested.properties + suggested.offices})`
                  : ''}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => void confirmManual()}
              >
                Связать выбранные
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void sync()}
              >
                Обновить данные
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
              <button
                type="button"
                className="btn btn-secondary text-xs"
                disabled={busy}
                onClick={() => void check()}
              >
                Проверить MySQL
              </button>
              <button
                type="button"
                className="btn btn-secondary text-xs"
                disabled={busy}
                onClick={() => void createMissing()}
              >
                Создать недостающие
              </button>
              {data.pendingChanges && (
                <span className="text-amber-700">есть изменения</span>
              )}
              {data.lastCheckedAt && (
                <span>
                  {new Date(data.lastCheckedAt).toLocaleString('ru-RU')}
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2 mb-4">
            <button
              type="button"
              className={`btn text-sm ${tab === 'bc' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTab('bc')}
            >
              БЦ ({data.properties.length})
            </button>
            <button
              type="button"
              className={`btn text-sm ${tab === 'offices' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTab('offices')}
            >
              Офисы ({data.offices.length})
            </button>
          </div>

          {tab === 'bc' ? (
            <section className="space-y-2">
              {data.properties.length === 0 ? (
                <div className="card p-6 text-sm text-[var(--muted)]">
                  Нет БЦ с сайта. Проверьте подключение.
                </div>
              ) : (
                data.properties.map((row) => (
                  <div
                    key={row.sourceCode}
                    className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{row.sourceName}</div>
                      <div className="font-mono text-xs text-[var(--muted)]">
                        {row.sourceCode}
                      </div>
                    </div>
                    <StatusChip status={row.status} />
                    <div className="sm:w-72">
                      {row.status === 'linked' ? (
                        <div className="text-sm">
                          {row.linkedName}
                          <div className="text-xs text-[var(--muted)]">
                            в реестре офисов одна запись
                          </div>
                        </div>
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
                          <option value="">Выбрать БЦ в Pass</option>
                          {data.passProperties.map((bc) => (
                            <option key={bc.id} value={bc.id}>
                              {bc.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
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
                  </div>
                ))
              )}
            </section>
          ) : (
            <section className="space-y-2">
              {data.offices.length === 0 ? (
                <div className="card p-6 text-sm text-[var(--muted)]">
                  Нет офисов с сайта.
                </div>
              ) : (
                data.offices.map((row) => (
                  <div
                    key={row.externalId}
                    className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {row.number}
                        {row.floor ? ` · ${row.floor} эт.` : ''}
                      </div>
                      <div className="text-xs text-[var(--muted)]">
                        {row.propertyName || 'без БЦ'}
                      </div>
                    </div>
                    <StatusChip status={row.status} />
                    <div className="sm:w-64">
                      {row.status === 'linked' ? (
                        <div className="text-sm">оф. {row.linkedNumber}</div>
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
                          <option value="">Выбрать офис в Pass</option>
                          {data.passOffices.map((office) => (
                            <option key={office.id} value={office.id}>
                              {office.number}
                              {office.company ? ` · ${office.company}` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    {row.linkedId && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="btn btn-secondary text-xs"
                          disabled={busy}
                          onClick={() => void push(row.linkedId!)}
                        >
                          В сайт
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary text-xs"
                          disabled={busy}
                          onClick={() => void unlinkOffice(row.linkedId!)}
                        >
                          Снять
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </section>
          )}
        </>
      )}
    </AdminLayout>
  );
}

function StatusChip({
  status,
}: {
  status: SiteLinkRow['status'] | SiteOfficeLinkRow['status'];
}) {
  const label =
    status === 'linked' ? 'связан' : status === 'suggested' ? 'авто' : 'нет пары';
  const cls =
    status === 'linked'
      ? 'bg-emerald-50 text-emerald-800'
      : status === 'suggested'
        ? 'bg-sky-50 text-sky-800'
        : 'bg-[var(--surface-muted)] text-[var(--muted)]';
  return (
    <span className={`text-xs px-2 py-1 rounded shrink-0 ${cls}`}>{label}</span>
  );
}
