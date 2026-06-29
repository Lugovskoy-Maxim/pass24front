'use client';

import { AlertCircle, CheckCircle, Clock, LogIn, XCircle } from 'lucide-react';
import { Pass, PassStatus } from '@/lib/api';
import { useConfig } from '@/hooks/useConfig';
import { getUiLabels, UiLabels } from '@/lib/ui-labels';
import { PassCardBase } from './PassCardBase';

export function getReceptionSections(labels: UiLabels) {
  return [
    { key: 'pending' as PassStatus, title: labels.reception.sectionPending, icon: AlertCircle, iconClass: 'text-amber-600' },
    { key: 'approved' as PassStatus, title: labels.reception.sectionApproved, icon: Clock, iconClass: 'text-[var(--accent)]' },
    { key: 'active' as PassStatus, title: labels.reception.sectionActive, icon: LogIn, iconClass: 'text-emerald-600' },
    { key: 'completed' as PassStatus, title: labels.reception.sectionCompleted, icon: CheckCircle, iconClass: 'text-[var(--muted)]', dimmed: true },
    { key: 'expired' as PassStatus, title: labels.reception.sectionExpired, icon: Clock, iconClass: 'text-[var(--muted)]', dimmed: true },
    { key: 'rejected' as PassStatus, title: labels.reception.sectionRejected, icon: XCircle, iconClass: 'text-red-500', dimmed: true },
    { key: 'cancelled' as PassStatus, title: labels.reception.sectionCancelled, icon: XCircle, iconClass: 'text-[var(--muted)]', dimmed: true },
  ];
}

export const RECEPTION_SECTIONS = getReceptionSections(getUiLabels());

interface ReceptionPassCardProps {
  pass: Pass;
  actions?: React.ReactNode;
  highlight?: boolean;
  dimmed?: boolean;
}

export function ReceptionPassCard({ pass, actions, highlight, dimmed }: ReceptionPassCardProps) {
  const config = useConfig();
  const labels = getUiLabels(config);

  return (
    <PassCardBase
      pass={pass}
      labels={labels}
      variant="full"
      showTimeline
      showQrLink
      highlight={highlight}
      dimmed={dimmed}
      actions={actions}
    />
  );
}