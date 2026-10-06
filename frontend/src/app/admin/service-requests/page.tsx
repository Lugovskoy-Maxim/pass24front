'use client';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ExternalLink,
  LockKeyhole,
  MessageSquare,
  Paperclip,
  Search,
  Send,
  X,
  RotateCcw,
} from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { useToast } from '@/components/Toast';
import { PageError } from '@/components/PageError';
import {
  BitrixDefaultResponsibility,
  BitrixTicketResponsibility,
} from '@/components/BitrixResponsibility';
import {
  OperationsFilters,
  OperationsFilter,
  OperationsQueueTabs,
  OperationsEmptyState,
  OperationsPagination,
} from '@/components/OperationsWorkspace';
import {
  RequestChatPlaceholder,
  RequestDetailHeader,
  RequestListItem,
  RequestMessages,
  RequestServiceOrder,
} from '@/components/ServiceRequestChat';
import { OfficeCategory, officeServices } from '@/lib/office-services';
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
  SupportIntegration,
} from '@/lib/operations';

export default function ServiceRequestsPage() {
  const { toast } = useToast();
  const { counts } = useWorkQueue();
  const [list, setList] = useState<Page<Ticket> | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [categories, setCategories] = useState<OfficeCategory[]>([]);
  const [integration, setIntegration] = useState<SupportIntegration | null>(
    null,
  );
  const [checkingCrm, setCheckingCrm] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    topic: '',
    search: '',
    needs_action: '',
    booking_id: '',
    category: '',
    page: 1,
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const uploaded = useRef<Attachment | null>(null);
  const selection = useRef(0);
  const selectionVersion = useRef(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);
  const detailPanel = useRef<HTMLElement>(null);
  const refreshDetail = useCallback(async (id: number) => {
    if (!id) return;
    const sequence = ++detailRequest.current;
    const next = await operations.ticket(id);
    if (selection.current === id && sequence === detailRequest.current) {
      setDetail(next);
      setDetailLoading(false);
    }
  }, []);
  const load = useCallback(async () => {
    const sequence = ++listRequest.current;
    const query = filtersRef.current;
    try {
      const next = await operations.tickets(query);
      if (sequence !== listRequest.current || query !== filtersRef.current)
        return;
      const lastPage = Math.max(1, Math.ceil(next.total / next.per_page));
      if (query.page > lastPage) {
        setFilters((current) => ({ ...current, page: lastPage }));
        return;
      }
      setList(next);
      if (selection.current && !busyRef.current)
        await refreshDetail(selection.current);
      setError('');
    } catch (e) {
      if (sequence === listRequest.current) setError(getErrorMessage(e));
    }
  }, [refreshDetail]);
  useEffect(() => {
    if (
      mobileDetail &&
      !detailLoading &&
      window.matchMedia('(max-width: 1279px)').matches
    ) {
      detailPanel.current?.focus();
      detailPanel.current?.scrollIntoView({ block: 'start' });
    }
  }, [mobileDetail, detailLoading]);
  useEffect(() => {
    void load();
  }, [load, filters]);
  useEffect(() => {
    void officeServices
      .categories()
      .then((r) => setCategories(r.categories))
      .catch((e) => setError(getErrorMessage(e)));
  }, []);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setFilters((f) => ({
      ...f,
      needs_action: q.get('needs_action') === '1' ? '1' : '',
      booking_id: q.get('booking_id') || '',
    }));
  }, []);
  useAutoRefresh(load);
  const loadIntegration = useCallback(async () => {
    try {
      setIntegration(await operations.supportIntegration());
    } catch {
      /* The request queue remains available independently. */
    }
  }, []);
  useAutoRefresh(loadIntegration);
  useEffect(() => {
    void loadIntegration();
  }, [loadIntegration]);
  const checkCrm = async () => {
    setCheckingCrm(true);
    try {
      setIntegration(await operations.checkSupportIntegration());
    } catch (error) {
      toast(getErrorMessage(error, 'Не удалось проверить CRM'), 'error');
    } finally {
      setCheckingCrm(false);
    }
  };
  const open = async (id: number) => {
    selection.current = id;
    ++selectionVersion.current;
    setDetail(null);
    setDetailLoading(true);
    setMobileDetail(true);
    setMessage('');
    setFile(null);
    uploaded.current = null;
    try {
      await refreshDetail(id);
    } catch (e) {
      toast(getErrorMessage(e), 'error');
      if (selection.current === id) setDetailLoading(false);
    }
  };
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!detail || !message.trim() || busy) return;
    const id = detail.ticket.id;
    const version = selectionVersion.current;
    const draft = message.trim();
    const attachment = file;
    let upload = uploaded.current;
    busyRef.current = true;
    ++detailRequest.current;
    setBusy(true);
    try {
      if (attachment && !upload) {
        upload = await operations.upload(attachment);
        if (selection.current === id && selectionVersion.current === version)
          uploaded.current = upload;
      }
      const next = await command<TicketDetail>(
        `/admin/service-requests/${id}/messages`,
        {
          message_text: draft,
          revision: detail.ticket.revision,
          attachment_ids: upload ? [upload.attachment_id] : [],
        },
      );
      if (selection.current === id && selectionVersion.current === version) {
        ++detailRequest.current;
        setDetail(next);
        setMessage('');
        setFile(null);
        uploaded.current = null;
      }
      await load();
      toast('Ответ отправлен', 'success');
    } catch (e) {
      toast(getErrorMessage(e), 'error');
      if (
        selection.current === id &&
        selectionVersion.current === version &&
        getErrorStatus(e) === 409
      )
        await refreshDetail(id).catch(() => undefined);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const status = async (value: string) => {
    if (!detail || busy) return;
    const id = detail.ticket.id;
    const version = selectionVersion.current;
    busyRef.current = true;
    ++detailRequest.current;
    setBusy(true);
    try {
      const next = await command<TicketDetail>(
        `/admin/service-requests/${id}/status`,
        { status: value, revision: detail.ticket.revision },
        'PATCH',
      );
      if (selection.current === id && selectionVersion.current === version) {
        ++detailRequest.current;
        setDetail(next);
      }
      await load();
    } catch (e) {
      toast(getErrorMessage(e), 'error');
      if (
        selection.current === id &&
        selectionVersion.current === version &&
        getErrorStatus(e) === 409
      )
        await refreshDetail(id).catch(() => undefined);
    } finally {
      busyRef.current = false;
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
  const hasFilters = !!(
    filters.search ||
    filters.status ||
    filters.topic ||
    filters.category ||
    filters.booking_id
  );
  const resetFilters = () =>
    setFilters((current) => ({
      ...current,
      search: '',
      status: '',
      topic: '',
      category: '',
      booking_id: '',
      page: 1,
    }));
  return (
    <AdminLayout
      title="Сервисные заявки"
      description="Обращения арендаторов, услуги для офисов и переписка с клиентами."
    >
      <div className="operations-page operations-page--support">
        {integration && (
          <div
            className="operations-notice flex flex-col items-stretch sm:flex-row sm:items-center gap-3"
            role="status"
          >
            <div className="flex-1 min-w-0">
              <strong>
                Bitrix24 · {integration.funnel?.name || 'Сервис'}
                {integration.ready
                  ? ' · подключён'
                  : integration.enabled
                    ? ' · требуется проверка'
                    : integration.configured
                      ? ' · выключен'
                      : ' · не настроен'}
              </strong>
              <p className="text-xs mt-1">
                {integration.error ||
                  (integration.enabled
                    ? 'Заявки передаются в CRM. Ответы из комментариев и статусы обновляются примерно раз в минуту.'
                    : 'Для подключения задайте полный адрес CRM-вебхука в BITRIX_API_KEY на сервере и включите BITRIX_ENABLED.')}
              </p>
              <p className="text-xs mt-1">
                Для ответа арендатору начните комментарий в CRM с (ответ).
                Остальные комментарии остаются в Bitrix24.
              </p>
              {integration.capabilities?.staff === false && (
                <p className="text-xs mt-1">
                  Для выбора ответственного добавьте вебхуку Bitrix24 доступ к
                  списку пользователей.
                </p>
              )}
              {integration.capabilities?.notifications === false && (
                <p className="text-xs mt-1">
                  Для уведомлений сотрудника добавьте вебхуку Bitrix24 доступ
                  «Чат и уведомления».
                </p>
              )}
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={checkingCrm}
              onClick={() => void checkCrm()}
            >
              {checkingCrm ? 'Проверка…' : 'Проверить Bitrix24'}
            </button>
          </div>
        )}
        {counts && counts.mode !== 'pass' && (
          <p className="operations-notice" role="status">
            {counts.mode === 'paused'
              ? 'Приём изменений временно приостановлен.'
              : 'Раздел готовится к подключению. Обращения пока обрабатываются на сайте.'}
          </p>
        )}
        {integration?.enabled && <BitrixDefaultResponsibility />}
        <section
          className="operations-controls"
          aria-label="Очереди и фильтры сервисных заявок"
        >
          <div className="operations-controls__top">
            <OperationsQueueTabs
              label="Очереди обращений"
              active={filters.needs_action}
              items={[
                { value: '', label: 'Все обращения' },
                { value: '1', label: 'Требуют ответа', count: counts?.support },
              ]}
              onChange={(needs_action) =>
                setFilters((f) => ({ ...f, needs_action, page: 1 }))
              }
            />
            <span className="operations-controls__hint">
              Выберите обращение, чтобы ответить
            </span>
          </div>
          <OperationsFilters
            kind="support"
            activeCount={
              [filters.category, filters.status, filters.topic].filter(Boolean)
                .length
            }
            search={
              <OperationsFilter label="Поиск">
                <span className="operations-search">
                  <Search size={16} aria-hidden="true" />
                  <input
                    aria-label="Поиск обращений"
                    className="input"
                    placeholder="Номер, тема или автор"
                    value={filters.search}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        search: e.target.value,
                        page: 1,
                      }))
                    }
                  />
                </span>
              </OperationsFilter>
            }
          >
            <OperationsFilter label="Категория офиса">
              <select
                className="input"
                aria-label="Категория офиса"
                value={filters.category}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    category: e.target.value,
                    page: 1,
                  }))
                }
              >
                <option value="">Все категории</option>
                {categories.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </OperationsFilter>
            <OperationsFilter label="Статус">
              <select
                aria-label="Статус"
                className="input"
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
            </OperationsFilter>
            <OperationsFilter label="Тема">
              <select
                aria-label="Тема"
                className="input"
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
            </OperationsFilter>
          </OperationsFilters>
          {hasFilters && (
            <div className="operations-filter-summary">
              <span>
                {filters.booking_id ? (
                  <>Связанная бронь №{filters.booking_id}</>
                ) : (
                  'Применены фильтры'
                )}
              </span>
              <button
                type="button"
                className="operations-reset"
                onClick={resetFilters}
              >
                <RotateCcw size={13} />
                Сбросить фильтры
              </button>
            </div>
          )}
        </section>
        {error && <PageError message={error} onRetry={load} />}
        <div className="request-workspace request-workspace--admin">
          <section
            className={'request-list ' + (mobileDetail ? 'hidden xl:flex' : '')}
            aria-label="Список обращений"
          >
            <div className="request-list__header">
              <MessageSquare size={16} className="text-[var(--muted)]" />
              Обращения
              <span className="request-list__count">{list?.total ?? '…'}</span>
            </div>
            <div className="request-list__items">
              {!list ? (
                <p className="p-5 text-sm text-[var(--muted)]" role="status">
                  Загрузка…
                </p>
              ) : !list.items.length ? (
                <OperationsEmptyState
                  title="Обращений пока нет"
                  description="Попробуйте другую очередь или измените фильтры."
                  onReset={hasFilters ? resetFilters : undefined}
                />
              ) : (
                list.items.map((ticket) => (
                  <RequestListItem
                    key={ticket.id}
                    id={ticket.id}
                    title={ticket.subject}
                    preview={ticket.last_message_preview}
                    requester={ticket.requester_name}
                    updatedAt={ticket.last_message_at}
                    status={ticket.status}
                    statusLabel={ticket.status_label}
                    office={{
                      office: ticket.office,
                      offices: ticket.offices,
                      officeLabel: ticket.office_label,
                      category: ticket.office_category,
                    }}
                    //Если есть непрочитанные сообщения и обращение не закрыто, показываем бейдж "Ждёт ответ"
                    attention={ticket.needs_action ? ticket.status != 'closed' ? 'Ждёт ответа' : undefined : undefined}
                    selected={detail?.ticket.id === ticket.id}
                    onClick={() => void open(ticket.id)}
                  />
                ))
              )}
            </div>
            {list && (list.total > list.per_page || filters.page > 1) && (
              <OperationsPagination
                page={filters.page}
                total={list.total}
                perPage={list.per_page}
                onChange={(page) => setFilters((f) => ({ ...f, page }))}
              />
            )}
          </section>
          <section
            ref={detailPanel}
            tabIndex={-1}
            className={
              'request-detail ' + (mobileDetail ? '' : 'hidden xl:flex')
            }
          >
            <button
              type="button"
              className="request-back xl:hidden"
              onClick={() => {
                selection.current = 0;
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
            ) : !detail ? (
              <RequestChatPlaceholder />
            ) : (
              <>
                <RequestDetailHeader
                  id={detail.ticket.id}
                  title={detail.ticket.subject}
                  requester={detail.ticket.requester_name}
                  createdAt={detail.ticket.created_at}
                  topic={detail.ticket.topic_label}
                  status={detail.ticket.status}
                  statusLabel={detail.ticket.status_label}
                  office={{
                    office: detail.ticket.office,
                    offices: detail.ticket.offices,
                    officeLabel: detail.ticket.office_label,
                    category: detail.ticket.office_category,
                  }}
                >
                  {detail.ticket.crm?.managed ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span>
                        Статус из CRM
                        {detail.ticket.crm.stage
                          ? ` · ${detail.ticket.crm.stage}`
                          : ''}
                      </span>
                      {detail.ticket.crm.url && (
                        <a
                          className="btn btn-secondary btn-sm"
                          href={detail.ticket.crm.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Открыть CRM <ExternalLink size={13} />
                        </a>
                      )}
                      {detail.ticket.crm.pending && (
                        <span>Передаётся в CRM…</span>
                      )}
                      {detail.ticket.crm.error && (
                        <span className="theme-alert p-2" role="alert">
                          {detail.ticket.crm.error}
                        </span>
                      )}
                    </div>
                  ) : (
                    <>
                      <span className="text-xs text-[var(--muted)]">
                        Статус
                      </span>
                      <select
                        aria-label="Изменить статус обращения"
                        className="input"
                        disabled={busy || counts?.mode !== 'pass'}
                        value={detail.ticket.status}
                        onChange={(e) => void status(e.target.value)}
                      >
                        {Object.entries(list?.statuses || {}).map(
                          ([v, label]) => (
                            <option key={v} value={v}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                    </>
                  )}
                  {detail.can_reply && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm ml-auto"
                      onClick={() => replyRef.current?.focus()}
                    >
                      <Send size={13} />
                      Ответить
                    </button>
                  )}
                </RequestDetailHeader>
                {detail.ticket.crm?.managed && (
                  <BitrixTicketResponsibility
                    key={detail.ticket.id}
                    ticket={detail.ticket}
                    onSaved={(updated) => {
                      if (selection.current === updated.ticket.id)
                        setDetail(updated);
                    }}
                  />
                )}
                {detail.ticket.booking_id && (
                  <Link
                    href={
                      '/admin/booking-requests?id=' + detail.ticket.booking_id
                    }
                    className="request-related"
                  >
                    Связанная бронь №{detail.ticket.booking_id}
                    <ExternalLink size={13} />
                  </Link>
                )}
                {detail.ticket.service_order && (
                  <RequestServiceOrder order={detail.ticket.service_order} />
                )}
                <RequestMessages
                  conversationId={detail.ticket.id}
                  messages={detail.messages}
                  perspective="support"
                  onDownload={(attachment) => void download(attachment)}
                />
                {detail.can_reply ? (
                  <form onSubmit={send} className="request-composer">
                    <textarea
                      ref={replyRef}
                      aria-label="Ответ клиенту"
                      className="input"
                      rows={2}
                      placeholder="Напишите ответ арендатору…"
                      maxLength={20000}
                      required
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      disabled={busy}
                    />
                    {file && (
                      <div className="request-composer__file">
                        <Paperclip size={13} />
                        <span>{file.name}</span>
                        <button
                          type="button"
                          aria-label="Удалить вложение"
                          onClick={() => {
                            setFile(null);
                            uploaded.current = null;
                          }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                    <div className="request-composer__actions">
                      <label className="request-composer__attach">
                        <Paperclip size={16} />
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
                        <Send size={14} />
                        {busy ? 'Отправка…' : 'Отправить'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="request-closed">
                    <LockKeyhole size={15} />
                    Обращение закрыто. Для продолжения переписки переведите его
                    в работу.
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </AdminLayout>
  );
}
