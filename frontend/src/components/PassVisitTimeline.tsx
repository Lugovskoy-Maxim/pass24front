'use client';

import { useEffect, useState } from 'react';
import {
  Ban,
  Check,
  Circle,
  Clock,
  LogIn,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { PassStatus, PassTimelineData } from '@/lib/api';

type StepState = 'done' | 'current' | 'upcoming' | 'failed' | 'skipped';

interface TimelineStep {
  key: string;
  label: string;
  sublabel?: string;
  state: StepState;
}

function formatTime(iso?: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(checkIn: string, checkOut?: string, now = Date.now()) {
  const start = new Date(checkIn).getTime();
  const end = checkOut ? new Date(checkOut).getTime() : now;
  const mins = Math.max(0, Math.floor((end - start) / 60000));
  if (mins < 1) return '< 1 мин';
  if (mins < 60) return `${mins} мин`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

function buildSteps(pass: PassTimelineData, now: number): TimelineStep[] {
  const fail = (label: string, sublabel?: string): TimelineStep[] => [
    { key: 'request', label: 'Заявка', state: 'done', sublabel: formatTime(pass.createdAt) || undefined },
    { key: 'approve', label, state: 'failed', sublabel },
    { key: 'entry', label: 'Вход', state: 'skipped' },
    { key: 'inside', label: 'В здании', state: 'skipped' },
    { key: 'exit', label: 'Выход', state: 'skipped' },
  ];

  if (pass.status === 'rejected') {
    return fail('Отклонён', pass.rejectionReason || 'Без причины');
  }
  if (pass.status === 'cancelled') {
    return fail('Отменён');
  }
  if (pass.status === 'expired') {
    return fail('Истёк');
  }

  const currentIndex: Record<PassStatus, number> = {
    pending: 1,
    approved: 2,
    active: 3,
    completed: 4,
    rejected: 1,
    cancelled: 0,
    expired: 1,
  };
  const current = currentIndex[pass.status] ?? 0;

  const stepState = (index: number): StepState => {
    if (pass.status === 'completed') return 'done';
    if (index < current) return 'done';
    if (index === current) return 'current';
    return 'upcoming';
  };

  const insideSublabel = pass.checkedInAt
    ? pass.status === 'active'
      ? formatDuration(pass.checkedInAt, undefined, now)
      : pass.checkedOutAt
        ? formatDuration(pass.checkedInAt, pass.checkedOutAt, now)
        : formatTime(pass.checkedInAt) || undefined
    : undefined;

  return [
    {
      key: 'request',
      label: 'Заявка',
      state: stepState(0),
      sublabel: formatTime(pass.createdAt) || undefined,
    },
    {
      key: 'approve',
      label: 'Одобрение',
      state: stepState(1),
      sublabel: pass.approvedAt
        ? formatTime(pass.approvedAt) || undefined
        : pass.status === 'pending'
          ? 'Ожидает'
          : undefined,
    },
    {
      key: 'entry',
      label: 'Вход',
      state: stepState(2),
      sublabel: pass.checkedInAt
        ? formatTime(pass.checkedInAt) || undefined
        : pass.status === 'approved'
          ? 'Ожидает'
          : undefined,
    },
    {
      key: 'inside',
      label: 'В здании',
      state: stepState(3),
      sublabel: insideSublabel,
    },
    {
      key: 'exit',
      label: 'Выход',
      state: stepState(4),
      sublabel: pass.checkedOutAt
        ? formatTime(pass.checkedOutAt) || undefined
        : pass.status === 'active'
          ? 'Ожидает'
          : undefined,
    },
  ];
}

const NODE_STYLES: Record<StepState, string> = {
  done: 'bg-emerald-500 text-white border-emerald-500',
  current: 'bg-[var(--primary)] text-white border-[var(--primary)] ring-4 ring-blue-100',
  upcoming: 'bg-white text-slate-300 border-slate-200',
  failed: 'bg-red-500 text-white border-red-500',
  skipped: 'bg-slate-100 text-slate-300 border-slate-200',
};

const LABEL_STYLES: Record<StepState, string> = {
  done: 'text-emerald-700 font-medium',
  current: 'text-[var(--primary)] font-semibold',
  upcoming: 'text-slate-400',
  failed: 'text-red-600 font-semibold',
  skipped: 'text-slate-300',
};

const LINE_STYLES: Record<StepState, string> = {
  done: 'bg-emerald-400',
  current: 'bg-gradient-to-r from-emerald-400 to-slate-200',
  upcoming: 'bg-slate-200',
  failed: 'bg-red-200',
  skipped: 'bg-slate-100',
};

function NodeIcon({ step }: { step: TimelineStep }) {
  const cls = 'w-3.5 h-3.5';
  if (step.state === 'failed') return <Ban className={cls} />;
  if (step.state === 'done') return <Check className={cls} strokeWidth={3} />;
  if (step.state === 'current') {
    if (step.key === 'approve') return <ShieldCheck className="w-4 h-4" />;
    if (step.key === 'entry') return <LogIn className="w-4 h-4" />;
    if (step.key === 'inside') return <Clock className="w-4 h-4" />;
    if (step.key === 'exit') return <LogOut className="w-4 h-4" />;
    return <Circle className={`${cls} fill-current`} />;
  }
  return <Circle className={cls} />;
}

export function PassVisitTimeline({ pass }: { pass: PassTimelineData }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (pass.status !== 'active' || !pass.checkedInAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [pass.status, pass.checkedInAt]);

  const steps = buildSteps(pass, now);

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-1">
        {steps.map((step, index) => {
          const prevState = index > 0 ? steps[index - 1].state : null;
          const lineState: StepState =
            step.state === 'failed' || prevState === 'failed'
              ? 'failed'
              : step.state === 'done'
                ? 'done'
                : step.state === 'current'
                  ? 'current'
                  : 'upcoming';

          return (
            <div key={step.key} className="flex-1 min-w-0 flex flex-col items-center relative">
              {index > 0 && (
                <div
                  className={`absolute top-4 right-1/2 w-full h-0.5 -z-0 ${LINE_STYLES[lineState]}`}
                  aria-hidden
                />
              )}

              <div
                className={[
                  'relative z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                  NODE_STYLES[step.state],
                  step.state === 'current' ? 'scale-110' : '',
                ].join(' ')}
              >
                <NodeIcon step={step} />
              </div>

              <p className={`text-[11px] sm:text-xs mt-2 text-center leading-tight ${LABEL_STYLES[step.state]}`}>
                {step.label}
              </p>
              {step.sublabel && (
                <p className={`text-[10px] mt-0.5 text-center leading-tight truncate max-w-full px-0.5 ${
                  step.state === 'current' ? 'text-[var(--primary)] font-medium' : 'text-[var(--muted)]'
                }`}>
                  {step.sublabel}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}