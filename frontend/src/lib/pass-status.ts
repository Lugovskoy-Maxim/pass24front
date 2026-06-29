import { PassStatus } from './api';

export type PassStatusVisualKey = PassStatus | 'overdue';

export function getPassStatusVisualKey(status: PassStatus, overdue = false): PassStatusVisualKey {
  if (overdue && status === 'active') return 'overdue';
  return status;
}

export function getPassStatusStripeClass(status: PassStatus, overdue = false): string {
  return `pass-stripe pass-stripe--${getPassStatusVisualKey(status, overdue)}`;
}

export function getPassStatusBadgeClass(status: PassStatus, overdue = false): string {
  return `pass-badge pass-badge--${getPassStatusVisualKey(status, overdue)}`;
}

export function getPassIconTileClass(status: PassStatus, overdue = false): string {
  return `pass-icon-tile pass-icon-tile--${getPassStatusVisualKey(status, overdue)}`;
}

export function getPassStatusRingVar(status: PassStatus, overdue = false): string {
  const key = getPassStatusVisualKey(status, overdue);
  return `var(--status-${key}-ring)`;
}

export function getPassStatusColorVar(status: PassStatus | 'overdue'): string {
  return `var(--status-${status})`;
}

export function getReceptionSectionStyle(key: PassStatus | 'overdue' | 'total'): {
  iconColor: string;
  stripColor: string;
} {
  if (key === 'total') {
    return { iconColor: 'var(--text)', stripColor: 'var(--border-strong)' };
  }
  const statusKey = key === 'overdue' ? 'overdue' : key;
  return {
    iconColor: `var(--status-${statusKey})`,
    stripColor: `var(--status-${statusKey})`,
  };
}

export function getAccentStatClass(key: PassStatus | 'overdue' | 'total'): string {
  return `accent-stat accent-stat--${key}`;
}

export function getSectionHeadingClass(key: PassStatus | 'overdue'): string {
  return `section-heading section-heading--${key === 'overdue' ? 'overdue' : key}`;
}

export function getPassStatusTopStripeClass(status: PassStatus, overdue = false): string {
  return `pass-stripe-top pass-stripe-top--${getPassStatusVisualKey(status, overdue)}`;
}

export function getPassTimelineCurrentClasses(status: PassStatus, overdue = false): {
  node: string;
  label: string;
  sublabel: string;
  line: string;
} {
  const key = getPassStatusVisualKey(status, overdue);
  return {
    node: `bg-[var(--status-${key})] text-white border-[var(--status-${key})] ring-4 ring-[var(--status-${key}-ring)]`,
    label: `text-[var(--status-${key})] font-semibold`,
    sublabel: `text-[var(--status-${key})] font-medium`,
    line: `bg-gradient-to-r from-[var(--status-active)] to-[var(--status-${key})]`,
  };
}

export function getPassCardShellClass(options?: {
  interactive?: boolean;
  selected?: boolean;
  overdue?: boolean;
  status?: PassStatus;
  dimmed?: boolean;
}): string {
  const parts = ['pass-card'];
  if (options?.interactive) parts.push('pass-card--interactive');
  if (options?.selected && options.status) {
    parts.push('pass-card--selected');
    parts.push(`pass-card--selected-${getPassStatusVisualKey(options.status, options.overdue)}`);
  }
  if (options?.overdue) parts.push('pass-card--overdue');
  if (options?.dimmed) parts.push('opacity-85');
  return parts.join(' ');
}