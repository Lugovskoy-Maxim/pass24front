'use client';

import { useId, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  SearchX,
  SlidersHorizontal,
} from 'lucide-react';

export function OperationsFilters({
  kind,
  search,
  activeCount,
  children,
}: {
  kind: 'bookings' | 'support';
  search: ReactNode;
  activeCount: number;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return (
    <div
      className={`operations-filters operations-filters--${kind}`}
      data-expanded={expanded}
    >
      {search}
      <button
        type="button"
        className="operations-filter-toggle"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded((current) => !current)}
      >
        <SlidersHorizontal size={15} aria-hidden="true" />
        Фильтры{activeCount > 0 && <span>{activeCount}</span>}
      </button>
      <div className="operations-filters__extra" id={id}>
        {children}
      </div>
    </div>
  );
}

export function OperationsQueueTabs({
  label,
  items,
  active,
  onChange,
}: {
  label: string;
  items: Array<{ value: string; label: string; count?: number }>;
  active: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="operations-queues" role="group" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          className="operations-queue"
          aria-pressed={active === item.value}
          onClick={() => onChange(item.value)}
        >
          {item.label}
          {item.count !== undefined && <span>{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function OperationsFilter({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="operations-filter">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function OperationsEmptyState({
  title,
  description,
  onReset,
}: {
  title: string;
  description: string;
  onReset?: () => void;
}) {
  return (
    <div className="operations-empty">
      <span className="operations-empty__icon">
        <SearchX size={24} aria-hidden="true" />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {onReset && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onReset}
        >
          Сбросить фильтры
        </button>
      )}
    </div>
  );
}

export function OperationsPagination({
  page,
  total,
  perPage,
  onChange,
}: {
  page: number;
  total: number;
  perPage: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  return (
    <nav className="operations-pagination" aria-label="Страницы заявок">
      <span className="operations-pagination__range">
        {total
          ? `${(page - 1) * perPage + 1}–${Math.min(page * perPage, total)} из ${total}`
          : '0 заявок'}
      </span>
      <div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ArrowLeft size={14} aria-hidden="true" />
          <span>Назад</span>
        </button>
        <span>
          {page} / {pages}
        </span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          <span>Далее</span>
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
