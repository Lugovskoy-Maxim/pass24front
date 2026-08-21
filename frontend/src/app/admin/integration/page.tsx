'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { SettingsNav } from '@/components/SettingsNav';
import { PageError } from '@/components/PageError';
import { useToast } from '@/components/Toast';
import { api, getErrorMessage, IntegrationEndpoint } from '@/lib/api';

export default function IntegrationCatalogPage() {
  const { toast } = useToast();
  const [endpoints, setEndpoints] = useState<IntegrationEndpoint[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [meta, setMeta] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState('');
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState('');
  const [tab, setTab] = useState<'request' | 'success' | 'errors'>('request');
  const [mockResponsesEnabled, setMockResponsesEnabled] = useState(false);
  const [mockResponsesOverridden, setMockResponsesOverridden] = useState(false);
  const [mockModeBusy, setMockModeBusy] = useState(false);

  const load = () => {
    setError('');
    return api.admin
      .getIntegrationCatalog()
      .then((data) => {
        setEndpoints(data.endpoints);
        setGroups(data.meta.groups);
        setMeta(
          `${data.meta.title} · ${data.meta.count} маршрутов · schema ${data.meta.schemaVersion}`,
        );
        setMockResponsesEnabled(data.meta.mockResponsesEnabled);
        setMockResponsesOverridden(data.meta.mockResponsesOverridden);
        setActiveId((current) => current || data.endpoints[0]?.id || '');
      })
      .catch((err) => setError(getErrorMessage(err, 'Каталог не загрузился')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return endpoints.filter((item) => {
      if (group && item.group !== group) return false;
      if (!q) return true;
      return `${item.id} ${item.title} ${item.path} ${item.method}`
        .toLowerCase()
        .includes(q);
    });
  }, [endpoints, group, query]);

  const active = endpoints.find((item) => item.id === activeId) || filtered[0];

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast('Скопировано', 'success');
    } catch {
      toast('Не скопировалось', 'error');
    }
  };

  const toggleMockMode = async () => {
    const next = !mockResponsesEnabled;
    setMockModeBusy(true);
    try {
      const result = await api.admin.updateIntegrationMockMode(next);
      setMockResponsesEnabled(result.mockResponsesEnabled);
      setMockResponsesOverridden(true);
      toast(
        result.mockResponsesEnabled
          ? 'Mock/dev-режим включён'
          : 'Mock/dev-режим выключен',
        'success',
      );
    } catch (err) {
      toast(getErrorMessage(err, 'Не удалось изменить mock-режим'), 'error');
    } finally {
      setMockModeBusy(false);
    }
  };

  if (error) {
    return (
      <AdminLayout title="API Mstyle">
        <SettingsNav />
        <PageError message={error} onRetry={load} />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="API Mstyle">
      <SettingsNav />
      <p className="text-[var(--muted)] -mt-2 mb-6">
        {meta ||
          '58 маршрутов из эндпоинты.md. Путь password-verify как в коде, не password:verify.'}
      </p>
      <div className="card p-4 mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                mockResponsesEnabled ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
            />
            <span className="font-semibold">
              Mock/dev-ответы {mockResponsesEnabled ? 'включены' : 'выключены'}
            </span>
          </div>
          <p className="text-sm text-[var(--muted)] mt-1">
            {mockResponsesEnabled
              ? 'Закрытый API доступен, все маршруты Mstyle v2 возвращают предсказуемые данные из контракта; запись в рабочие коллекции не выполняется.'
              : 'Маршруты используют обычную реализацию и данные MongoDB.'}
            {!mockResponsesOverridden
              ? ' Сейчас используется значение по умолчанию для окружения.'
              : ''}
          </p>
        </div>
        <button
          type="button"
          className={`btn ${mockResponsesEnabled ? 'btn-secondary' : 'btn-primary'}`}
          disabled={mockModeBusy || loading}
          onClick={() => void toggleMockMode()}
        >
          {mockModeBusy
            ? 'Сохранение…'
            : mockResponsesEnabled
              ? 'Выключить mock'
              : 'Включить mock'}
        </button>
      </div>
      {loading ? (
        <div className="text-[var(--muted)]">Загрузка…</div>
      ) : (
        <div className="grid lg:grid-cols-[20rem_minmax(0,1fr)] gap-4">
          <aside className="card p-3 space-y-3 h-fit lg:sticky lg:top-20">
            <input
              className="input text-sm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="A-03, guests, subject…"
            />
            <select
              className="input text-sm"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            >
              <option value="">Все группы</option>
              {groups.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <ul className="max-h-[70vh] overflow-auto space-y-0.5">
              {filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveId(item.id);
                      setTab('request');
                    }}
                    className={`w-full text-left rounded px-2.5 py-2 text-sm ${
                      active?.id === item.id
                        ? 'bg-[var(--surface-muted)]'
                        : 'hover:bg-[var(--surface-muted)]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${methodClass(item.method)}`}
                      >
                        {item.method}
                      </span>
                      <span className="font-medium">{item.id}</span>
                      <span className="ml-auto text-[10px] text-[var(--muted)]">
                        {item.milestone}
                      </span>
                    </div>
                    <div className="text-xs text-[var(--muted)] mt-0.5 line-clamp-1">
                      {item.title}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {active && (
            <section className="card p-5 space-y-4 min-w-0">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`font-mono text-xs px-2 py-1 rounded ${methodClass(active.method)}`}
                  >
                    {active.method}
                  </span>
                  <h2 className="font-semibold">
                    {active.id} · {active.title}
                  </h2>
                  <span className="text-xs text-[var(--muted)]">
                    {active.milestone}
                  </span>
                </div>
                <div className="font-mono text-xs break-all mt-2 text-[var(--muted)]">
                  {active.path}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium mb-1">Заголовки</div>
                <CodeBlock
                  value={JSON.stringify(active.headers, null, 2)}
                  onCopy={copy}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <TabButton current={tab} id="request" onClick={setTab}>
                  Запрос
                </TabButton>
                <TabButton current={tab} id="success" onClick={setTab}>
                  Успех {active.success.status}
                </TabButton>
                <TabButton current={tab} id="errors" onClick={setTab}>
                  Ошибки ({active.errors.length})
                </TabButton>
                <button
                  type="button"
                  className="btn btn-secondary text-xs ml-auto"
                  onClick={() => copy(curlFor(active))}
                >
                  Копировать curl
                </button>
              </div>

              {tab === 'request' && (
                <CodeBlock
                  value={
                    active.requestForm ||
                    (active.request
                      ? JSON.stringify(active.request, null, 2)
                      : 'тело отсутствует')
                  }
                  onCopy={copy}
                />
              )}

              {tab === 'success' && (
                <div className="space-y-2">
                  <div className="text-xs text-[var(--muted)]">
                    {active.success.label}
                    {active.success.contentType
                      ? ` · ${active.success.contentType}`
                      : ''}
                  </div>
                  <CodeBlock
                    value={JSON.stringify(active.success.body, null, 2)}
                    onCopy={copy}
                  />
                </div>
              )}

              {tab === 'errors' && (
                <div className="space-y-4">
                  {active.errors.map((item) => (
                    <div key={item.label} className="space-y-1">
                      <div className="text-xs font-medium">{item.label}</div>
                      <CodeBlock
                        value={JSON.stringify(item.body, null, 2)}
                        onCopy={copy}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </AdminLayout>
  );
}

function TabButton({
  current,
  id,
  onClick,
  children,
}: {
  current: string;
  id: 'request' | 'success' | 'errors';
  onClick: (id: 'request' | 'success' | 'errors') => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`btn text-sm ${current === id ? 'btn-primary' : 'btn-secondary'}`}
      onClick={() => onClick(id)}
    >
      {children}
    </button>
  );
}

function CodeBlock({
  value,
  onCopy,
}: {
  value: string;
  onCopy: (value: string) => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        className="absolute right-2 top-2 btn btn-secondary text-[10px] py-1 px-2"
        onClick={() => onCopy(value)}
      >
        copy
      </button>
      <pre className="text-xs overflow-auto max-h-[28rem] bg-[var(--surface-muted)] p-3 rounded font-mono whitespace-pre-wrap break-all">
        {value}
      </pre>
    </div>
  );
}

function methodClass(method: string) {
  if (method === 'GET') return 'bg-emerald-50 text-emerald-800';
  if (method === 'POST') return 'bg-sky-50 text-sky-800';
  return 'bg-amber-50 text-amber-800';
}

function curlFor(item: IntegrationEndpoint) {
  const headers = Object.entries(item.headers)
    .map(([key, value]) => `  -H '${key}: ${value}'`)
    .join(' \\\n');
  const body = item.requestForm
    ? `  --data '${item.requestForm}'`
    : item.request
      ? `  --data-raw '${JSON.stringify(item.request)}'`
      : '';
  return [
    `curl -X ${item.method} 'https://pass.example${item.path}' \\`,
    headers,
    body,
  ]
    .filter(Boolean)
    .join(' \\\n');
}
