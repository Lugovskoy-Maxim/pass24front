'use client';

import { CheckCircle, Clock, LogIn, XCircle } from 'lucide-react';
import { PassStatus } from '@/lib/api';
import { UiLabels } from '@/lib/ui-labels';

export function getReceptionSections(labels: UiLabels) {
  return [
    {
      key: 'approved' as PassStatus,
      title: labels.reception.sectionApproved,
      icon: Clock,
    },
    {
      key: 'active' as PassStatus,
      title: labels.reception.sectionActive,
      icon: LogIn,
    },
    {
      key: 'completed' as PassStatus,
      title: labels.reception.sectionCompleted,
      icon: CheckCircle,
      dimmed: true,
    },
    {
      key: 'expired' as PassStatus,
      title: labels.reception.sectionExpired,
      icon: Clock,
      dimmed: true,
    },
    {
      key: 'rejected' as PassStatus,
      title: labels.reception.sectionRejected,
      icon: XCircle,
      dimmed: true,
    },
    {
      key: 'cancelled' as PassStatus,
      title: labels.reception.sectionCancelled,
      icon: XCircle,
      dimmed: true,
    },
  ];
}
