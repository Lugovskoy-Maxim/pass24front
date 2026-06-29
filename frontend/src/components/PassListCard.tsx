'use client';

import Link from 'next/link';
import {
  Building2,
  Car,
  ChevronRight,
  Clock,
  MapPin,
  Package,
  Phone,
  User,
  Wrench,
} from 'lucide-react';
import { Pass, PassType, TYPE_LABELS } from '@/lib/api';
import {
  getGuestOverdueKind,
  getOverdueBadgeLabel,
  getPassCardBorderClass,
  getUiLabels,
  isGuestStillInside,
  UiLabels,
} from '@/lib/ui-labels';
import { useConfig } from '@/hooks/useConfig';
import { StatusBadge } from './StatusBadge';

const TYPE_ICONS: Record<PassType, typeof User> = {
  visitor: User,
  parking: Car,
  delivery: Package,
  contractor: Wrench,
};

interface PassListCardProps {
  pass: Pass;
  labels?: UiLabels;
  selected?: boolean;
  showCreator?: boolean;
  href?: string;
  onClick?: () => void;
}

export function PassListCard({ pass, labels: labelsProp, selected, showCreator, href, onClick }: PassListCardProps) {
  const config = useConfig();
  const labels = labelsProp || getUiLabels(config);
  const Icon = TYPE_ICONS[pass.passType as PassType] || User;
  const overdueKind = getGuestOverdueKind(pass);
  const stillInside = overdueKind !== null;
  const visitWindow = pass.visitTimeFrom
    ? `${pass.visitTimeFrom}${pass.visitTimeTo ? `–${pass.visitTimeTo}` : ''}`
    : null;

  const meta: string[] = [
    pass.visitDate,
    TYPE_LABELS[pass.passType as PassType],
  ].filter(Boolean);

  const className = [
    'w-full text-left rounded-lg border bg-white transition-all block',
    'hover:shadow-md hover:border-[var(--accent)]',
    selected ? 'ring-2 ring-[var(--primary)] ring-offset-1 border-[var(--primary)] shadow-sm' : 'border-[var(--border)]',
    stillInside ? 'border-amber-300 bg-amber-50/30' : getPassCardBorderClass(pass.status, stillInside),
  ].filter(Boolean).join(' ');

  const inner = (
    <div className="flex items-stretch gap-0 min-h-[4.5rem]">
      <div
        className={[
          'w-1 shrink-0 rounded-l-lg',
          pass.status === 'active' ? 'bg-emerald-500' : '',
          pass.status === 'pending' ? 'bg-amber-400' : '',
          pass.status === 'approved' ? 'bg-[var(--accent)]' : '',
          pass.status === 'rejected' ? 'bg-red-500' : '',
          ['completed', 'expired', 'cancelled'].includes(pass.status) ? 'bg-[var(--muted)]' : '',
          stillInside ? 'bg-amber-500' : '',
        ].filter(Boolean).join(' ') || 'bg-[var(--border)]'}
      />

      <div className="flex-1 min-w-0 px-3 py-2.5 flex items-start gap-2">
        <div className="w-8 h-8 rounded surface-muted border border-[var(--border)] flex items-center justify-center shrink-0 mt-0.5">
          <Icon className="w-4 h-4 text-[var(--primary)]" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap pr-1">
            <span className="font-semibold text-sm leading-tight truncate max-w-[12rem] sm:max-w-none">
              {pass.visitorName}
            </span>
            <StatusBadge status={pass.status} labels={labels} />
                {overdueKind && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 font-medium">
                    {getOverdueBadgeLabel(overdueKind, labels)}
                  </span>
                )}
          </div>

          <div className="font-mono text-xs text-[var(--primary)] font-semibold mt-0.5">{pass.passNumber}</div>

          <p className="mt-1 text-[11px] text-[var(--muted)] leading-snug">
            {meta.join(' · ')}
            {visitWindow && (
              <>
                {' · '}
                <Clock className="w-3 h-3 inline -mt-px" />
                {' '}
                {visitWindow}
              </>
            )}
          </p>

          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-[var(--muted)]">
            {pass.companyName && (
              <span className="inline-flex items-center gap-1 truncate max-w-[10rem]">
                <Building2 className="w-3 h-3 shrink-0" />
                {pass.companyName}
              </span>
            )}
            {pass.businessCenterName && (
              <span className="inline-flex items-center gap-1 truncate max-w-[8rem]">
                <MapPin className="w-3 h-3 shrink-0" />
                {pass.businessCenterName}
              </span>
            )}
            {pass.visitorPhone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="w-3 h-3 shrink-0" />
                {pass.visitorPhone}
              </span>
            )}
            {pass.vehiclePlate && (
              <span className="inline-flex items-center gap-1 font-mono">
                <Car className="w-3 h-3 shrink-0" />
                {pass.vehiclePlate}
              </span>
            )}
            {pass.visitPurpose && (
              <span className="truncate max-w-[8rem]">{pass.visitPurpose}</span>
            )}
            {showCreator && pass.creatorName && (
              <span className="truncate max-w-[10rem]">
                {labels.card.orderedBy}: {pass.creatorName}
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-1 pl-1 border-l border-[var(--border)]/60 ml-1 pl-2">
          <div className="text-center min-w-[2.75rem]">
            <div className="text-[9px] uppercase tracking-wide text-[var(--muted)] leading-none mb-0.5">
              {labels.card.office}
            </div>
            <div className="text-2xl font-bold leading-none text-[var(--primary)] tabular-nums">
              {pass.office}
            </div>
            {pass.floor && (
              <div className="text-[10px] text-[var(--muted)] mt-0.5 whitespace-nowrap">
                {pass.floor} {labels.card.floorSuffix}
              </div>
            )}
          </div>
          <ChevronRight className={`w-4 h-4 transition-colors ${selected ? 'text-[var(--accent)]' : 'text-[var(--border-strong)]'}`} />
        </div>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href} className={className}>{inner}</Link>;
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}