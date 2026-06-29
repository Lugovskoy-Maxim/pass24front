'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  Car,
  Check,
  Clock,
  Copy,
  MapPin,
  MessageSquare,
  Package,
  Phone,
  QrCode,
  User,
  UserCircle,
  Wrench,
} from 'lucide-react';
import { PassType, TYPE_LABELS } from '@/lib/api';
import {
  getGuestOverdueKind,
  getOverdueCardMessage,
  mergeUiLabels,
  PassCardData,
  UiLabels,
} from '@/lib/ui-labels';
import {
  getPassCardShellClass,
  getPassIconTileClass,
  getPassStatusStripeClass,
} from '@/lib/pass-status';
import { PassVisitTimeline } from './PassVisitTimeline';
import { OverdueBadge, StatusBadge } from './StatusBadge';

const TYPE_ICONS: Record<PassType, typeof User> = {
  visitor: User,
  parking: Car,
  delivery: Package,
  contractor: Wrench,
};

function CopyPassNumber({ passNumber, title }: { passNumber: string; title: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(passNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--link)] hover:bg-[var(--surface-muted)] transition-colors"
      title={title}
    >
      {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

export interface PassCardBaseProps {
  pass: PassCardData;
  labels?: UiLabels;
  variant?: 'compact' | 'full';
  showTimeline?: boolean;
  showCreator?: boolean;
  showQrLink?: boolean;
  showStatusBadge?: boolean;
  highlight?: boolean;
  dimmed?: boolean;
  bare?: boolean;
  onClick?: () => void;
  actions?: React.ReactNode;
  headerExtra?: React.ReactNode;
  children?: React.ReactNode;
}

export function PassCardBase({
  pass,
  labels: labelsProp,
  variant = 'full',
  showTimeline,
  showCreator = false,
  showQrLink = true,
  showStatusBadge,
  highlight,
  dimmed,
  bare,
  onClick,
  actions,
  headerExtra,
  children,
}: PassCardBaseProps) {
  const labels = labelsProp || mergeUiLabels();
  const isCompact = variant === 'compact';
  const Icon = TYPE_ICONS[pass.passType as PassType] || User;
  const visitWindow = pass.visitTimeFrom
    ? `${pass.visitTimeFrom}${pass.visitTimeTo ? ` – ${pass.visitTimeTo}` : ''}`
    : null;
  const isTerminal = ['rejected', 'cancelled', 'expired', 'completed'].includes(pass.status);
  const overdueKind = getGuestOverdueKind(pass);
  const stillInside = overdueKind !== null;
  const useTimeline = showTimeline ?? !isCompact;
  const useBadge = showStatusBadge ?? true;

  const content = (
    <article
      className={[
        'min-w-0 max-w-full',
        bare
          ? 'overflow-hidden'
          : getPassCardShellClass({
              interactive: !!onClick || highlight,
              selected: highlight || stillInside,
              overdue: stillInside,
              status: pass.status,
              dimmed,
            }),
        onClick ? 'cursor-pointer' : '',
      ].filter(Boolean).join(' ')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
    >
      <div className="flex items-stretch min-w-0 w-full">
        {!bare && <div className={getPassStatusStripeClass(pass.status, stillInside)} aria-hidden />}

        <div className="pass-card__body">
      {overdueKind && (
        <div className={`px-4 py-2 theme-alert-subtle border-b text-xs sm:text-sm pass-card__alert ${isCompact ? 'px-3' : ''}`}>
          <OverdueBadge kind={overdueKind} labels={labels} size="sm" />
          <span className="pass-card__alert-msg">{getOverdueCardMessage(overdueKind, pass, labels)}</span>
        </div>
      )}

      <div className={`border-b border-[var(--border)] bg-gradient-surface ${isCompact ? 'px-3 pt-3 pb-2' : 'px-4 pt-4 pb-3'}`}>
        <div className="flex items-start gap-3 min-w-0">
          <div className={`${getPassIconTileClass(pass.status, stillInside)} shadow-sm shrink-0 ${isCompact ? 'w-10 h-10' : 'w-12 h-12'}`}>
            <Icon className={isCompact ? 'w-5 h-5' : 'w-6 h-6'} />
          </div>

          <div className="pass-card__header-grid flex-1 min-w-0">
            <div className="pass-card__main min-w-0">
              <h3
                className={`pass-card__title ${isCompact ? 'text-base' : 'text-xl'}`}
                title={pass.visitorName}
              >
                {pass.visitorName}
              </h3>

              <div className="pass-card__badges mt-1.5">
                {useBadge && (
                  <StatusBadge
                    status={pass.status}
                    labels={labels}
                    size={isCompact ? 'sm' : 'md'}
                    overdueKind={overdueKind}
                  />
                )}
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--muted)] max-w-full min-w-0 truncate">
                  {TYPE_LABELS[pass.passType as PassType] || pass.passType}
                </span>
              </div>

              <div className="flex items-center gap-1 mt-1.5 min-w-0">
                <span
                  className={`pass-card__mono font-bold text-[var(--text)] flex-1 min-w-0 ${isCompact ? 'text-sm' : 'text-lg'}`}
                  title={pass.passNumber}
                >
                  {pass.passNumber}
                </span>
                <CopyPassNumber passNumber={pass.passNumber} title={labels.buttons.copyNumber} />
                {showQrLink && (
                  <Link
                    href={`/ticket/${encodeURIComponent(pass.passNumber)}`}
                    target="_blank"
                    className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--link)] hover:bg-[var(--surface-muted)] shrink-0"
                    title={labels.buttons.qrPass}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <QrCode className="w-4 h-4" />
                  </Link>
                )}
              </div>

              {showCreator && pass.creatorName && (
                <div className="text-xs text-[var(--muted)] mt-1 pass-card__text-block">
                  {labels.card.orderedBy}: {pass.creatorName}
                  {pass.creatorCompany ? ` · ${pass.creatorCompany}` : ''}
                </div>
              )}
            </div>

            <div className="pass-card__office pass-card__office--side min-w-[3rem] max-w-[5rem]">
              <div className="text-[10px] uppercase tracking-wide text-[var(--muted)] truncate">{labels.card.office}</div>
              <div
                className={`font-bold leading-none text-[var(--text)] tabular-nums truncate ${isCompact ? 'text-2xl' : 'text-3xl'}`}
                title={pass.office}
              >
                {pass.office}
              </div>
              {pass.floor && (
                <div className="text-xs text-[var(--muted)] mt-0.5 truncate" title={`${pass.floor} ${labels.card.floorSuffix}`}>
                  {pass.floor} {labels.card.floorSuffix}
                </div>
              )}
            </div>
          </div>
        </div>

        {(pass.businessCenterName || pass.companyName) && (
          <div className={`pass-card__chips mt-2 text-[var(--muted)] ${isCompact ? 'text-xs' : 'text-sm'}`}>
            {pass.businessCenterName && (
              <span className="pass-card__chip" title={pass.businessCenterName}>
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                {pass.businessCenterName}
              </span>
            )}
            {pass.companyName && (
              <span className="pass-card__chip" title={pass.companyName}>
                <Building2 className="w-3.5 h-3.5 shrink-0" />
                {pass.companyName}
              </span>
            )}
          </div>
        )}

        {headerExtra}
      </div>

      {useTimeline && (
        <div className={`pass-card__timeline ${isCompact ? 'px-2 sm:px-3 py-3' : 'px-3 sm:px-5 py-4'} ${isTerminal ? 'bg-[var(--surface-muted)]' : 'bg-[var(--surface)]'}`}>
          <PassVisitTimeline pass={pass} labels={labels} compact={isCompact} overdue={stillInside} />
        </div>
      )}

      <div className={`border-t border-[var(--border)] bg-[var(--surface-muted)] ${isCompact ? 'px-3 py-2' : 'px-4 py-3'}`}>
        <div className={`pass-card__chips ${isCompact ? 'text-xs' : 'text-sm'}`}>
          <span className="pass-card__chip text-[var(--text)]" title={`${pass.visitDate}${visitWindow ? ` · ${visitWindow}` : ''}`}>
            <Clock className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
            {pass.visitDate}
            {visitWindow && <span className="text-[var(--muted)]">· {visitWindow}</span>}
          </span>

          {pass.visitorPhone && (
            <a
              href={`tel:${pass.visitorPhone}`}
              className="pass-card__chip text-link hover:underline"
              onClick={(e) => e.stopPropagation()}
              title={pass.visitorPhone}
            >
              <Phone className="w-3.5 h-3.5 shrink-0" />
              {pass.visitorPhone}
            </a>
          )}

          {pass.vehiclePlate && (
            <span className="pass-card__chip font-mono font-semibold" title={pass.vehiclePlate}>
              <Car className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
              {pass.vehiclePlate}
            </span>
          )}

          {pass.visitPurpose && (
            <span className="pass-card__chip text-[var(--muted)]" title={pass.visitPurpose}>{pass.visitPurpose}</span>
          )}

          {!showCreator && (pass.creatorName || pass.creatorCompany) && !isCompact && (
            <span className="pass-card__chip text-[var(--muted)] text-xs" title={[pass.creatorName, pass.creatorCompany].filter(Boolean).join(' · ')}>
              <UserCircle className="w-3.5 h-3.5 shrink-0" />
              {pass.creatorName}
              {pass.creatorCompany && ` · ${pass.creatorCompany}`}
            </span>
          )}
        </div>

        {pass.comment && (
          <p className="mt-2 text-xs text-[var(--muted)] flex items-start gap-1.5 pass-card__text-block">
            <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {pass.comment}
          </p>
        )}

        {pass.rejectionReason && (
          <p className="mt-2 text-xs text-[var(--status-rejected)] flex items-start gap-1.5 pass-card__text-block">
            <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span><span className="font-medium">{labels.card.rejectionReason}:</span> {pass.rejectionReason}</span>
          </p>
        )}
      </div>

      {children}

      {actions && (
        <div
          className="pass-card__actions px-4 py-3 border-t border-[var(--border)] bg-[var(--surface)]"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      )}
        </div>
      </div>
    </article>
  );

  return content;
}