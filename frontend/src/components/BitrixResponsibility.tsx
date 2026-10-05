'use client';

import { useEffect, useState } from 'react';
import { SearchableSelect } from './SearchableSelect';
import { operations, Ticket, TicketDetail } from '@/lib/operations';
import { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';

function StaffPicker({
  value,
  onChange,
  currentName,
  disabled,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  currentName?: string;
  disabled?: boolean;
  label: string;
}) {
  const [staff, setStaff] = useState<
    Array<{ id: number; name: string; position: string }>
  >([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    operations
      .crmStaff()
      .then(({ items }) => {
        if (active) setStaff(items);
      })
      .catch((error) => {
        if (active)
          setError(
            getErrorMessage(
              error,
              'Не удалось загрузить сотрудников Bitrix24.',
            ),
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const options = staff.map((user) => ({
    value: String(user.id),
    label: user.name,
    searchText: `${user.name} ${user.position}`,
  }));
  if (value && !options.some((option) => option.value === value))
    options.unshift({
      value,
      label: currentName || `Сотрудник №${value}`,
      searchText: currentName || value,
    });
  return (
    <div className="min-w-0 flex-1">
      <SearchableSelect
        id={
          label === 'Ответственный по умолчанию'
            ? 'crm-default-staff'
            : 'crm-ticket-staff'
        }
        label={label}
        value={value}
        onChange={onChange}
        options={options}
        placeholder={
          loading ? 'Загрузка сотрудников…' : 'Выберите сотрудника Bitrix24'
        }
        searchPlaceholder="Поиск по имени или должности"
        emptyMessage="Сотрудники не найдены. Измените запрос."
        disabled={disabled || loading || !!error}
      />
      {error && (
        <p className="mt-1 text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function BitrixDefaultResponsibility() {
  const { user } = useAuth();
  const [saved, setSaved] = useState<{
    userId: number | null;
    name: string;
  } | null>(null);
  const [value, setValue] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  useEffect(() => {
    let active = true;
    operations
      .crmAssignmentSettings()
      .then((settings) => {
        if (active) {
          setSaved(settings);
          setValue(settings.userId ? String(settings.userId) : '');
        }
      })
      .catch((error) => {
        if (active) setError(getErrorMessage(error));
      });
    return () => {
      active = false;
    };
  }, []);
  const save = async () => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const settings = await operations.saveCrmAssignmentSettings(
        value ? Number(value) : null,
      );
      setSaved(settings);
      setSuccess('Ответственный по умолчанию сохранён.');
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
      aria-label="Ответственный за новые сервисные заявки"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <strong className="text-sm">Ответственный за новые заявки</strong>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {saved ? saved.name || 'Не выбран' : 'Загрузка…'}
          </p>
        </div>
        {hasPermission(user, 'admin.settings') && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Свернуть' : 'Настроить'}
          </button>
        )}
      </div>
      {expanded && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-[var(--muted)]">
            Выбранный сотрудник подставляется во все новые заявки и получает
            уведомление в Bitrix24. Ответственного отдельной заявки можно
            заменить.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <StaffPicker
              label="Ответственный по умолчанию"
              value={value}
              currentName={saved?.name}
              onChange={setValue}
              disabled={busy}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || !saved || value === String(saved.userId || '')}
              onClick={() => void save()}
            >
              {busy ? 'Сохранение…' : 'Сохранить ответственного'}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-[var(--danger)]">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="mt-2 text-xs text-[var(--muted)]">
          {success}
        </p>
      )}
    </section>
  );
}

export function BitrixTicketResponsibility({
  ticket,
  onSaved,
}: {
  ticket: Ticket;
  onSaved: (detail: TicketDetail) => void;
}) {
  const [value, setValue] = useState(String(ticket.crm?.assignee?.id || ''));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!editing) setValue(String(ticket.crm?.assignee?.id || ''));
  }, [ticket.crm?.assignee?.id, editing]);
  const save = async () => {
    if (!value) return;
    setBusy(true);
    setError('');
    try {
      onSaved(
        await operations.assignTicket(
          ticket.id,
          Number(value),
          ticket.revision,
        ),
      );
      setEditing(false);
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="border-b border-[var(--border)] px-4 py-3 text-xs"
      aria-label="Ответственный за заявку"
    >
      <div className="flex items-center justify-between gap-2">
        <span>
          <span className="text-[var(--muted)]">Ответственный: </span>
          <strong>{ticket.crm?.assignee?.name || 'Не назначен'}</strong>
        </span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setError('');
            setEditing(!editing);
          }}
          disabled={busy}
        >
          {editing ? 'Отмена' : 'Изменить ответственного'}
        </button>
      </div>
      {editing && (
        <div className="mt-2 flex flex-col sm:flex-row gap-2">
          <StaffPicker
            label="Ответственный за заявку"
            value={value}
            currentName={ticket.crm?.assignee?.name}
            onChange={setValue}
            disabled={busy}
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={
              busy || !value || value === String(ticket.crm?.assignee?.id || '')
            }
            onClick={() => void save()}
          >
            {busy ? 'Назначение…' : 'Назначить'}
          </button>
        </div>
      )}
      {ticket.crm?.assignmentPending && (
        <p role="status" className="mt-2 text-[var(--muted)]">
          Назначение сохранено в Pass, ожидает передачи в Bitrix24.
        </p>
      )}
      {(error || ticket.crm?.assignmentError) && (
        <p role="alert" className="mt-2 text-[var(--danger)]">
          {error || ticket.crm?.assignmentError}
        </p>
      )}
    </section>
  );
}
