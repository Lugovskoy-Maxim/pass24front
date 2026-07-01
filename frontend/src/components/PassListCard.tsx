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
  getUiLabels,
  UiLabels,
} from '@/lib/ui-labels';
import {
  getPassCardShellClass,
  getPassIconTileClass,
  getPassStatusStripeClass,
} from '@/lib/pass-status';
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

  const metaParts = [pass.visitDate, TYPE_LABELS[pass.passType as PassType]];
  if (visitWindow) metaParts.push(visitWindow);
  const officeInline = [
    `${labels.card.office} ${pass.office}`,
    pass.floor ? `${pass.floor} ${labels.card.floorSuffix}` : '',
  ].filter(Boolean).join(' · ');

  const className = [
    'w-full max-w-full text-left rounded-lg block min-w-0 overflow-hidden',
    getPassCardShellClass({
      interactive: true,
      selected,
      overdue: stillInside,
      status: pass.status,
    }),
  ].join(' ');

  const inner = (
    <div className="flex items-stretch min-w-0 w-full">
      <div className={getPassStatusStripeClass(pass.status, stillInside)} aria-hidden />

      <div className="pass-card__body pass-card__body--row px-3 py-2.5 min-w-0">
        <div className={`w-8 h-8 rounded-lg shrink-0 ${getPassIconTileClass(pass.status, stillInside)} mt-0.5`}>
          <Icon className="w-4 h-4" />
        </div>

        <div className="pass-card__main flex-1 min-w-0">
          <div className="pass-card__title text-sm" title={pass.visitorName}>
            {pass.visitorName}
          </div>

          <div className="pass-card__badges mt-1">
            <StatusBadge status={pass.status} labels={labels} size="sm" overdueKind={overdueKind} />
          </div>

          <div className="pass-card__mono text-xs font-semibold mt-1 opacity-90" title={pass.passNumber}>
            {pass.passNumber}
          </div>

          <p className="pass-card__meta-line mt-1 text-[11px] text-[var(--muted)]" title={metaParts.join(' · ')}>
            {metaParts.join(' · ')}
            <span className="pass-card__office--inline ml-1">· {officeInline}</span>
          </p>

          <div className="pass-card__chips mt-1 text-[11px] text-[var(--muted)]">
            {pass.companyName && (
              <span className="pass-card__chip" title={pass.companyName}>
                <Building2 className="w-3 h-3 shrink-0" />
                {pass.companyName}
              </span>
            )}
            {pass.businessCenterName && (
              <span className="pass-card__chip" title={pass.businessCenterName}>
                <MapPin className="w-3 h-3 shrink-0" />
                {pass.businessCenterName}
              </span>
            )}
            {pass.visitorPhone && (
              <span className="pass-card__chip" title={pass.visitorPhone}>
                <Phone className="w-3 h-3 shrink-0" />
                {pass.visitorPhone}
              </span>
            )}
            {pass.vehiclePlate && (
              <span className="pass-card__chip font-mono" title={pass.vehiclePlate}>
                <Car className="w-3 h-3 shrink-0" />
                {pass.vehiclePlate}
              </span>
            )}
            {showCreator && pass.creatorName && (
              <span className="pass-card__chip" title={pass.creatorName}>
                {labels.card.orderedBy}: {pass.creatorName}
              </span>
            )}
          </div>
        </div>

        <div className="pass-card__office pass-card__office--side shrink-0 flex flex-col items-end gap-1 min-w-[2.75rem] max-w-[4.5rem]">
          <div className="text-center w-full min-w-0">
            <div className="text-[9px] uppercase tracking-wide text-[var(--muted)] leading-none mb-0.5 truncate">
              {labels.card.office}
            </div>
            <div className="text-2xl font-bold leading-none text-[var(--text)] tabular-nums truncate" title={pass.office}>
              {pass.office}
            </div>
            {pass.floor && (
              <div className="text-[10px] text-[var(--muted)] mt-0.5 truncate" title={`${pass.floor} ${labels.card.floorSuffix}`}>
                {pass.floor} {labels.card.floorSuffix}
              </div>
            )}
          </div>
          <ChevronRight className={`w-4 h-4 shrink-0 ${selected ? 'text-[var(--text)]' : 'text-[var(--muted)]'}`} />
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