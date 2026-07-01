'use client';

import { useEffect, useState } from 'react';
import {
  Ban,
  Check,
  Circle,
  Clock,
  LogIn,
  LogOut,
} from 'lucide-react';
import { PassStatus, PassTimelineData } from '@/lib/api';
import { getPassTimelineCurrentClasses } from '@/lib/pass-status';
import { mergeUiLabels, UiLabels } from '@/lib/ui-labels';

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

function buildSteps(pass: PassTimelineData, now: number, t: UiLabels['timeline']): TimelineStep[] {
  const fail = (label: string, sublabel?: string): TimelineStep[] => [
    { key: 'request', label: t.request, state: 'done', sublabel: formatTime(pass.createdAt) || undefined },
    { key: 'entry', label, state: 'failed', sublabel },
    { key: 'inside', label: t.inside, state: 'skipped' },
    { key: 'exit', label: t.exit, state: 'skipped' },
  ];

  if (pass.status === 'rejected') {
    return fail(t.rejected, pass.rejectionReason || 'Без причины');
  }
  if (pass.status === 'cancelled') {
    return fail(t.cancelled);
  }
  if (pass.status === 'expired') {
    return fail(t.expired);
  }

  const currentIndex: Record<PassStatus, number> = {
    pending: 1,
    approved: 1,
    active: 2,
    completed: 3,
    rejected: 0,
    cancelled: 0,
    expired: 0,
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
      label: t.request,
      state: stepState(0),
      sublabel: formatTime(pass.createdAt) || undefined,
    },
    {
      key: 'entry',
      label: t.entry,
      state: stepState(1),
      sublabel: pass.checkedInAt
        ? formatTime(pass.checkedInAt) || undefined
        : pass.status === 'approved' || pass.status === 'pending'
          ? t.waiting
          : undefined,
    },
    {
      key: 'inside',
      label: t.inside,
      state: stepState(2),
      sublabel: insideSublabel,
    },
    {
      key: 'exit',
      label: t.exit,
      state: stepState(3),
      sublabel: pass.checkedOutAt
        ? formatTime(pass.checkedOutAt) || undefined
        : pass.status === 'active'
          ? t.waiting
          : undefined,
    },
  ];
}

const NODE_STYLES: Record<Exclude<StepState, 'current'>, string> = {
  done: 'bg-[var(--status-active)] text-white border-[var(--status-active)]',
  upcoming: 'bg-[var(--surface-elevated)] text-[var(--border-strong)] border-[var(--border)]',
  failed: 'bg-[var(--status-rejected)] text-white border-[var(--status-rejected)]',
  skipped: 'bg-[var(--surface-muted)] text-[var(--border-strong)] border-[var(--border)]',
};

const LABEL_STYLES: Record<Exclude<StepState, 'current'>, string> = {
  done: 'text-[var(--status-active)] font-medium',
  upcoming: 'text-[var(--muted)]',
  failed: 'text-[var(--status-rejected)] font-semibold',
  skipped: 'text-[var(--border-strong)]',
};

const LINE_STYLES: Record<Exclude<StepState, 'current'>, string> = {
  done: 'bg-[var(--status-active)]',
  upcoming: 'bg-[var(--border)]',
  failed: 'bg-[var(--status-rejected-soft)]',
  skipped: 'bg-[var(--surface-muted)]',
};

function NodeIcon({ step }: { step: TimelineStep }) {
  const cls = 'w-3.5 h-3.5';
  if (step.state === 'failed') return <Ban className={cls} />;
  if (step.state === 'done') return <Check className={cls} strokeWidth={3} />;
  if (step.state === 'current') {
    if (step.key === 'entry') return <LogIn className="w-4 h-4" />;
    if (step.key === 'inside') return <Clock className="w-4 h-4" />;
    if (step.key === 'exit') return <LogOut className="w-4 h-4" />;
    return <Circle className={`${cls} fill-current`} />;
  }
  return <Circle className={cls} />;
}

export function PassVisitTimeline({
  pass,
  labels,
  compact,
  overdue = false,
}: {
  pass: PassTimelineData;
  labels?: UiLabels;
  compact?: boolean;
  overdue?: boolean;
}) {
  const L = labels || mergeUiLabels();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (pass.status !== 'active' || !pass.checkedInAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [pass.status, pass.checkedInAt]);

  const steps = buildSteps(pass, now, L.timeline);
  const currentStyles = getPassTimelineCurrentClasses(pass.status, overdue);
  const nodeSize = compact ? 'w-6 h-6' : 'w-8 h-8';
  const topOffset = compact ? 'top-3' : 'top-4';

  return (
    <div className="w-full min-w-[240px]">
      <div className="flex items-start justify-between gap-0.5 sm:gap-1">
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
                  className={`absolute ${topOffset} right-1/2 w-full h-0.5 -z-0 ${
                    lineState === 'current' ? currentStyles.line : LINE_STYLES[lineState]
                  }`}
                  aria-hidden
                />
              )}

              <div
                className={[
                  `relative z-10 ${nodeSize} rounded-full border-2 flex items-center justify-center shrink-0 transition-all`,
                  step.state === 'current' ? currentStyles.node : NODE_STYLES[step.state],
                  step.state === 'current' ? 'scale-110' : '',
                ].join(' ')}
              >
                <NodeIcon step={step} />
              </div>

              <p
                className={`text-[11px] sm:text-xs mt-2 text-center leading-tight truncate max-w-full px-0.5 ${
                  step.state === 'current' ? currentStyles.label : LABEL_STYLES[step.state]
                }`}
                title={step.label}
              >
                {step.label}
              </p>
              {step.sublabel && (
                <p className={`text-[10px] mt-0.5 text-center leading-tight truncate max-w-full px-0.5 ${
                  step.state === 'current' ? currentStyles.sublabel : 'text-[var(--muted)]'
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