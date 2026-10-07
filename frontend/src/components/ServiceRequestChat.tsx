'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  Building2,
  ChevronDown,
  Download,
  FileText,
  MessageSquare,
  Package,
} from 'lucide-react';
import { OfficeCategoryBadge } from './OfficeCategoryBadge';
import { OperationsStatusBadge } from './OperationsStatusBadge';
import type { Attachment, TicketOffice } from '@/lib/operations';
import { operationDate } from '@/lib/operations';
import type { OfficeCategory, OfficeService } from '@/lib/office-services';
import { officeMoney, SERVICE_UNITS } from '@/lib/office-services';

function messageDate(value: string) {
  const date = new Date(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
      ? value.replace(' ', 'T') + '+03:00'
      : value,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

export function requestActivityTime(value?: string) {
  const date = value ? messageDate(value) : null;
  if (!date) return '';
  const day = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(d);
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    ...(day(date) === day(new Date())
      ? { hour: '2-digit', minute: '2-digit' }
      : { day: '2-digit', month: 'short' }),
  }).format(date);
}

export type RequestOfficeMetadata = {
  office?: TicketOffice | null;
  offices?: TicketOffice[];
  officeLabel?: string | null;
  category?: OfficeCategory | null;
};

export function RequestOfficeSummary({
  office,
  offices,
  officeLabel,
  category,
  compact = false,
}: RequestOfficeMetadata & { compact?: boolean }) {
  const resolved: TicketOffice[] = offices?.length
    ? offices
    : office
      ? [{ ...office, category: office.category || category }]
      : officeLabel
        ? [{ label: officeLabel, category }]
        : [];
  const visible = compact ? resolved.slice(0, 1) : resolved;
  return (
    <div
      className={`request-offices ${compact ? 'request-offices--compact' : ''}`}
    >
      {!resolved.length && (
        <span className="request-office__address">
          <Building2 size={13} aria-hidden="true" /> Офис не указан
        </span>
      )}
      {visible.map((item, index) => (
        <div className="request-office" key={item.id || index}>
          <span
            className="request-office__address"
            title={item.label || officeLabel || undefined}
          >
            <Building2 size={13} aria-hidden="true" />
            <span>
              Офис {item.number || item.label || officeLabel || 'не указан'}
            </span>
          </span>
          {item.category ? (
            <OfficeCategoryBadge category={item.category} compact />
          ) : (
            <span className="request-office__unknown">
              Категория не указана
            </span>
          )}
          {'businessCenterName' in item && item.businessCenterName && (
            <span
              className="request-office__center"
              title={item.businessCenterName}
            >
              {item.businessCenterName}
            </span>
          )}
        </div>
      ))}
      {compact && resolved.length > 1 && (
        <span className="request-office__more">+{resolved.length - 1} оф.</span>
      )}
    </div>
  );
}

