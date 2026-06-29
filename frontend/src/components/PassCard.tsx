'use client';

import { Pass } from '@/lib/api';
import { useConfig } from '@/hooks/useConfig';
import { getUiLabels } from '@/lib/ui-labels';
import { PassCardBase } from './PassCardBase';

interface PassCardProps {
  pass: Pass;
  actions?: React.ReactNode;
  onClick?: () => void;
  showCreator?: boolean;
  highlight?: boolean;
}

export function PassCard({ pass, actions, onClick, showCreator, highlight }: PassCardProps) {
  const config = useConfig();
  const labels = getUiLabels(config);

  return (
    <PassCardBase
      pass={pass}
      labels={labels}
      variant="compact"
      showCreator={showCreator}
      showTimeline
      highlight={highlight}
      onClick={onClick}
      actions={actions}
    />
  );
}