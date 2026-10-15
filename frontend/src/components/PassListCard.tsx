'use client';

import Link from 'next/link';
import {
  Building2,
  Car,
  CalendarDays,
  MapPin,
  Phone,
  Clock3,
  UserRound,
} from 'lucide-react';
import { Pass, PassType, TYPE_LABELS } from '@/lib/api';
import { getGuestOverdueKind, getUiLabels, UiLabels } from '@/lib/ui-labels';
import {
  getPassCardShellClass,
  getPassStatusStripeClass,
} from '@/lib/pass-status';
import { useConfig } from '@/hooks/useConfig';
import { formatVisitDateLabel, formatVisitTimeWindow } from '@/lib/local-date';
import { formatOfficeDestination } from '@/lib/pass-display';
import { isAwaitingEntry } from '@/lib/pass-entry';
import { StatusBadge } from './StatusBadge';
import { PassNumber } from './PassNumber';
import { PassOfficeHighlight } from './PassOfficeHighlight';

interface PassListCardProps {
  pass: Pass;
  labels?: UiLabels;
  selected?: boolean;
  showCreator?: boolean;
  href?: string;
  onClick?: () => void;
  /** Quick actions between main info and office block (e.g. check-in / reject on reception). */
  actions?: React.ReactNode;
  /** Larger, scannable layout used on the main passes page. */
  prominent?: boolean;
}

export function PassListCard({
  pass,
  labels: labelsProp,
  selected,
  showCreator,
  href,
  onClick,
  actions,
  prominent = false,
}: PassListCardProps) {
  const config = useConfig();
  const labels = labelsProp || getUiLabels(config);
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

      <div
        className={`pass-card__body pass-card__body--row ${prominent ? 'pass-card__body--prominent' : ''} px-3 py-2.5 min-w-0`}
      >
        <div className="pass-card__main flex-1 min-w-0 self-center">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            {pass.companyLogo && (
              <div className="pass-card__logo w-12 h-12 shrink-0 overflow-hidden rounded-xl self-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pass.companyLogo}
                  alt={pass.companyName || 'Логотип компании'}
                  className="w-full h-full object-contain rounded-lg"
                />
              </div>
            )}
            <div
              className={`pass-card__title ${prominent ? 'text-lg sm:text-xl' : 'text-sm'}`}
              title={pass.visitorName}
            >
              {pass.visitorName}
            </div>
            <div className="pass-card__badges">
              <StatusBadge
                status={pass.status}
                labels={labels}
                label={
                  prominent && isAwaitingEntry(pass.status)
                    ? 'Ожидает входа'
                    : undefined
                }
                size={prominent ? 'md' : 'sm'}
                overdueKind={overdueKind}
              />
            </div>
          </div>

          <div className="mt-0.5 min-w-0">
            <PassNumber value={pass.passNumber} size="sm" />
          </div>

          {prominent ? (
            <div className="pass-card__visit-meta mt-1.5" title={metaTitle}>
              <CalendarDays className="w-4 h-4 shrink-0" aria-hidden />
              <span className="pass-card__visit-date">{visitDateLabel}</span>
              {visitWindow && (
                <span className="pass-card__visit-time">
                  <Clock3 className="w-3.5 h-3.5 shrink-0" aria-hidden />
                  {visitWindow}
                </span>
              )}
            </div>
          ) : (
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
                {' '}
                · {officeInline}
              </span>
            </p>
          )}

          {prominent && showCreator && pass.creatorName && (
            <div className="pass-card__creator mt-1.5" title={pass.creatorName}>
              <UserRound className="w-3.5 h-3.5 shrink-0" aria-hidden />
              <span>{labels.card.orderedBy}:</span>
              <strong>{pass.creatorName}</strong>
            </div>
          )}

          <div
            className={`pass-card__chips mt-1.5 ${prominent ? 'text-[12px]' : 'text-[11px]'} text-[var(--muted)]`}
          >
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
            {!prominent && showCreator && pass.creatorName && (
              <span className="pass-card__chip" title={pass.creatorName}>
                <UserRound className="w-3 h-3 shrink-0" />
                <span>
                  {labels.card.orderedBy}: {pass.creatorName}
                </span>
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
          size={prominent ? 'lg' : 'sm'}
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
