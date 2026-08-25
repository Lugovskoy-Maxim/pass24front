'use client';

import { useRef, useState } from 'react';
import { Play, Terminal } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import {
  runV1ApiCycle,
  runV2ApiCycle,
  type ProbeStep,
} from '@/lib/api-console-runner';

type Tab = 'v2' | 'v1';

export default function ApiConsolePage() {
  const [tab, setTab] = useState<Tab>('v2');
  const [v1Steps, setV1Steps] = useState<ProbeStep[]>([]);
  const [v2Steps, setV2Steps] = useState<ProbeStep[]>([]);
  const [running, setRunning] = useState<Tab | null>(null);
  const [left, setLeft] = useState(280);
  const selected = useRef<ProbeStep | null>(null);
  const [, tick] = useState(0);
  const drag = useRef(false);

  const steps = tab === 'v2' ? v2Steps : v1Steps;
  const ok = steps.filter((s) => s.ok).length;
  const fail = steps.filter((s) => !s.ok).length;
  const active = selected.current;

  const run = async () => {
    selected.current = null;
    setRunning(tab);
    const push = (step: ProbeStep) => {
      const setter = tab === 'v2' ? setV2Steps : setV1Steps;
      setter((prev) => {
        const next = [...prev, step];
        selected.current = step;
        return next;
      });
    };
    try {
      if (tab === 'v2') {
        setV2Steps([]);
        await runV2ApiCycle(push);
      } else {
        setV1Steps([]);
        await runV1ApiCycle(push);
      }
    } finally {
      setRunning(null);
    }
  };

  return (
    <AdminLayout title="Прогон API">
      <p className="text-[var(--muted)] -mt-4 mb-4 text-sm">
        Только для администратора. Новые маршруты — 58 из контракта Mstyle v2.
        Короткоживущий токен для прогона выдаётся автоматически; приватные ключи
        не передаются в браузер. Старые — CRUD Pass (офисы, пользователи,
        пропуска).
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          className={`btn text-sm ${tab === 'v2' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => {
            setTab('v2');
            selected.current = v2Steps[v2Steps.length - 1] || null;
            tick((n) => n + 1);
          }}
        >
          Новые · Mstyle v2
        </button>
        <button
          type="button"
          className={`btn text-sm ${tab === 'v1' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => {
            setTab('v1');
            selected.current = v1Steps[v1Steps.length - 1] || null;
            tick((n) => n + 1);
          }}
        >
          Старые · Pass v1
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <button
          type="button"
          className="btn btn-primary"
          disabled={running !== null}
          onClick={() => void run()}
        >
          <Play className="w-4 h-4" />
          {running === tab
            ? 'Прогон…'
            : tab === 'v2'
              ? 'Прогон 58 маршрутов v2'
              : 'Прогон CRUD v1'}
        </button>
        <span className="text-sm text-[var(--muted)]">
          {steps.length ? (
            <>
              <span className="text-emerald-700">{ok} ок</span>
              {' / '}
              <span className="text-red-600">{fail} ошибка</span>
            </>
          ) : (
            'ожидание'
          )}
        </span>
      </div>

      <div
        className="flex border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--surface)]"
        style={{ height: 'calc(100vh - 260px)', minHeight: 360 }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const rect = e.currentTarget.getBoundingClientRect();
          setLeft(
            Math.min(Math.max(e.clientX - rect.left, 200), rect.width - 280),
          );
        }}
        onPointerUp={() => {
          drag.current = false;
        }}
        onPointerLeave={() => {
          drag.current = false;
        }}
      >
        <div className="overflow-auto" style={{ width: left }}>
          {steps.length === 0 ? (
            <div className="p-4 text-sm text-[var(--muted)]">
              {tab === 'v2'
                ? 'A-01…A-06, R, M, C, S, P, G — 58 маршрутов из эндпоинты.md.'
                : 'Конфиг, БЦ, офис, пользователь, пропуск: создать / изменить / удалить.'}
            </div>
          ) : (
            steps.map((step, i) => (
              <button
                key={`${step.ver}-${step.id}-${i}`}
                type="button"
                className={`w-full text-left px-3 py-2 text-sm border-b border-[var(--border)] ${
                  active === step ? 'bg-[var(--surface-muted)]' : ''
                }`}
                onClick={() => {
                  selected.current = step;
                  tick((n) => n + 1);
                }}
              >
                <span className="font-mono text-[10px] text-[var(--muted)] mr-2">
                  {step.ver}
                </span>
                <span className="font-medium">{step.id}</span>
                <span className="text-[var(--muted)]"> {step.title}</span>
                <span
                  className={`float-right font-mono text-xs ${
                    step.ok ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {step.status || 'ERR'}
                </span>
              </button>
            ))
          )}
        </div>
        <div
          className="w-1.5 cursor-col-resize bg-[var(--border)] hover:bg-[var(--primary)]"
          onPointerDown={(e) => {
            e.preventDefault();
            drag.current = true;
          }}
        />
        <div className="flex-1 min-w-0 overflow-auto p-4">
          {active && active.ver === (tab === 'v2' ? 'v2' : 'v1') ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="w-4 h-4 text-[var(--muted)]" />
                <span className="font-medium">
                  {active.ver} {active.id} · {active.title}
                </span>
                <span
                  className={`font-mono text-sm ${
                    active.ok ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {active.status} · {active.ms}ms
                </span>
              </div>
              <div className="text-xs font-mono text-[var(--muted)] mb-3 break-all">
                {active.method} {active.url}
              </div>
              <details className="mb-4 border border-[var(--border)] rounded-md">
                <summary className="cursor-pointer px-3 py-2 text-sm text-[var(--muted)] select-none">
                  Запрос
                  {active.request === undefined ? (
                    <span className="ml-2 text-xs">без тела</span>
                  ) : null}
                </summary>
                <pre className="text-xs font-mono whitespace-pre-wrap break-all px-3 pb-3">
                  {active.request === undefined
                    ? '—'
                    : typeof active.request === 'string'
                      ? active.request
                      : JSON.stringify(active.request, null, 2)}
                </pre>
              </details>
              <div className="text-sm text-[var(--muted)] mb-1">Ответ</div>
              <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                {typeof active.body === 'string'
                  ? active.body
                  : JSON.stringify(active.body, null, 2)}
              </pre>
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">Выберите шаг слева.</p>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