export function RequestListItem({
  id,
  title,
  preview,
  requester,
  updatedAt,
  status,
  statusLabel,
  office,
  attention,
  selected,
  onClick,
}: {
  id: string | number;
  title: string;
  preview?: string;
  requester?: string;
  updatedAt?: string;
  status: string;
  statusLabel: string;
  office: RequestOfficeMetadata;
  attention?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`request-list-item ${selected ? 'request-list-item--selected' : ''}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      <span className="request-list-item__top">
        <span className="request-list-item__title" title={title}>
          <span className="request-list-item__number">№{id} · </span>
          {title}
        </span>
        {updatedAt && (
          <time
            className="request-list-item__time"
            title={operationDate(updatedAt)}
          >
            {requestActivityTime(updatedAt)}
          </time>
        )}
      </span>
      <RequestOfficeSummary {...office} compact />
      <span className="request-list-item__preview">
        {preview || 'Откройте обращение, чтобы прочитать сообщение'}
      </span>
      <span className="request-list-item__bottom">
        <OperationsStatusBadge status={status} label={statusLabel} />
        {attention ? (
          <span className="request-list-item__attention">
            <span />
            {attention}
          </span>
        ) : requester ? (
          <span className="request-list-item__requester">{requester}</span>
        ) : null}
      </span>
    </button>
  );
}

export function RequestDetailHeader({
  id,
  title,
  requester,
  createdAt,
  topic,
  status,
  statusLabel,
  office,
  children,
  compactOffice = false,
}: {
  id: string | number;
  title: string;
  requester?: string;
  createdAt?: string;
  topic?: string;
  status: string;
  statusLabel: string;
  office: RequestOfficeMetadata;
  children?: ReactNode;
  compactOffice?: boolean;
}) {
  return (
    <header className="request-detail__header">
      <div className="request-detail__title-row">
        <h2>
          №{id} · {title}
        </h2>
        <OperationsStatusBadge status={status} label={statusLabel} />
      </div>
      <RequestOfficeSummary {...office} compact={compactOffice} />
      <div className="request-detail__metadata">
        {requester && <span>{requester}</span>}
        {topic && <span>{topic}</span>}
        {createdAt && <time title="Создано">{operationDate(createdAt)}</time>}
      </div>
      {children && <div className="request-detail__actions">{children}</div>}
    </header>
  );
}

type ChatMessage = {
  id: number;
  author_type: string;
  author_label: string;
  created_at: string;
  body?: string;
  message_text?: string;
  attachments?: Attachment[];
  edited_at?: string;
  deleted?: boolean;
};

export function RequestMessages({
  conversationId,
  messages,
  perspective,
  onDownload,
  followLatest = 0,
}: {
  conversationId: string | number;
  messages: ChatMessage[];
  perspective: 'support' | 'client';
  onDownload: (attachment: Attachment) => void;
  followLatest?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const geometry = useRef({ height: 0, content: 0 });
  const previousConversation = useRef<string | number | null>(null);
  const previousFollow = useRef(followLatest);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const latest = messages.at(-1)?.id;
  useEffect(() => {
    const panel = scrollRef.current;
    if (!panel) return;
    const observer = new ResizeObserver(() => {
      geometry.current = {
        height: panel.clientHeight,
        content: panel.scrollHeight,
      };
      if (pinned.current && panel.clientHeight)
        panel.scrollTop = panel.scrollHeight;
    });
    observer.observe(panel);
    if (panel.firstElementChild) observer.observe(panel.firstElementChild);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const changed = previousConversation.current !== conversationId;
    const sent = previousFollow.current !== followLatest;
    previousFollow.current = followLatest;
    previousConversation.current = conversationId;
    if (changed || sent || pinned.current) {
      const frame = requestAnimationFrame(() => {
        const panel = scrollRef.current;
        if (panel) panel.scrollTop = panel.scrollHeight;
        pinned.current = true;
        setHasNewMessages(false);
      });
      return () => cancelAnimationFrame(frame);
    }
    setHasNewMessages(true);
  }, [conversationId, latest, followLatest]);
  return (
    <div className="request-timeline">
      <div
        ref={scrollRef}
        className="request-messages"
        role="log"
        aria-label="Переписка"
        aria-live="polite"
        onScroll={() => {
          const panel = scrollRef.current;
          if (!panel) return;
          // A resize or arriving message can emit a scroll event before the
          // observer restores the bottom. Preserve the reader's previous intent.
          if (
            panel.clientHeight !== geometry.current.height ||
            panel.scrollHeight !== geometry.current.content
          )
            return;
          pinned.current =
            panel.scrollHeight - panel.scrollTop - panel.clientHeight < 64;
          if (pinned.current) setHasNewMessages(false);
        }}
      >
        <div className="request-messages__content">
          {messages.map((item, index) => {
            const date = messageDate(item.created_at);
            const day = date
              ? new Intl.DateTimeFormat('ru-RU', {
                  timeZone: 'Europe/Moscow',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                }).format(date)
              : item.created_at;
            const previous = index
              ? messageDate(messages[index - 1].created_at)
              : null;
            const previousDay = previous
              ? new Intl.DateTimeFormat('ru-RU', {
                  timeZone: 'Europe/Moscow',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                }).format(previous)
              : '';
            const outgoing =
              perspective === 'client'
                ? ['client', 'customer'].includes(item.author_type)
                : item.author_type === 'support';
            return (
              <Fragment key={item.id}>
                {day !== previousDay && (
                  <div className="request-day">
                    <span>{day}</span>
                  </div>
                )}
                <article
                  className={`request-message ${outgoing ? 'request-message--outgoing' : ''}`}
                >
                  <div className="request-message__meta">
                    <span>
                      {item.author_label ||
                        (item.author_type === 'support'
                          ? 'Сервисная служба'
                          : 'Арендатор')}
                    </span>
                    <time
                      dateTime={date?.toISOString()}
                      title={operationDate(item.created_at)}
                    >
                      {date
                        ? new Intl.DateTimeFormat('ru-RU', {
                            timeZone: 'Europe/Moscow',
                            hour: '2-digit',
                            minute: '2-digit',
                          }).format(date)
                        : ''}
                    </time>
                  </div>
                  {(item.body || item.message_text) && (
                    <p className="request-message__body">
                      {item.body || item.message_text}
                    </p>
                  )}
                  {item.edited_at && (
                    <small className="text-[var(--muted)]">
                      {item.deleted
                        ? 'Удалён или скрыт в CRM'
                        : 'Изменён в CRM'}
                    </small>
                  )}
                  {item.attachments?.map((attachment) => (
                    <button
                      key={attachment.attachment_id}
                      type="button"
                      className="request-attachment"
                      aria-label={attachment.original_name}
                      onClick={() => onDownload(attachment)}
                    >
                      <FileText size={20} aria-hidden="true" />
                      <span>
                        <span className="request-attachment__name">
                          {attachment.original_name}
                        </span>
                        <span className="request-attachment__size">
                          {attachment.size >= 1048576
                            ? `${(attachment.size / 1048576).toFixed(1)} МБ`
                            : `${Math.max(1, Math.round(attachment.size / 1024))} КБ`}
                        </span>
                      </span>
                      <Download size={15} aria-hidden="true" />
                    </button>
                  ))}
                </article>
              </Fragment>
            );
          })}
        </div>
      </div>
      {hasNewMessages && (
        <button
          type="button"
          className="request-jump"
          onClick={() => {
            const panel = scrollRef.current;
            if (panel) panel.scrollTop = panel.scrollHeight;
            pinned.current = true;
            setHasNewMessages(false);
          }}
        >
          <ArrowDown size={14} />
          Новые сообщения
        </button>
      )}
    </div>
  );
}

export function RequestServiceOrder({
  order,
}: {
  order: OfficeService & { quantity: number; totalAmountMinor: number | null };
}) {
  return (
    <details className="request-order">
      <summary>
        <Package size={16} aria-hidden="true" />
        <span className="request-order__name">
          {order.name} · {order.quantity} {SERVICE_UNITS[order.unit]}
        </span>
        <span className="request-order__price">
          {order.totalAmountMinor == null
            ? 'Цена уточняется'
            : officeMoney(order.totalAmountMinor)}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <div>
        {order.conditions && <p>{order.conditions}</p>}
        <p className="text-xs text-[var(--muted)]">
          Условия на момент создания обращения
        </p>
      </div>
    </details>
  );
}

export function RequestChatPlaceholder({
  loading = false,
}: {
  loading?: boolean;
}) {
  return (
    <div className="request-placeholder" role={loading ? 'status' : undefined}>
      <span className="request-placeholder__icon">
        <MessageSquare size={28} />
      </span>
      <h2>{loading ? 'Загрузка переписки…' : 'Выберите обращение'}</h2>
      {!loading && (
        <p>
          Здесь появятся сообщения, сведения об офисе и история общения с
          сервисной службой.
        </p>
      )}
    </div>
  );
}
