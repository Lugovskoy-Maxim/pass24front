'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import './quality.css';
import { AdminLayout } from '@/components/AdminLayout';
import { downloadFileResponse, getToken, request } from '@/lib/api';

interface Answer {
  score: number;
  comment: string;
  receivedAt: string;
}

interface RatingRequest {
  token: string;
  createdAt: string;
  answer?: Answer;
}

interface Ticket {
  _id: string;
  title: string;
  createdAt: string;
  closedAt?: string | null;
  source: string;
  stageId: string;
  stageName?: string;
  creatorId?: string;
  chatAvailable?: boolean;
  creatorName?: string;
  officeId?: string;
  officeCategory?: { name: string; color: string } | null;
  ratingAvailable: boolean;
  crmUrl?: string | null;
  important?: boolean;
  excluded?: boolean;
  requests?: RatingRequest[];
}

interface QualityData {
  pagination: { page: number; pageSize: number; pages: number; total: number };
  lastSyncedAt: string | null;
  tickets: Ticket[];
  report: {
    created: number;
    requested: number;
    answered: number;
    excluded: number;
    average: number | null;
    distribution: number[];
  } | null;
}

const formatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Moscow',
});

function mondayOf(date: string) {
  const day = new Date(date + 'T00:00:00Z');
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

export default function QualityPage() {
  const [week, setWeek] = useState(() =>
    mondayOf(new Date(Date.now() + 10800000).toISOString().slice(0, 10)),
  );
  const [officeId, setOfficeId] = useState('');
  const [importantOnly, setImportantOnly] = useState(false);
  const [hideOpen, setHideOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState<QualityData>();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  const [officeOptions, setOfficeOptions] = useState<string[]>();
  const [editingOffice, setEditingOffice] = useState<string>();
  const [officeSearch, setOfficeSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const loadSequence = useRef(0);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const sequence = ++loadSequence.current;
      const query = new URLSearchParams({
        week,
        officeId,
        importantOnly: String(importantOnly),
        hideOpen: String(hideOpen),
        page: String(page),
        pageSize: String(pageSize),
      });
      const result = await request<QualityData>('/admin/quality?' + query, {
        signal,
      });
      if (!signal?.aborted && sequence === loadSequence.current)
        setData(result);
    },
    [week, officeId, importantOnly, hideOpen, page, pageSize],
  );

  useAutoRefresh(() => load().catch(() => undefined), { enabled: !busy });

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(() => {
      if (!controller.signal.aborted) setError('Не удалось загрузить заявки.');
    });
    return () => controller.abort();
  }, [load]);

  async function change(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await load();
    } catch {
      setError(
        'Не удалось выполнить действие. Обновите страницу и попробуйте ещё раз.',
      );
    } finally {
      setBusy(false);
    }
  }

  function patch(
    id: string,
    fields: Partial<Pick<Ticket, 'officeId' | 'important' | 'excluded'>>,
  ) {
    return change(() =>
      request('/admin/quality/' + id, {
        method: 'PATCH',
        body: JSON.stringify(fields),
      }),
    );
  }

  function copyLink(id: string, repeat: boolean, chat = false) {
    return change(async () => {
      const rating = await request<RatingRequest>(
        '/admin/quality/' + id + '/requests',
        {
          method: 'POST',
          body: JSON.stringify({ repeat, chat }),
        },
      );
      const url = new URL(
        '/quality-rating/' + rating.token,
        window.location.origin,
      ).href;
      setLink(url);
      if (chat) {
        setNotice('Запрос оценки появился в чате.');
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        setNotice('Ссылка скопирована.');
      } catch {
        setNotice('Скопируйте ссылку из поля ниже.');
      }
    });
  }

  const report = data?.report;
  async function editOffice(id: string) {
    setEditingOffice(id);
    setOfficeSearch('');
    if (officeOptions) return;
    try {
      setOfficeOptions(await request<string[]>('/admin/quality/offices'));
    } catch {
      setEditingOffice(undefined);
      setError('Не удалось загрузить справочник офисов.');
    }
  }

  async function exportPeriod(form: HTMLFormElement) {
    setExporting(true);
    setError('');
    try {
      const fields = new FormData(form);
      const query = new URLSearchParams({
        from: String(fields.get('from')),
        to: String(fields.get('to')),
        officeId,
        importantOnly: String(importantOnly),
        hideOpen: String(hideOpen),
      });
      const base =
        process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000/api';
      const response = await fetch(base + '/admin/quality/export?' + query, {
        headers: { Authorization: 'Bearer ' + getToken() },
        cache: 'no-store',
      });
      await downloadFileResponse(response, 'quality.csv');
    } catch {
      setError('Не удалось выгрузить заявки. Проверьте период.');
    } finally {
      setExporting(false);
    }
  }
  const largestRatingGroup = Math.max(1, ...(report?.distribution ?? []));
  return (
    <AdminLayout title="Контроль качества">
      <div className="quality-workspace">
        <fieldset
          disabled={busy}
          className="my-4 flex flex-wrap items-end gap-4"
        >
          <label className="grid gap-1">
            Неделя с понедельника
            <input
              type="date"
              value={week}
              onChange={(event) => {
                if (event.target.value) setWeek(mondayOf(event.target.value));
              }}
            />
          </label>
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setOfficeId(
                String(
                  new FormData(event.currentTarget).get('office') ?? '',
                ).trim(),
              );
            }}
          >
            <label className="grid gap-1">
              Офис
              <input name="office" defaultValue={officeId} />
            </label>
            <button className="btn-secondary">Применить</button>
          </form>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={importantOnly}
              onChange={(event) => {
                setPage(1);
                setImportantOnly(event.target.checked);
              }}
            />
            Только важные
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={hideOpen}
              onChange={(event) => {
                setPage(1);
                setHideOpen(event.target.checked);
              }}
            />
            Скрыть незакрытые
          </label>
        </fieldset>
        {error && <p role="alert">{error}</p>}
        {!data && !error && <p role="status">Загрузка…</p>}
        {notice && <p role="status">{notice}</p>}
        {link && (
          <input
            className="my-2 w-full"
            aria-label="Ссылка на оценку"
            readOnly
            value={link}
            onFocus={(event) => event.currentTarget.select()}
          />
        )}
        <details className="quality-export">
          <summary>Выгрузка заявок</summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void exportPeriod(event.currentTarget);
            }}
          >
            <label>
              Созданы с{' '}
              <input type="date" name="from" defaultValue={week} required />
            </label>
            <label>
              По{' '}
              <input
                type="date"
                name="to"
                defaultValue={new Date(Date.now() + 10800000)
                  .toISOString()
                  .slice(0, 10)}
                required
              />
            </label>
            <button disabled={exporting}>
              {exporting ? 'Подготовка…' : 'Скачать CSV для Excel'}
            </button>
          </form>
        </details>
        {report && data?.lastSyncedAt && (
          <section className="my-4" aria-labelledby="quality-weekly">
            <h2 id="quality-weekly" className="font-semibold">
              Недельный срез
            </h2>
            <dl className="flex flex-wrap gap-4">
              {Object.entries({
                Заявки: report.created,
                Запросы: report.requested,
                Ответы: report.answered,
                'Средний балл':
                  report.average?.toLocaleString('ru-RU', {
                    maximumFractionDigits: 2,
                  }) ?? '—',
                Исключено: report.excluded,
              }).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <ul
              aria-label="Распределение оценок"
              className="quality-distribution"
            >
              {report.distribution.map((count, index) => (
                <li key={index}>
                  <span aria-label={`Оценка ${index + 1}`}>{index + 1}</span>
                  <meter
                    min={0}
                    max={largestRatingGroup}
                    value={count}
                    aria-label={`Количество оценок ${index + 1}`}
                  />
                  <strong>{count}</strong>
                </li>
              ))}
            </ul>
          </section>
        )}
        {data && (
          <p className="quality-sync" role="status">
            {data.lastSyncedAt
              ? `Последний успешный импорт: ${formatter.format(new Date(data.lastSyncedAt))}`
              : 'Данные из Битрикс24 ещё не загружены. Недельный срез появится после первого успешного импорта.'}
          </p>
        )}
        {data?.tickets.length === 0 && data.lastSyncedAt && (
          <p className="quality-sync">Заявок по выбранным фильтрам нет.</p>
        )}
        {!!data?.tickets.length && (
          <div className="quality-table">
            <div className="quality-table-heading">
              <h2>Заявки</h2>
              <span>
                {data.pagination.total.toLocaleString('ru-RU')} найдено
              </span>
            </div>
            <div className="quality-table-scroll">
              <table className="w-full text-left [&_td]:p-2 [&_th]:p-2">
                <thead>
                  <tr>
                    {[
                      'Заявка',
                      'Источник',
                      'Создана',
                      'Закрыта',
                      'Статус',
                      'Автор',
                      'Офис',
                      'Последний запрос',
                      'Последняя оценка',
                      'Действия',
                    ].map((label) => (
                      <th key={label} scope="col">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.tickets.map((ticket) => {
                    const latest = ticket.requests?.at(-1);
                    const answers = (ticket.requests ?? [])
                      .flatMap(({ answer }) => (answer ? [answer] : []))
                      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
                    const answer = answers[0];
                    return (
                      <tr key={ticket._id} className="border-t align-top">
                        <th scope="row">
                          {ticket.crmUrl ? (
                            <a
                              className="quality-crm-link"
                              href={ticket.crmUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Открыть заявку №${ticket._id} в Битрикс24`}
                            >
                              №{ticket._id}
                            </a>
                          ) : (
                            `№${ticket._id}`
                          )}{' '}
                          {ticket.title}
                          {(ticket.important || ticket.excluded) && (
                            <div className="quality-flags">
                              {ticket.important && <span>Важная</span>}
                              {ticket.excluded && <span>Вне отчёта</span>}
                            </div>
                          )}
                        </th>
                        <td>{ticket.source}</td>
                        <td>{formatter.format(new Date(ticket.createdAt))}</td>
                        <td>
                          {ticket.closedAt
                            ? formatter.format(new Date(ticket.closedAt))
                            : '—'}
                        </td>
                        <td>{ticket.stageName || ticket.stageId}</td>
                        <td>{ticket.creatorName || ticket.creatorId || '—'}</td>
                        <td>
                          <button
                            type="button"
                            className="quality-office-trigger"
                            disabled={busy}
                            aria-expanded={editingOffice === ticket._id}
                            onClick={() =>
                              editingOffice === ticket._id
                                ? setEditingOffice(undefined)
                                : void editOffice(ticket._id)
                            }
                          >
                            {ticket.officeId || 'Выбрать офис'}{' '}
                            <span aria-hidden="true">▾</span>
                          </button>
                          {editingOffice === ticket._id && (
                            <div className="quality-office-editor">
                              <input
                                type="search"
                                aria-label="Поиск офиса"
                                placeholder="Номер или корпус"
                                value={officeSearch}
                                onChange={(event) =>
                                  setOfficeSearch(event.target.value)
                                }
                              />
                              <select
                                aria-label="Выбрать офис"
                                value=""
                                disabled={busy || !officeOptions}
                                onChange={(event) => {
                                  const selection = event.target.value;
                                  setEditingOffice(undefined);
                                  void patch(ticket._id, {
                                    officeId: selection,
                                  });
                                }}
                              >
                                <option value="" disabled>
                                  {officeOptions
                                    ? 'Выберите офис'
                                    : 'Загрузка…'}
                                </option>
                                {officeOptions
                                  ?.filter((label) =>
                                    label
                                      .toLocaleLowerCase('ru')
                                      .includes(
                                        officeSearch
                                          .trim()
                                          .toLocaleLowerCase('ru'),
                                      ),
                                  )
                                  .map((label) => (
                                    <option key={label}>{label}</option>
                                  ))}
                              </select>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setEditingOffice(undefined);
                                  void patch(ticket._id, { officeId: '' });
                                }}
                              >
                                Определять автоматически
                              </button>
                            </div>
                          )}
                          {ticket.officeCategory && (
                            <span
                              className="quality-office-category"
                              title={ticket.officeCategory.name}
                            >
                              <i
                                aria-hidden="true"
                                style={{
                                  backgroundColor: ticket.officeCategory.color,
                                }}
                              />
                              {ticket.officeCategory.name}
                            </span>
                          )}
                        </td>
                        <td>
                          {latest ? (
                            <>
                              {formatter.format(new Date(latest.createdAt))}
                              <br />
                              {latest.answer
                                ? 'Получен ответ'
                                : 'Ожидает ответа'}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          {answer ? (
                            <>
                              {answer.score} из 5 ·{' '}
                              {formatter.format(new Date(answer.receivedAt))}
                              <br />
                              {answer.comment}
                            </>
                          ) : (
                            '—'
                          )}
                          {answers.length > 1 && (
                            <details>
                              <summary>История оценок</summary>
                              <ol>
                                {answers.map((item, index) => (
                                  <li key={index}>
                                    {formatter.format(
                                      new Date(item.receivedAt),
                                    )}{' '}
                                    · {item.score} из 5 {item.comment}
                                  </li>
                                ))}
                              </ol>
                            </details>
                          )}
                        </td>
                        <td className="min-w-48">
                          <details className="quality-row-settings">
                            <summary
                              aria-label={`Настройки заявки №${ticket._id}`}
                            >
                              Действия
                            </summary>
                            <label className="block">
                              <input
                                type="checkbox"
                                checked={!!ticket.important}
                                disabled={busy}
                                onChange={(event) =>
                                  void patch(ticket._id, {
                                    important: event.target.checked,
                                  })
                                }
                              />{' '}
                              Важная
                            </label>
                            <label className="block">
                              <input
                                type="checkbox"
                                checked={!!ticket.excluded}
                                disabled={busy}
                                onChange={(event) =>
                                  void patch(ticket._id, {
                                    excluded: event.target.checked,
                                  })
                                }
                              />{' '}
                              Исключить из отчёта
                            </label>
                            {ticket.ratingAvailable && (
                              <>
                                <button
                                  className="btn-secondary"
                                  disabled={busy}
                                  onClick={() =>
                                    void copyLink(ticket._id, false)
                                  }
                                >
                                  Скопировать ссылку на оценку
                                </button>
                                {latest && (
                                  <button
                                    className="btn-secondary mt-2"
                                    disabled={busy}
                                    onClick={() =>
                                      void copyLink(ticket._id, true)
                                    }
                                  >
                                    Запросить повторную оценку
                                  </button>
                                )}
                                {ticket.chatAvailable && (
                                  <>
                                    <button
                                      className="btn-secondary mt-2"
                                      disabled={busy}
                                      onClick={() =>
                                        void copyLink(ticket._id, false, true)
                                      }
                                    >
                                      Запросить оценку в чате
                                    </button>
                                    {latest && (
                                      <button
                                        className="btn-secondary mt-2"
                                        disabled={busy}
                                        onClick={() =>
                                          void copyLink(ticket._id, true, true)
                                        }
                                      >
                                        Запросить повторную оценку в чате
                                      </button>
                                    )}
                                  </>
                                )}
                              </>
                            )}
                          </details>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <nav className="quality-pager" aria-label="Страницы заявок">
              <label>
                На странице
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPage(1);
                    setPageSize(Number(event.target.value));
                  }}
                >
                  {[25, 50, 100].map((size) => (
                    <option key={size}>{size}</option>
                  ))}
                </select>
              </label>
              <span aria-live="polite">
                Страница {data.pagination.page} из {data.pagination.pages}
              </span>
              <div>
                <button
                  type="button"
                  disabled={busy || data.pagination.page <= 1}
                  onClick={() => setPage(data.pagination.page - 1)}
                >
                  Назад
                </button>
                <button
                  type="button"
                  disabled={
                    busy || data.pagination.page >= data.pagination.pages
                  }
                  onClick={() => setPage(data.pagination.page + 1)}
                >
                  Далее
                </button>
              </div>
            </nav>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
