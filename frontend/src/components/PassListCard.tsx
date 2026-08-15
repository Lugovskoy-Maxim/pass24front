'use client';

import Link from 'next/link';
import {
  Building2,
  Car,
  MapPin,
  Package,
  Phone,
  User,
  Wrench,
} from 'lucide-react';
import { Pass, PassType, TYPE_LABELS } from '@/lib/api';
import { getGuestOverdueKind, getUiLabels, UiLabels } from '@/lib/ui-labels';
import {
  getPassCardShellClass,
  getPassIconTileClass,
  getPassStatusStripeClass,
} from '@/lib/pass-status';
import { useConfig } from '@/hooks/useConfig';
import { formatVisitDateLabel, formatVisitTimeWindow } from '@/lib/local-date';
import { formatOfficeDestination } from '@/lib/pass-display';
import { StatusBadge } from './StatusBadge';
import { PassNumber } from './PassNumber';
import { PassOfficeHighlight } from './PassOfficeHighlight';

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
  /** Quick actions between main info and office block (e.g. check-in / reject on reception). */
  actions?: React.ReactNode;
}

export function PassListCard({
  pass,
  labels: labelsProp,
  selected,
  showCreator,
  href,
  onClick,
  actions,
}: PassListCardProps) {
  const config = useConfig();
  const labels = labelsProp || getUiLabels(config);
  const Icon = TYPE_ICONS[pass.passType as PassType] || User;
  const overdueKind = getGuestOverdueKind(pass);
  const stillInside = overdueKind !== null;
  const visitDateLabel = formatVisitDateLabel(pass.visitDate);
  const visitWindow = formatVisitTimeWindow(
    pass.visitTimeFrom,
    pass.visitTimeTo,
  );
  const visitMeta = [visitDateLabel, visitWindow].filter(Boolean).join(' · ');
  const typeLabel = TYPE_LABELS[pass.passType as PassType];
  const metaParts = [visitMeta, typeLabel].filter(Boolean);
  const metaTitle = [pass.visitDate, typeLabel, visitWindow]
    .filter(Boolean)
    .join(' · ');
  const officeInline = formatOfficeDestination({
    office: pass.office,
    floor: pass.floor,
    businessCenterName: pass.businessCenterName,
    officePrefix: labels.card.officePrefix,
    floorSuffix: labels.card.floorSuffix,
  });

  const className = [
    'w-full max-w-full text-left rounded-lg block min-w-0 overflow-hidden',
    getPassCardShellClass({
      interactive: !!(onClick || href),
      selected,
      overdue: stillInside,
      status: pass.status,
    }),
  ].join(' ');

  const inner = (
    <div className="flex items-stretch min-w-0 w-full">
      <div
        className={getPassStatusStripeClass(pass.status, stillInside)}
        aria-hidden
      />

      <div className="pass-card__body pass-card__body--row px-3 py-2.5 min-w-0">
        {pass.companyLogo ? (
          <div className="w-11 h-11 shrink-0 overflow-hidden self-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pass.companyLogo}
              alt={pass.companyName || 'Логотип'}
              className="w-full h-full object-contain"
            />
          </div>
        ) : (
          <div
            className={`w-9 h-9 rounded-lg shrink-0 ${getPassIconTileClass(pass.status, stillInside)} self-center flex items-center justify-center`}
          >
            <Icon className="w-4 h-4" />
          </div>
        )}

        <div className="pass-card__main flex-1 min-w-0 self-center">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <div className="pass-card__title text-sm" title={pass.visitorName}>
              {pass.visitorName}
            </div>
            <div className="pass-card__badges">
              <StatusBadge
                status={pass.status}
                labels={labels}
                size="sm"
                overdueKind={overdueKind}
              />
            </div>
          </div>

          <div className="mt-0.5 min-w-0">
            <PassNumber value={pass.passNumber} size="sm" />
          </div>

          <p
            className="pass-card__meta-line mt-0.5 text-[11px] text-[var(--muted)]"
            title={metaTitle}
          >
            <span className="pass-card__visit-date text-[var(--text)] font-medium">
              {metaParts[0]}
            </span>
            {metaParts.length > 1 && (
              <span className="text-[var(--muted)]">
                {' '}
                · {metaParts.slice(1).join(' · ')}
              </span>
            )}
            <span className="pass-card__office--inline ml-1">
              · {officeInline}
            </span>
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
              <span
                className="pass-card__chip font-mono"
                title={pass.vehiclePlate}
              >
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

        {actions && (
          <div
            className="pass-card__quick-actions"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {actions}
          </div>
        )}

        <PassOfficeHighlight
          office={pass.office}
          floor={pass.floor}
          businessCenterName={pass.businessCenterName}
          label={labels.card.office}
          floorSuffix={labels.card.floorSuffix}
          size="sm"
          className="shrink-0 self-center"
          title={officeInline}
        />
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }

  // Use div (not button) so nested action controls are valid HTML
  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
        className={`${className} cursor-pointer`}
      >
        {inner}
      </div>
    );
  }

  return <div className={className}>{inner}</div>;
}
