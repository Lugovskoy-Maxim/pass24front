'use client';

import { Search, Users, X } from 'lucide-react';
import { useState } from 'react';
import type { AdminUser } from '@/lib/api';
import { matchesSearch } from '@/lib/search';

export function TenantAssignmentPicker({
  tenants,
  selectedIds,
  query,
  onQueryChange,
  onToggle,
  onClear,
  disabled = false,
  idPrefix,
  assignedNames = {},
}: {
  tenants: AdminUser[];
  selectedIds: string[];
  query: string;
  onQueryChange: (query: string) => void;
  onToggle: (id: string) => void;
  onClear: () => void;
  disabled?: boolean;
  idPrefix: string;
  assignedNames?: Record<string, string>;
}) {
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const eligible = tenants.filter(
    (tenant) => tenant.isActive || selectedIds.includes(tenant.id),
  );
  const matching = eligible.filter(
    (tenant) =>
      (scope === 'all' || selectedIds.includes(tenant.id)) &&
      matchesSearch(
        `${tenant.fullName} ${tenant.company || ''} ${tenant.email || ''} ${tenant.phone || ''} ${(tenant.phone || '').replace(/\D/g, '')}`,
        query,
      ),
  );
  return (
    <div className="tenant-picker">
      {selectedIds.length > 0 && (
        <div
          className="tenant-picker__selection"
          aria-label="Выбранные арендаторы"
        >
          <div className="tenant-picker__selection-heading">
            <span>Выбрано: {selectedIds.length}</span>
            <button type="button" disabled={disabled} onClick={onClear}>
              Снять всех
            </button>
          </div>
          <ul>
            {selectedIds.map((id) => {
              const name =
                tenants.find((tenant) => tenant.id === id)?.fullName ||
                assignedNames[id] ||
                'Недоступный арендатор';
              return (
                <li key={id}>
                  <span title={name}>{name}</span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onToggle(id)}
                    aria-label={`Снять арендатора: ${name}`}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div
        className="tenant-picker__filters"
        role="group"
        aria-label="Показать арендаторов"
      >
        <button
          type="button"
          disabled={disabled}
          aria-pressed={scope === 'all'}
          onClick={() => setScope('all')}
        >
          Все · {eligible.length}
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={scope === 'selected'}
          onClick={() => setScope('selected')}
        >
          Выбраны · {selectedIds.length}
        </button>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-search`} className="label">
          Поиск арендатора
        </label>
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]"
            aria-hidden="true"
          />
          <input
            id={`${idPrefix}-search`}
            className="input input--icon-left"
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            disabled={disabled}
            placeholder="ФИО, компания, email или телефон"
            aria-controls={`${idPrefix}-options`}
          />
        </div>
      </div>
      <p className="tenant-picker__result" role="status" aria-live="polite">
        Найдено: {matching.length}. Поиск сохраняет выбранных арендаторов.
      </p>
      <div
        id={`${idPrefix}-options`}
        className="tenant-picker__options"
        role="group"
        aria-label="Арендаторы для назначения"
      >
        {matching.length ? (
          matching.map((tenant) => {
            const checked = selectedIds.includes(tenant.id);
            return (
              <label
                key={tenant.id}
                className={`tenant-picker__option ${checked ? 'is-selected' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onToggle(tenant.id)}
                />
                <span>
                  <strong>{tenant.fullName}</strong>
                  {tenant.company && <span>{tenant.company}</span>}
                  <small>
                    {[tenant.email, tenant.phone].filter(Boolean).join(' · ')}
                  </small>
                  <span className="tenant-picker__meta">
                    <Users size={12} aria-hidden="true" />
                    {!tenant.isActive
                      ? 'Неактивен · назначение сохранено'
                      : tenant.offices?.length
                        ? `Офисов: ${tenant.offices.length}`
                        : 'Без назначенных офисов'}
                  </span>
                </span>
                {checked && (
                  <span className="tenant-picker__checked">Выбран</span>
                )}
              </label>
            );
          })
        ) : (
          <div className="tenant-picker__empty">
            <Search size={20} aria-hidden="true" />
            <strong>
              {eligible.length === 0
                ? 'Нет активных арендаторов'
                : scope === 'selected' && !selectedIds.length
                  ? 'Арендаторы пока не выбраны'
                  : 'Арендаторы не найдены'}
            </strong>
            <span>
              {query
                ? 'Измените запрос или очистите поиск.'
                : 'Выберите арендаторов из списка «Все».'}
            </span>
            {query && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onQueryChange('')}
              >
                Очистить поиск
              </button>
            )}
          </div>
        )}
      </div>
      <p
        className={`tenant-picker__hint ${selectedIds.length > 1 ? 'theme-alert' : ''}`}
      >
        {selectedIds.length > 1
          ? 'В офисе несколько арендаторов. Каждый получит доступ к заказу пропусков в этот офис.'
          : 'Можно выбрать несколько арендаторов. Назначения изменятся после сохранения.'}
      </p>
    </div>
  );
}
