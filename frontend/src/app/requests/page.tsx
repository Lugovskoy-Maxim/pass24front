'use client';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import { OfficeCategoryBadge } from '@/components/OfficeCategoryBadge';
import { OperationsStatusBadge } from '@/components/OperationsStatusBadge';
import { useAuth } from '@/lib/auth';
import { getErrorMessage, request } from '@/lib/api';
import {
  Attachment,
  command,
  operationDate,
  operations,
} from '@/lib/operations';
import {
  OfficeCategory,
  OfficeService,
  officeMoney,
} from '@/lib/office-services';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
type TenantTicket = {
  id: string;
  title: string;
  status: string;
  office_label?: string;
  office_category?: OfficeCategory;
  service_order?: OfficeService & {
    quantity: number;
    totalAmountMinor: number | null;
  };
  raw?: { last_message_preview?: string };
};
type Detail = {
  ticket: TenantTicket;
  messages: {
    id: number;
    author_label: string;
    author_type: string;
    body: string;
    created_at: string;
    attachments?: Attachment[];
  }[];
};
const statuses: Record<string, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  completed: 'Завершена',
  cancelled: 'Отменена',
};
export default function RequestsPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<TenantTicket[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [officeId, setOfficeId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [reply, setReply] = useState('');
  const [creator, setCreator] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);
  const detailPanel = useRef<HTMLElement>(null);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const selection = useRef('');
  const selectionVersion = useRef(0);
  const load = useCallback(async () => {
    if (!user) return;
    const sequence = ++listRequest.current;
    try {
      const nextList = await request<{ items: TenantTicket[] }>(
        '/service-requests',
      );
      if (sequence !== listRequest.current) return;
      setTickets(nextList.items);
      if (selection.current) {
        const id = selection.current;
        const detailSequence = ++detailRequest.current;
        const next = await request<Detail>('/service-requests/' + id);
        if (
          selection.current === id &&
          detailSequence === detailRequest.current
        ) {
          setDetail(next);
          setDetailLoading(false);
        }
      }
      setError('');
    } catch (e) {
      if (sequence === listRequest.current) setError(getErrorMessage(e));
    } finally {
      if (sequence === listRequest.current) setLoading(false);
    }
  }, [user]);
  useEffect(() => {
    void load();
  }, [load]);
  useAutoRefresh(load, { enabled: !!user });
  useEffect(() => {
    if (
      mobileDetail &&
      !detailLoading &&
      window.matchMedia('(max-width: 1023px)').matches
    ) {
      detailPanel.current?.focus();
      detailPanel.current?.scrollIntoView({ block: 'start' });
    }
  }, [mobileDetail, detailLoading]);
  async function open(id: string) {
    selection.current = id;
    ++selectionVersion.current;
    const sequence = ++detailRequest.current;
    setDetail(null);
    setDetailLoading(true);
    setMobileDetail(true);
    setReply('');
    try {
      const next = await request<Detail>('/service-requests/' + id);
      if (selection.current === id && sequence === detailRequest.current)
        setDetail(next);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      if (selection.current === id && sequence === detailRequest.current)
        setDetailLoading(false);
    }
  }
  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await command<{ ticket: TenantTicket }>(
        '/service-requests',
        {
          topic: 'office',
          subject,
          body,
          officeId: officeId || user?.offices?.[0]?.id,
        },
      );
      setCreator(false);
      setSubject('');
      setBody('');
      await open(result.ticket.id);
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!detail || busy || !reply.trim()) return;
    const id = detail.ticket.id;
    const version = selectionVersion.current;
    setBusy(true);
    setError('');
    try {
      await command('/service-requests/' + id + '/messages', {
        body: reply.trim(),
      });
      if (selection.current === id && selectionVersion.current === version)
        setReply('');
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function download(attachment: Attachment) {
    try {
      await operations.download(
        '/service-requests/attachments/' + attachment.attachment_id,
        attachment.original_name,
      );
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }
  return (
    <ProtectedLayout
      anyPermissions={[
        'requests.view_own',
        'requests.create',
        'passes.view_own',
      ]}
      wide
    >
      <div className="space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <h1 className="text-2xl font-semibold">Мои обращения</h1>
          <button
            className="btn btn-primary"
            onClick={() => setCreator(!creator)}
          >
            Новое обращение
          </button>
        </div>
        {error && (
          <p role="alert" className="card p-4 text-[var(--danger)]">
            {error}
          </p>
        )}
        {creator && (
          <form className="card p-5 space-y-3" onSubmit={create}>
            <label className="block">
              Офис
              <select
                className="input mt-1"
                value={officeId || user?.offices?.[0]?.id || ''}
                onChange={(e) => setOfficeId(e.target.value)}
              >
                {user?.offices?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.number} · {o.businessCenterName}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Тема
              <input
                className="input mt-1"
                required
                minLength={3}
                maxLength={160}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </label>
            <label className="block">
              Описание
              <textarea
                className="input mt-1"
                required
                minLength={5}
                maxLength={4000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            <button className="btn btn-primary" disabled={busy}>
              Отправить
            </button>
          </form>
        )}
        <div className="grid lg:grid-cols-[minmax(240px,340px)_1fr] gap-4">
          <section
            className={`card overflow-hidden lg:max-h-[75vh] overflow-y-auto ${mobileDetail ? 'hidden lg:block' : ''}`}
          >
            {loading && (
              <p className="p-5 text-[var(--muted)]" role="status">
                Загрузка обращений…
              </p>
            )}
            {!loading && !error && tickets.length === 0 && (
              <p className="p-5 text-[var(--muted)]">Обращений пока нет.</p>
            )}
            {tickets.map((ticket) => (
              <button
                key={ticket.id}
                onClick={() => void open(ticket.id)}
                className={`w-full text-left p-4 border-b border-[var(--border)] ${detail?.ticket.id === ticket.id ? 'bg-[var(--surface-muted)]' : ''}`}
              >
                <p className="font-medium">
                  №{ticket.id} · {ticket.title}
                </p>
                <OfficeCategoryBadge category={ticket.office_category} />
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="text-xs text-[var(--muted)]">
                    Офис {ticket.office_label || 'не указан'}
                  </span>
                  <OperationsStatusBadge
                    status={ticket.status}
                    label={statuses[ticket.status] || ticket.status}
                  />
                </div>
                <p className="text-sm truncate mt-1">
                  {ticket.raw?.last_message_preview}
                </p>
              </button>
            ))}
          </section>
          <section
            ref={detailPanel}
            tabIndex={-1}
            className={`card p-5 min-w-0 outline-none scroll-mt-24 ${mobileDetail ? '' : 'hidden lg:block'}`}
          >
            <button
              type="button"
              className="btn btn-secondary mb-4 lg:hidden"
              onClick={() => {
                selection.current = '';
                ++selectionVersion.current;
                ++detailRequest.current;
                setMobileDetail(false);
                setDetail(null);
                setDetailLoading(false);
              }}
            >
              Назад к обращениям
            </button>
            {detailLoading ? (
              <p className="py-8 text-center text-[var(--muted)]" role="status">
                Загрузка переписки…
              </p>
            ) : detail ? (
              <>
                <h2 className="font-semibold break-words">
                  №{detail.ticket.id} · {detail.ticket.title}
                </h2>
                <OfficeCategoryBadge category={detail.ticket.office_category} />
                <div className="mt-2">
                  <OperationsStatusBadge
                    status={detail.ticket.status}
                    label={
                      statuses[detail.ticket.status] || detail.ticket.status
                    }
                  />
                </div>
                {detail.ticket.service_order && (
                  <div className="bg-[var(--surface-muted)] p-3 rounded-lg my-3 text-sm">
                    <p>
                      {detail.ticket.service_order.name} ·{' '}
                      {detail.ticket.service_order.quantity}
                    </p>
                    <p>
                      {detail.ticket.service_order.totalAmountMinor == null
                        ? 'Стоимость уточняется'
                        : officeMoney(
                            detail.ticket.service_order.totalAmountMinor,
                          )}
                    </p>
                    <p>{detail.ticket.service_order.conditions}</p>
                  </div>
                )}
                <div className="space-y-3 my-5 max-h-[55vh] overflow-auto">
                  {detail.messages.map((m) => (
                    <article
                      key={m.id}
                      className={`p-3 rounded-lg bg-[var(--surface-muted)] ${m.author_type === 'support' ? 'mr-5' : 'ml-5'}`}
                    >
                      <p className="text-xs text-[var(--muted)] mb-2">
                        {m.author_label} · {operationDate(m.created_at)}
                      </p>
                      <p className="whitespace-pre-wrap break-words text-sm">
                        {m.body}
                      </p>
                      {m.attachments?.map((attachment) => (
                        <button
                          key={attachment.attachment_id}
                          type="button"
                          className="block mt-3 text-sm text-[var(--primary)] underline break-all"
                          onClick={() => void download(attachment)}
                        >
                          {attachment.original_name}
                        </button>
                      ))}
                    </article>
                  ))}
                </div>
                {!['completed', 'cancelled'].includes(detail.ticket.status) ? (
                  <form onSubmit={send} className="space-y-3">
                    <textarea
                      aria-label="Сообщение"
                      className="input"
                      required
                      maxLength={4000}
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      disabled={busy}
                    />
                    <button
                      className="btn btn-primary"
                      disabled={busy || !reply.trim()}
                    >
                      Отправить сообщение
                    </button>
                  </form>
                ) : (
                  <p className="text-sm text-[var(--muted)]">
                    Обращение закрыто.
                  </p>
                )}
              </>
            ) : (
              <p className="py-12 text-center text-[var(--muted)]">
                Выберите обращение
              </p>
            )}
          </section>
        </div>
      </div>
    </ProtectedLayout>
  );
}
