'use client';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ProtectedLayout } from '@/components/ProtectedLayout';
import {
  ArrowLeft,
  LockKeyhole,
  MessageSquare,
  Plus,
  Send,
} from 'lucide-react';
import {
  RequestChatPlaceholder,
  RequestDetailHeader,
  RequestListItem,
  RequestMessages,
  RequestServiceOrder,
} from '@/components/ServiceRequestChat';
import { useAuth } from '@/lib/auth';
import { getErrorMessage, request } from '@/lib/api';
import {
  Attachment,
  command,
  Ticket,
  TicketOffice,
  operations,
} from '@/lib/operations';
import { OfficeCategory, OfficeService } from '@/lib/office-services';
import {
  SERVICE_REQUEST_TOPICS,
  ServiceRequestTopic,
} from '@/lib/service-request-topics';
import { ServiceRequestPriceList } from '@/components/ServiceRequestPriceList';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useConfig } from '@/hooks/useConfig';
import { canUseTenantServiceRequests } from '@/lib/permissions';
type TenantTicket = {
  id: string;
  title: string;
  status: string;
  office_label?: string;
  created_at?: string;
  office?: TicketOffice | null;
  offices?: TicketOffice[];
  office_category?: OfficeCategory;
  service_order?: OfficeService & {
    quantity: number;
    totalAmountMinor: number | null;
  };
  raw?: Partial<Ticket>;
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
function ticketOffice(ticket: TenantTicket) {
  return {
    office: ticket.office || ticket.raw?.office,
    offices: ticket.offices || ticket.raw?.offices,
    officeLabel: ticket.office_label,
    category: ticket.office_category,
  };
}
export default function RequestsPage() {
  const { user } = useAuth();
  const config = useConfig();
  const enabled = canUseTenantServiceRequests(user, config);
  const [tickets, setTickets] = useState<TenantTicket[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [officeId, setOfficeId] = useState('');
  const [topic, setTopic] = useState<ServiceRequestTopic>('service');
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
    if (!user || !enabled) return;
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
  }, [user, enabled]);
  useEffect(() => {
    void load();
  }, [load]);
  useAutoRefresh(load, { enabled });
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
    if (!enabled || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await command<{ ticket: TenantTicket }>(
        '/service-requests',
        {
          topic,
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
    if (!enabled || !detail || busy || !reply.trim()) return;
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
  if (user && !enabled)
    return (
      <ProtectedLayout>
        <div className="card p-6 space-y-3" role="status">
          <h1 className="text-xl font-semibold">
            {config ? 'Обращения временно недоступны' : 'Загрузка…'}
          </h1>
          {config && (
            <a href="/profile" className="btn btn-secondary">
              К профилю
            </a>
          )}
        </div>
      </ProtectedLayout>
    );
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
          <div>
            <h1 className="text-2xl font-semibold">Мои обращения</h1>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Переписка с сервисной службой по вашим офисам
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setCreator(!creator)}
          >
            <Plus size={16} />
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
              Категория
              <select
                className="input mt-1"
                aria-label="Категория обращения"
                value={topic}
                onChange={(e) =>
                  setTopic(e.target.value as ServiceRequestTopic)
                }
              >
                {Object.entries(SERVICE_REQUEST_TOPICS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
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
            {topic === 'services' && (
              <ServiceRequestPriceList
                officeId={officeId || user?.offices?.[0]?.id || ''}
              />
            )}
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
        <div className="request-workspace request-workspace--tenant">
          <section
            className={'request-list ' + (mobileDetail ? 'hidden lg:flex' : '')}
            aria-label="Список обращений"
          >
            <div className="request-list__header">
              <MessageSquare size={16} className="text-[var(--muted)]" />
              Обращения
              <span className="request-list__count">{tickets.length}</span>
            </div>
            <div className="request-list__items">
              {loading && (
                <p className="p-5 text-sm text-[var(--muted)]" role="status">
                  Загрузка обращений…
                </p>
              )}
              {!loading && !error && tickets.length === 0 && (
                <p className="p-5 text-sm text-[var(--muted)]">
                  Обращений пока нет.
                </p>
              )}
              {tickets.map((ticket) => (
                <RequestListItem
                  key={ticket.id}
                  id={ticket.id}
                  title={ticket.title}
                  preview={ticket.raw?.last_message_preview}
                  updatedAt={ticket.raw?.last_message_at || ticket.created_at}
                  status={ticket.status}
                  statusLabel={statuses[ticket.status] || ticket.status}
                  office={ticketOffice(ticket)}
                  attention={
                    ticket.raw?.unread_for_customer ? 'Новый ответ' : undefined
                  }
                  selected={detail?.ticket.id === ticket.id}
                  onClick={() => void open(ticket.id)}
                />
              ))}
            </div>
          </section>
          <section
            ref={detailPanel}
            tabIndex={-1}
            className={
              'request-detail ' + (mobileDetail ? '' : 'hidden lg:flex')
            }
          >
            <button
              type="button"
              className="request-back lg:hidden"
              onClick={() => {
                selection.current = '';
                ++selectionVersion.current;
                ++detailRequest.current;
                setMobileDetail(false);
                setDetail(null);
                setDetailLoading(false);
              }}
            >
              <ArrowLeft size={15} />
              Назад к обращениям
            </button>
            {detailLoading ? (
              <RequestChatPlaceholder loading />
            ) : detail ? (
              <>
                <RequestDetailHeader
                  id={detail.ticket.id}
                  title={detail.ticket.title}
                  createdAt={detail.ticket.created_at}
                  topic={detail.ticket.raw?.topic_label}
                  status={detail.ticket.status}
                  statusLabel={
                    statuses[detail.ticket.status] || detail.ticket.status
                  }
                  office={ticketOffice(detail.ticket)}
                />
                {detail.ticket.service_order && (
                  <RequestServiceOrder order={detail.ticket.service_order} />
                )}
                <RequestMessages
                  conversationId={detail.ticket.id}
                  messages={detail.messages}
                  perspective="client"
                  onDownload={(attachment) => void download(attachment)}
                />
                {!['completed', 'cancelled'].includes(detail.ticket.status) ? (
                  <form onSubmit={send} className="request-composer">
                    <textarea
                      aria-label="Сообщение"
                      className="input"
                      rows={2}
                      placeholder="Напишите сервисной службе…"
                      required
                      maxLength={4000}
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      disabled={busy}
                    />
                    <div className="request-composer__actions">
                      <span className="request-composer__hint">
                        Ответ сохранится в обращении
                      </span>
                      <button
                        className="btn btn-primary"
                        disabled={busy || !reply.trim()}
                      >
                        <Send size={14} />
                        {busy ? 'Отправка…' : 'Отправить'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="request-closed">
                    <LockKeyhole size={15} />
                    Обращение закрыто.
                  </p>
                )}
              </>
            ) : (
              <RequestChatPlaceholder />
            )}
          </section>
        </div>
      </div>
    </ProtectedLayout>
  );
}
