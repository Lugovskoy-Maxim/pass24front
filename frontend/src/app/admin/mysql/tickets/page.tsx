'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { SettingsNav } from '@/components/SettingsNav';
import { PageError } from '@/components/PageError';
import { useToast } from '@/components/Toast';
import { api, getErrorMessage } from '@/lib/api';

type Tickets = Awaited<ReturnType<typeof api.admin.getSiteTickets>>;
type TicketDetail = Awaited<ReturnType<typeof api.admin.getSiteTicket>>;

export default function MysqlTicketsPage() {
  const { toast } = useToast();
  const [list, setList] = useState<Tickets | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [activeId, setActiveId] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = () => {
    setError('');
    return api.admin
      .getSiteTickets()
      .then(setList)
      .catch((err) => setError(getErrorMessage(err, 'Ошибка загрузки')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void load();
  }, []);

  const open = async (id: string) => {
    setActiveId(id);
    try {
      setDetail(await api.admin.getSiteTicket(id));
    } catch (err) {
      toast(getErrorMessage(err, 'Не прочитал заявку'), 'error');
    }
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeId || !body.trim()) return;
    setSending(true);
    try {
      const result = await api.admin.addSiteTicketMessage(activeId, body.trim());
      setBody('');
      toast(
        result.stored
          ? 'Сообщение записано в MySQL'
          : result.note || 'Заготовка: таблица не сопоставлена',
        result.stored ? 'success' : 'info',
      );
      await open(activeId);
    } catch (err) {
      toast(getErrorMessage(err, 'Не отправилось'), 'error');
    } finally {
      setSending(false);
    }
  };

  if (error) {
    return (
      <AdminLayout title="Заявки сайта">
        <SettingsNav />
        <PageError message={error} onRetry={load} />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Заявки сайта">
      <SettingsNav />
      <p className="text-[var(--muted)] -mt-2 mb-6">
        Заготовка сервисных сообщений. Pass их не копирует: читает таблицу
        заявок WordPress и пишет ответ, если колонки нашлись.
      </p>
      {loading || !list ? (
        <div className="text-[var(--muted)]">Загрузка…</div>
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
          <section className="card p-5 space-y-3">
            <h2 className="font-semibold">Заявки</h2>
            {list.note && (
              <p className="text-sm text-[var(--muted)]">{list.note}</p>
            )}
            {list.items.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Пусто</p>
            ) : (
              <ul className="space-y-1 max-h-[32rem] overflow-auto">
                {list.items.map((item, index) => {
                  const id = String(item.id ?? index);
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        className={`w-full text-left rounded px-3 py-2 text-sm ${
                          activeId === id
                            ? 'bg-[var(--surface-muted)]'
                            : 'hover:bg-[var(--surface-muted)]'
                        }`}
                        onClick={() => void open(id)}
                      >
                        <div className="font-medium">
                          {String(item.title || `Заявка ${id}`)}
                        </div>
                        <div className="text-xs text-[var(--muted)]">
                          {item.status ? String(item.status) : '—'}
                          {item.office ? ` · ${String(item.office)}` : ''}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section className="card p-5 space-y-3">
            <h2 className="font-semibold">Переписка</h2>
            {!detail ? (
              <p className="text-sm text-[var(--muted)]">Выберите заявку</p>
            ) : (
              <>
                {detail.note && (
                  <p className="text-sm text-[var(--muted)]">{detail.note}</p>
                )}
                <pre className="text-xs overflow-auto max-h-40 bg-[var(--surface-muted)] p-3 rounded">
                  {JSON.stringify(detail.ticket, null, 2)}
                </pre>
                <ul className="space-y-2 max-h-56 overflow-auto">
                  {detail.messages.map((row, index) => (
                    <li
                      key={index}
                      className="text-xs font-mono border border-[var(--border)] rounded p-2"
                    >
                      {JSON.stringify(row)}
                    </li>
                  ))}
                </ul>
                <form onSubmit={send} className="space-y-2">
                  <textarea
                    className="input min-h-[6rem]"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Ответ в заявку сайта"
                  />
                  <button className="btn btn-primary" disabled={sending} type="submit">
                    {sending ? 'Отправка…' : 'Отправить в MySQL'}
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </AdminLayout>
  );
}
