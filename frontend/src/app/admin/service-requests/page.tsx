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
  Settings,
  Info,
  PanelLeftClose,
  PanelLeftOpen,
  AlertCircle,
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
  RequestOfficeSummary,
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
  operationDate,
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
  const [workspace, setWorkspace] = useState<HTMLDivElement | null>(null);
  const contextPanel = useRef<HTMLElement>(null);
  const previousPanel = useRef<string | null>(null);
  const [sidePanel, setSidePanel] = useState<'details' | 'settings' | null>(
    null,
  );
  const [listCollapsed, setListCollapsed] = useState(false);
  const [sentVersion, setSentVersion] = useState(0);
  const drafts = useRef(
    new Map<
      number,
      {
        message: string;
        file: File | null;
        uploaded: Attachment | null;
      }
    >(),
  );
  const saveDraft = () => {
    if (selection.current)
      drafts.current.set(selection.current, {
        message,
        file,
        uploaded: uploaded.current,
      });
  };
  useEffect(() => {
    if (sidePanel) contextPanel.current?.focus({ preventScroll: true });
    else if (previousPanel.current)
      (replyRef.current || detailPanel.current)?.focus({ preventScroll: true });
    previousPanel.current = sidePanel;
  }, [sidePanel]);
  useEffect(() => {
    const panel = workspace;
    if (!panel) return;
    const resize = () => {
      const height = Math.max(
        420,
        window.innerHeight -
          (panel.getBoundingClientRect().top + window.scrollY) -
          20,
      );
      panel.style.setProperty('--support-height', height + 'px');
      const viewportHeight =
        window.visualViewport?.height || window.innerHeight;
      const navHeight =
        document.querySelector('.mobile-nav')?.getBoundingClientRect().height ||
        0;
      const keyboard = viewportHeight < window.innerHeight * 0.8;
      panel.dataset.keyboard = String(keyboard);
      panel.style.setProperty(
        '--support-mobile-height',
        Math.max(220, viewportHeight - 104 - navHeight) + 'px',
      );
    };
    const observer = new ResizeObserver(resize);
    if (panel.parentElement) observer.observe(panel.parentElement);
    resize();
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
    };
  }, [workspace]);
  useEffect(() => {
    const input = replyRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(160, Math.max(56, input.scrollHeight)) + 'px';
  }, [message, detail?.ticket.id, sidePanel]);
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
    const media = window.matchMedia('(max-width: 1279px)');
    let width = window.innerWidth;
    const align = () => {
      if (!mobileDetail || detailLoading) return;
      if (!detailPanel.current?.offsetParent) return;
      if (media.matches) {
        detailPanel.current?.scrollIntoView({ block: 'start' });
      } else window.scrollTo({ top: 0 });
    };
    const resize = () => {
      if (width === window.innerWidth) return;
      width = window.innerWidth;
      requestAnimationFrame(align);
    };
    if (media.matches) {
      detailPanel.current?.focus({ preventScroll: true });
      align();
    }
    media.addEventListener('change', align);
    window.addEventListener('resize', resize);
    return () => {
      media.removeEventListener('change', align);
      window.removeEventListener('resize', resize);
    };
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
    if (selection.current === id && (detail || detailLoading)) {
      setMobileDetail(true);
      return;
    }
    saveDraft();
    selection.current = id;
    ++selectionVersion.current;
    setDetail(null);
    setDetailLoading(true);
    setMobileDetail(true);
    const draft = drafts.current.get(id);
    setMessage(draft?.message || '');
    setFile(draft?.file || null);
    uploaded.current = draft?.uploaded || null;
    setSidePanel(null);
    try {
      await refreshDetail(id);
    } catch (e) {
      toast(getErrorMessage(e), 'error');
      if (selection.current === id) setDetailLoading(false);
    }
  };
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (
      !detail ||
      !message.trim() ||
      busyRef.current ||
      counts?.mode !== 'pass'
    )
      return;
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
      drafts.current.delete(id);
      if (selection.current === id) {
        setSentVersion((current) => current + 1);
        setMessage('');
        setFile(null);
        uploaded.current = null;
      }
      if (selection.current === id && selectionVersion.current === version) {
        ++detailRequest.current;
        setDetail(next);
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
      if (selection.current && selectionVersion.current !== version)
        void refreshDetail(selection.current).catch(() => undefined);
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
  const ticket = detail?.ticket;
  const office = {
    office: ticket?.office,
    offices: ticket?.offices,
    officeLabel: ticket?.office_label,
    category: ticket?.office_category,
  };
  const warnings = [
    ticket?.crm?.error,
    ticket?.crm?.attachmentError,
    ticket?.crm?.assignmentError,
  ].filter(Boolean);
  const backToList = () => {
    saveDraft();
    selection.current = 0;
    ++selectionVersion.current;
    ++detailRequest.current;
    setMobileDetail(false);
    setDetail(null);
    setDetailLoading(false);
    setSidePanel(null);
  };
  return (
    <AdminLayout
      title="Сервисные заявки"
      compactHeader
      actions={
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          aria-expanded={sidePanel === 'settings'}
          aria-controls="support-context"
          onClick={() =>
            setSidePanel((current) =>
              current === 'settings' ? null : 'settings',
            )
          }
        >
          <Settings size={16} /> Настройки CRM
        </button>
      }
    >
      <div className="operations-page operations-page--support">
        {error && <PageError message={error} onRetry={load} />}
        {counts && counts.mode !== 'pass' && (
          <p className="operations-notice support-mode-notice" role="status">
            {counts.mode === 'paused'
              ? 'Приём изменений временно приостановлен.'
              : 'Раздел готовится к подключению. Обращения пока обрабатываются на сайте.'}
          </p>
        )}
        <div
          ref={setWorkspace}
          className="request-workspace request-workspace--admin support-inbox"
          data-conversation={mobileDetail}
          data-panel={sidePanel || ''}
          data-list-collapsed={listCollapsed}
        >
          <section className="request-list" aria-label="Список обращений">
            <div className="request-list__header">
              <MessageSquare size={17} /> Обращения
              <span className="request-list__count">{list?.total ?? '…'}</span>
              <button
                type="button"
                className="support-icon-button support-collapse"
                aria-label="Скрыть список обращений"
                title="Скрыть список обращений"
                onClick={() => setListCollapsed(true)}
              >
                <PanelLeftClose size={17} />
              </button>
            </div>
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
                    {
                      value: '1',
                      label: 'Требуют ответа',
                      count: counts?.support,
                    },
                  ]}
                  onChange={(needs_action) =>
                    setFilters((f) => ({ ...f, needs_action, page: 1 }))
                  }
                />
              </div>
              <OperationsFilters
                kind="support"
                activeCount={
                  [filters.category, filters.status, filters.topic].filter(
                    Boolean,
                  ).length
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
                      setFilters((f) => ({
                        ...f,
                        status: e.target.value,
                        page: 1,
                      }))
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
                      setFilters((f) => ({
                        ...f,
                        topic: e.target.value,
                        page: 1,
                      }))
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
                    attention={
                      ticket.needs_action &&
                      !['completed', 'cancelled'].includes(ticket.status)
                        ? 'Ждёт ответа'
                        : undefined
                    }
                    selected={selection.current === ticket.id}
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
            className="request-detail"
            aria-label="Чат обращения"
          >
            <button
              type="button"
              className="request-back support-mobile-back"
              onClick={backToList}
            >
              <ArrowLeft size={16} /> Все обращения
            </button>
            {detailLoading ? (
              <RequestChatPlaceholder loading />
            ) : !detail ? (
              <>
                {listCollapsed && (
                  <button
                    type="button"
                    className="request-back support-show-list"
                    onClick={() => setListCollapsed(false)}
                  >
                    <PanelLeftOpen size={17} /> Показать обращения
                  </button>
                )}
                <RequestChatPlaceholder />
              </>
            ) : (
              <>
                <div className="support-chat-heading">
                  <div className="support-chat-heading__main">
                    <RequestDetailHeader
                      id={detail.ticket.id}
                      title={detail.ticket.subject}
                      requester={detail.ticket.requester_name}
                      topic={detail.ticket.topic_label}
                      status={detail.ticket.status}
                      statusLabel={detail.ticket.status_label}
                      office={office}
                      compactOffice
                    />
                  </div>
                  <div className="support-chat-tools">
                    {listCollapsed && (
                      <button
                        type="button"
                        className="support-icon-button support-collapse"
                        aria-label="Показать список обращений"
                        title="Показать список обращений"
                        onClick={() => setListCollapsed(false)}
                      >
                        <PanelLeftOpen size={18} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      aria-expanded={sidePanel === 'details'}
                      aria-controls="support-context"
                      onClick={() =>
                        setSidePanel((current) =>
                          current === 'details' ? null : 'details',
                        )
                      }
                    >
                      <Info size={16} /> Сведения
                    </button>
                  </div>
                </div>
                {warnings.length > 0 && (
                  <button
                    type="button"
                    className="support-sync-notice"
                    onClick={() => setSidePanel('details')}
                  >
                    <AlertCircle size={15} />
                    <span>CRM требует внимания · {warnings.length}</span>
                    <span className="support-sync-notice__action">
                      Подробнее
                    </span>
                  </button>
                )}
                <RequestMessages
                  conversationId={detail.ticket.id}
                  messages={detail.messages}
                  perspective="support"
                  followLatest={sentVersion}
                  onDownload={(attachment) => void download(attachment)}
                />
                {detail.can_reply ? (
                  <form onSubmit={send} className="request-composer">
                    <textarea
                      ref={replyRef}
                      aria-label="Ответ клиенту"
                      className="input"
                      rows={1}
                      onKeyDown={(e) => {
                        if (
                          e.key === 'Enter' &&
                          (e.ctrlKey || e.metaKey) &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          e.currentTarget.form?.requestSubmit();
                        }
                      }}
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
                          disabled={busy}
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
                      <p className="support-composer-hint">
                        Ctrl / ⌘ + Enter — отправить
                      </p>
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
          {sidePanel && (
            <aside
              ref={contextPanel}
              tabIndex={-1}
              id="support-context"
              className="support-context"
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSidePanel(null);
              }}
              aria-label={
                sidePanel === 'details' ? 'Сведения о заявке' : 'Настройки CRM'
              }
            >
              <header className="support-context__heading">
                <h2>
                  {sidePanel === 'details'
                    ? 'Сведения о заявке'
                    : 'Настройки CRM'}
                </h2>
                <button
                  type="button"
                  className="support-icon-button"
                  aria-label="Закрыть панель сведений"
                  onClick={() => setSidePanel(null)}
                >
                  <X size={18} />
                </button>
              </header>
              <button
                type="button"
                className="request-back support-context-back"
                onClick={() => setSidePanel(null)}
              >
                <ArrowLeft size={16} />{' '}
                {mobileDetail ? 'К переписке' : 'К обращениям'}
              </button>
              <div className="support-context__body">
                {sidePanel === 'settings' ? (
                  <>
                    {!integration && (
                      <p
                        className="p-4 text-sm text-[var(--muted)]"
                        role="status"
                      >
                        Загрузка настроек CRM…
                      </p>
                    )}
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
                            Для ответа арендатору начните комментарий в CRM с
                            (ответ). Остальные комментарии остаются в Bitrix24.
                          </p>
                          {integration.capabilities?.staff === false && (
                            <p className="text-xs mt-1">
                              Для выбора ответственного добавьте вебхуку
                              Bitrix24 доступ к списку пользователей.
                            </p>
                          )}
                          {integration.capabilities?.notifications ===
                            false && (
                            <p className="text-xs mt-1">
                              Для уведомлений сотрудника добавьте вебхуку
                              Bitrix24 доступ «Чат и уведомления».
                            </p>
                          )}
                          {integration.capabilities?.files === false && (
                            <p className="text-xs mt-1">
                              Для получения вложений из CRM добавьте вебхуку
                              Bitrix24 доступ «Диск».
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
                    {integration?.enabled && (
                      <BitrixDefaultResponsibility compact />
                    )}
                  </>
                ) : (
                  ticket && (
                    <>
                      <section className="support-context__section">
                        <h3>Обращение №{ticket.id}</h3>
                        <dl className="support-facts">
                          <div>
                            <dt>Арендатор</dt>
                            <dd>{ticket.requester_name || 'Не указан'}</dd>
                          </div>
                          <div>
                            <dt>Тема</dt>
                            <dd>{ticket.topic_label}</dd>
                          </div>
                          <div>
                            <dt>Создано</dt>
                            <dd>{operationDate(ticket.created_at)}</dd>
                          </div>
                        </dl>
                        <RequestOfficeSummary {...office} />
                      </section>
                      {ticket.crm?.managed ? (
                        <>
                          <BitrixTicketResponsibility
                            compact
                            key={ticket.id}
                            ticket={ticket}
                            onSaved={(updated) => {
                              if (selection.current === updated.ticket.id)
                                setDetail(updated);
                            }}
                          />
                          <section className="support-context__section">
                            <h3>Bitrix24</h3>
                            <p className="text-sm text-[var(--muted)]">
                              {ticket.crm.stage || ticket.status_label}
                            </p>
                            {ticket.crm.pending && (
                              <p className="text-xs" role="status">
                                Передаётся в CRM…
                              </p>
                            )}
                            {ticket.crm.url && (
                              <a
                                className="btn btn-secondary btn-sm"
                                href={ticket.crm.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Открыть CRM <ExternalLink size={13} />
                              </a>
                            )}
                            {ticket.crm.error && (
                              <p
                                className="support-context__warning"
                                role="alert"
                              >
                                {ticket.crm.error}
                              </p>
                            )}
                            {ticket.crm.attachmentError && (
                              <p
                                className="support-context__warning"
                                role="alert"
                              >
                                {ticket.crm.attachmentError}
                              </p>
                            )}
                          </section>
                        </>
                      ) : (
                        <section className="support-context__section">
                          <h3>Статус обращения</h3>
                          <select
                            aria-label="Изменить статус обращения"
                            className="input"
                            disabled={busy || counts?.mode !== 'pass'}
                            value={ticket.status}
                            onChange={(e) => void status(e.target.value)}
                          >
                            {Object.entries(list?.statuses || {}).map(
                              ([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </section>
                      )}
                      {ticket.booking_id && (
                        <Link
                          href={
                            '/admin/booking-requests?id=' + ticket.booking_id
                          }
                          className="request-related"
                        >
                          Связанная бронь №{ticket.booking_id}
                          <ExternalLink size={13} />
                        </Link>
                      )}
                      {ticket.service_order && (
                        <RequestServiceOrder order={ticket.service_order} />
                      )}
                    </>
                  )
                )}
              </div>
            </aside>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
