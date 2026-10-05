'use client';

import { useEffect, useRef, useState } from 'react';
import { request, getErrorMessage } from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';

type Company = { id: number; name: string };
export function TenantBitrixCompany({ userId }: { userId: string }) {
  const [saved, setSaved] = useState<Company | null>(null);
  const [selected, setSelected] = useState<Company | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const search = useDebounce(query);
  const [items, setItems] = useState<Company[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const searchVersion = useRef(0);
  const url = `/admin/users/${encodeURIComponent(userId)}/bitrix-company`;
  useEffect(() => {
    let active = true;
    request<{ company: Company | null }>(url)
      .then(({ company }) => {
        if (active) {
          setSaved(company);
          setSelected(company);
        }
      })
      .catch((error) => {
        if (active) setError(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [url]);
  useEffect(() => {
    if (!expanded) return;
    let active = true;
    const version = ++searchVersion.current;
    setSearching(true);
    setError('');
    request<{ items: Company[]; next: number | null }>(
      `/admin/bitrix/companies?search=${encodeURIComponent(search)}`,
    )
      .then((result) => {
        if (active) {
          setItems(result.items);
          setNext(result.next);
        }
      })
      .catch((error) => {
        if (active)
          setError(
            getErrorMessage(error, 'Не удалось загрузить компании Bitrix24.'),
          );
      })
      .finally(() => {
        if (active) setSearching(false);
      });
    return () => {
      active = false;
      if (searchVersion.current === version) searchVersion.current += 1;
    };
  }, [search, expanded]);
  const more = async () => {
    if (next == null || searching || pageLoading || query !== search) return;
    const version = searchVersion.current;
    setPageLoading(true);
    setError('');
    try {
      const result = await request<{ items: Company[]; next: number | null }>(
        `/admin/bitrix/companies?search=${encodeURIComponent(search)}&start=${next}`,
      );
      if (searchVersion.current !== version) return;
      setItems((items) => [
        ...items,
        ...result.items.filter(
          (item) => !items.some((existing) => existing.id === item.id),
        ),
      ]);
      setNext(result.next);
    } catch (error) {
      if (searchVersion.current === version) setError(getErrorMessage(error));
    } finally {
      setPageLoading(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await request<{ company: Company | null }>(url, {
        method: 'PATCH',
        body: JSON.stringify({ companyId: selected?.id || null }),
      });
      setSaved(result.company);
      setSelected(result.company);
      setSuccess(
        result.company
          ? 'Связь с компанией сохранена.'
          : 'Связь с компанией снята.',
      );
      setExpanded(false);
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="sm:col-span-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 space-y-3"
      aria-label="Компания арендатора в Bitrix24"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Компания в Bitrix24</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {loading ? 'Загрузка…' : saved?.name || 'Нет выбранной компании'}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={loading || busy}
          onClick={() => {
            setExpanded(!expanded);
            setSelected(saved);
          }}
        >
          {expanded
            ? 'Отмена'
            : saved
              ? 'Изменить связь'
              : 'Связать с компанией'}
        </button>
      </div>
      {expanded && (
        <>
          <p className="text-xs text-[var(--muted)]">
            Выберите существующую компанию CRM. Сервисные заявки этого
            арендатора и его сотрудников будут связаны с ней. Связь сохраняется
            отдельно от остальных полей пользователя.
          </p>
          <label className="label" htmlFor="crm-company-search">
            Поиск компании в CRM
          </label>
          <input
            id="crm-company-search"
            className="input"
            type="search"
            placeholder="Название компании"
            value={query}
            onChange={(event) => {
              searchVersion.current += 1;
              setQuery(event.target.value);
            }}
          />
          <div
            className="max-h-52 overflow-y-auto rounded-lg border border-[var(--border)]"
            role="radiogroup"
            aria-label="Компании Bitrix24"
          >
            <label className="flex items-center gap-2 p-3 border-b border-[var(--border)] text-sm">
              <input
                type="radio"
                name="crm-company"
                checked={!selected}
                onChange={() => setSelected(null)}
              />
              Без привязки
            </label>
            {items.map((company) => (
              <label
                key={company.id}
                className="flex items-center gap-2 p-3 border-b last:border-b-0 border-[var(--border)] text-sm cursor-pointer hover:bg-[var(--surface)]"
              >
                <input
                  type="radio"
                  name="crm-company"
                  checked={selected?.id === company.id}
                  disabled={searching || query !== search}
                  onChange={() => setSelected(company)}
                />
                <span>
                  {company.name}
                  <span className="ml-2 text-xs text-[var(--muted)]">
                    №{company.id}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-[var(--muted)]" role="status">
            {searching || query !== search || pageLoading
              ? 'Поиск…'
              : items.length
                ? `Найдено: ${items.length}${next != null ? ' · есть ещё компании' : ''}`
                : 'Компании не найдены.'}
          </p>
          {next != null && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={searching || pageLoading || query !== search}
              onClick={() => void more()}
            >
              Показать ещё
            </button>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs">
              Выбрано: <strong>{selected?.name || 'Без привязки'}</strong>
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || (selected?.id || null) === (saved?.id || null)}
              onClick={() => void save()}
            >
              {busy ? 'Сохранение…' : 'Сохранить связь'}
            </button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-xs text-[var(--danger)]">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="text-xs text-[var(--muted)]">
          {success}
        </p>
      )}
    </section>
  );
}
