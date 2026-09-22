'use client';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MessageSquare, Paperclip, Send, X } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { useToast } from '@/components/Toast';
import { PageError } from '@/components/PageError';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useWorkQueue } from '@/hooks/useWorkQueue';
import { getErrorMessage, getErrorStatus } from '@/lib/api';
import {
  operations,
  command,
  Page,
  Ticket,
  TicketDetail,
  Attachment,
} from '@/lib/operations';

export default function ServiceRequestsPage() {
  const { toast } = useToast();
  const { counts } = useWorkQueue();
  const [list, setList] = useState<Page<Ticket> | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [filters, setFilters] = useState({
    status: '',
    topic: '',
    search: '',
    needs_action: '',
    booking_id: '',
    page: 1,
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const uploaded = useRef<Attachment | null>(null);
  const selection = useRef(0);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setList(await operations.tickets(filters));
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [filters]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setFilters((f) => ({
      ...f,
      needs_action: q.get('needs_action') === '1' ? '1' : '',
      booking_id: q.get('booking_id') || '',
    }));
  }, []);
  useAutoRefresh(load);
  const open = async (id: number) => {
    selection.current = id;
    try {
      const next = await operations.ticket(id);
      if (selection.current === id) {
        setDetail(next);
        setMessage('');
        setFile(null);
        uploaded.current = null;
      }
    } catch (e) {
      toast(getErrorMessage(e), 'error');
    }
  };
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!detail || !message.trim() || busy) return;
    setBusy(true);
    try {
      if (file && !uploaded.current)
        uploaded.current = await operations.upload(file);
      const next = await command<TicketDetail>(
        `/admin/service-requests/${detail.ticket.id}/messages`,
        {
          message_text: message.trim(),
          revision: detail.ticket.revision,
          attachment_ids: uploaded.current
            ? [uploaded.current.attachment_id]
            : [],
        },
      );
      setDetail(next);
      setMessage('');
      setFile(null);
      uploaded.current = null;
      await load();
      toast('Ответ отправлен', 'success');
    } catch (e) {
      toast(getErrorMessage(e), 'error');
      if (detail && getErrorStatus(e) === 409)
        void operations
          .ticket(detail.ticket.id)
          .then(setDetail)
          .catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };
  const status = async (value: string) => {
    if (!detail || busy) return;
    setBusy(true);
    try {
      setDetail(
        await command<TicketDetail>(
          `/admin/service-requests/${detail.ticket.id}/status`,
          { status: value, revision: detail.ticket.revision },
          'PATCH',
        ),
      );
      await load();
    } catch (e) {
      toast(getErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const download = async (attachment: Attachment) => {
    try {
      await operations.download(
        '/admin/service-requests/attachments/' + attachment.attachment_id,
        attachment.original_name,
      );
    } catch (e) {
      toast(getErrorMessage(e), 'error');
    }
  };
  return (
    <AdminLayout title="Обращения в сервисную службу">
      {counts && counts.mode !== 'pass' && (
        <p className="card p-3 mb-4 text-sm text-[var(--muted)]">
          {counts.mode === 'paused'
            ? 'Приём изменений временно приостановлен.'
            : 'Раздел готовится к подключению. Обращения пока обрабатываются на сайте.'}
        </p>
      )}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          aria-label="Поиск обращений"
          className="input flex-1 min-w-44"
          placeholder="Номер, тема или автор"
          value={filters.search}
          onChange={(e) =>
            setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))
          }
        />
        <select
          aria-label="Статус"
          className="input w-auto"
          value={filters.status}
          onChange={(e) =>
            setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))
          }
        >
          <option value="">Все статусы</option>
          {Object.entries(list?.statuses || {}).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Тема"
          className="input w-auto"
          value={filters.topic}
          onChange={(e) =>
            setFilters((f) => ({ ...f, topic: e.target.value, page: 1 }))
          }
        >
          <option value="">Все темы</option>
          {Object.entries(list?.topics || {}).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <label className="flex gap-2 items-center text-sm">
          <input
            type="checkbox"
            checked={filters.needs_action === '1'}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                needs_action: e.target.checked ? '1' : '',
                page: 1,
              }))
            }
          />
          Требуют ответа
        </label>
      </div>
      {error && <PageError message={error} onRetry={load} />}
      <div className="grid xl:grid-cols-[minmax(260px,1fr)_minmax(0,2fr)] gap-5 items-start">
        <section className="card overflow-hidden">
          <div className="p-4 border-b border-[var(--border)] flex gap-2 items-center font-semibold">
            <MessageSquare className="w-5 h-5" />
            Обращения{' '}
            <span className="text-[var(--muted)]">{list?.total ?? '…'}</span>
          </div>
          {!list ? (
            <p className="p-5 text-[var(--muted)]">Загрузка…</p>
          ) : !list.items.length ? (
            <p className="p-5 text-[var(--muted)]">
              Обращений по выбранным условиям нет.
            </p>
          ) : (
            list.items.map((ticket) => (
              <button
                key={ticket.id}
                onClick={() => void open(ticket.id)}
                className={`w-full text-left p-4 border-b border-[var(--border)] hover:bg-[var(--surface-muted)] ${detail?.ticket.id === ticket.id ? 'bg-[var(--surface-muted)]' : ''}`}
              >
                <div className="flex justify-between gap-2">
                  <span className="font-medium">
                    №{ticket.id} · {ticket.subject}
                  </span>
                  {ticket.needs_action && (
                    <span
                      className="w-2 h-2 mt-2 rounded-full bg-[var(--danger)] shrink-0"
                      aria-label="Требует ответа"
                    />
                  )}
                </div>
                <p className="text-sm mt-1">{ticket.requester_name}</p>
                <p className="text-xs text-[var(--muted)]">
                  {ticket.status_label} · {ticket.last_message_at}
                </p>
                <p className="text-sm text-[var(--muted)] truncate mt-2">
                  {ticket.last_message_preview}
                </p>
              </button>
            ))
          )}
          {list && list.total > list.per_page && (
            <div className="flex justify-between p-3">
              <button
                className="btn btn-secondary"
                disabled={filters.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
              >
                Назад
              </button>
              <span>{filters.page}</span>
              <button
                className="btn btn-secondary"
                disabled={filters.page * list.per_page >= list.total}
                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
              >
                Далее
              </button>
            </div>
          )}
        </section>
        <section className="card p-5 min-w-0">
          {!detail ? (
            <p className="text-[var(--muted)] py-12 text-center">
              Выберите обращение, чтобы прочитать переписку.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-semibold text-lg">
                    №{detail.ticket.id} · {detail.ticket.subject}
                  </h2>
                  <p className="text-sm text-[var(--muted)]">
                    {detail.ticket.requester_name} · {detail.ticket.created_at}
                  </p>
                </div>
                <select
                  aria-label="Изменить статус обращения"
                  className="input w-auto"
                  disabled={busy || counts?.mode !== 'pass'}
                  value={detail.ticket.status}
                  onChange={(e) => void status(e.target.value)}
                >
                  {Object.entries(list?.statuses || {}).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {detail.ticket.booking_id && (
                <Link
                  href={`/admin/booking-requests?id=${detail.ticket.booking_id}`}
                  className="text-sm text-[var(--primary)] hover:underline"
                >
                  Открыть связанную заявку №{detail.ticket.booking_id}
                </Link>
              )}
              <div
                className="space-y-4 my-5 max-h-[55vh] overflow-auto pr-1"
                aria-label="Переписка"
              >
                {detail.messages.map((item) => (
                  <article
                    key={item.id}
                    className={`p-4 rounded border border-[var(--border)] ${item.author_type === 'support' ? 'bg-[var(--surface-muted)] ml-4' : 'mr-4'}`}
                  >
                    <div className="flex flex-wrap justify-between gap-2 mb-2 text-xs text-[var(--muted)]">
                      <span className="font-medium">{item.author_label}</span>
                      <time>{item.created_at}</time>
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {item.message_text}
                    </p>
                    {item.attachments?.map((a) => (
                      <button
                        key={a.attachment_id}
                        onClick={() => void download(a)}
                        className="flex items-center gap-2 text-sm text-[var(--primary)] mt-3 hover:underline"
                      >
                        <Paperclip className="w-4 h-4" />
                        {a.original_name}
                      </button>
                    ))}
                  </article>
                ))}
              </div>
              {detail.can_reply ? (
                <form onSubmit={send} className="space-y-3">
                  <textarea
                    aria-label="Ответ клиенту"
                    className="input min-h-28"
                    placeholder="Напишите ответ…"
                    maxLength={20000}
                    required
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={busy}
                  />
                  <div className="flex flex-wrap justify-between items-center gap-3">
                    <label className="btn btn-secondary cursor-pointer text-sm">
                      <Paperclip className="w-4 h-4" />
                      Прикрепить файл
                      <input
                        type="file"
                        className="sr-only"
                        disabled={busy}
                        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar,.heic,.pages,.numbers"
                        onChange={(e) => {
                          setFile(e.target.files?.[0] || null);
                          uploaded.current = null;
                        }}
                      />
                    </label>
                    <button
                      className="btn btn-primary"
                      type="submit"
                      disabled={
                        busy || !message.trim() || counts?.mode !== 'pass'
                      }
                    >
                      <Send className="w-4 h-4" />
                      {busy ? 'Отправка…' : 'Отправить ответ'}
                    </button>
                  </div>
                  {file && (
                    <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
                      {file.name}
                      <button
                        type="button"
                        aria-label="Удалить вложение"
                        onClick={() => {
                          setFile(null);
                          uploaded.current = null;
                        }}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </form>
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  Обращение закрыто. Для продолжения переписки переведите его в
                  работу.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
