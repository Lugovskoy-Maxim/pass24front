'use client';

import { CheckCircle, Clock, LogIn, XCircle } from 'lucide-react';
import { Pass, PassStatus } from '@/lib/api';
import { useConfig } from '@/hooks/useConfig';
import { getReceptionSectionStyle } from '@/lib/pass-status';
import { getUiLabels, UiLabels } from '@/lib/ui-labels';
import { PassCardBase } from './PassCardBase';

export function getReceptionSections(labels: UiLabels) {
  return [
    { key: 'approved' as PassStatus, title: labels.reception.sectionApproved, icon: Clock },
    { key: 'active' as PassStatus, title: labels.reception.sectionActive, icon: LogIn },
    { key: 'completed' as PassStatus, title: labels.reception.sectionCompleted, icon: CheckCircle, dimmed: true },
    { key: 'expired' as PassStatus, title: labels.reception.sectionExpired, icon: Clock, dimmed: true },
    { key: 'rejected' as PassStatus, title: labels.reception.sectionRejected, icon: XCircle, dimmed: true },
    { key: 'cancelled' as PassStatus, title: labels.reception.sectionCancelled, icon: XCircle, dimmed: true },
  ];
}

export const RECEPTION_SECTIONS = getReceptionSections(getUiLabels());

export function getReceptionSectionIconStyle(key: PassStatus | 'overdue') {
  return { color: getReceptionSectionStyle(key).iconColor };
}

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