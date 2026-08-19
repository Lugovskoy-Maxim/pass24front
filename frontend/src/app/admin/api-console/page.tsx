'use client';

import { useRef, useState } from 'react';
import { Play, Terminal } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { runFullApiCycle, type ProbeStep } from '@/lib/api-console-runner';

export default function ApiConsolePage() {
  const [steps, setSteps] = useState<ProbeStep[]>([]);
  const [running, setRunning] = useState(false);
  const [clientId, setClientId] = useState('mstyle-backend-staging');
  const [left, setLeft] = useState(280);
  const selected = useRef<ProbeStep | null>(null);
  const [, tick] = useState(0);
  const drag = useRef(false);

  const ok = steps.filter((s) => s.ok).length;
  const fail = steps.filter((s) => !s.ok).length;
  const active = selected.current;

  const run = async () => {
    setSteps([]);
    selected.current = null;
    setRunning(true);
    try {
      await runFullApiCycle(clientId.trim(), (step) => {
        setSteps((prev) => {
          const next = [...prev, step];
          selected.current = step;
          return next;
        });
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <AdminLayout title="Прогон API">
      <p className="text-[var(--muted)] -mt-4 mb-4 text-sm">
        Только для администратора. Одна кнопка: v1 CRUD <code>probe-*</code> и
        все 58 маршрутов Mstyle v2 из контракта.
      </p>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="text-sm">
          <span className="block text-xs text-[var(--muted)] mb-1">
            Client ID (v2)
          </span>
          <input
            className="input text-sm w-64"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={running}
          onClick={() => void run()}
        >
          <Play className="w-4 h-4" />
          {running ? 'Прогон…' : 'Полный цикл v1 + v2'}
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
        style={{ height: 'calc(100vh - 220px)', minHeight: 360 }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const rect = e.currentTarget.getBoundingClientRect();
          setLeft(Math.min(Math.max(e.clientX - rect.left, 200), rect.width - 280));
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
              Слева шаги, справа тело ответа. Полосу между колонками можно
              тянуть.
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
          {active ? (
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
