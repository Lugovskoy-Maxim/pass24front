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
  getOverdueBadgeLabel,
  getOverdueCardMessage,
  getPassCardBorderClass,
  mergeUiLabels,
  PassCardData,
  UiLabels,
} from '@/lib/ui-labels';
import { PassVisitTimeline } from './PassVisitTimeline';
import { StatusBadge } from './StatusBadge';

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
      className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--primary)] hover:bg-[var(--surface-muted)] transition-colors"
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
  const useBadge = showStatusBadge ?? isCompact;

  const content = (
    <article
      className={[
        bare ? 'overflow-hidden' : 'card overflow-hidden transition-shadow',
        !bare && (highlight || stillInside) ? 'ring-2 ring-offset-2' : '',
        !bare && stillInside ? 'ring-amber-400' : '',
        !bare && highlight && !stillInside ? 'ring-[var(--primary)]' : '',
        dimmed ? 'opacity-85' : onClick ? 'cursor-pointer hover:shadow-md hover:border-[var(--accent)]' : !bare ? 'hover:shadow-md' : '',
        !bare ? getPassCardBorderClass(pass.status, stillInside) : '',
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
      {overdueKind && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs sm:text-sm flex items-center gap-2">
          <span className="inline-flex px-2 py-0.5 rounded-full bg-amber-200/80 font-semibold text-[10px] uppercase tracking-wide shrink-0">
            {getOverdueBadgeLabel(overdueKind, labels)}
          </span>
          <span>{getOverdueCardMessage(overdueKind, pass, labels)}</span>
        </div>
      )}

      <div className={`border-b border-[var(--border)] bg-gradient-to-b from-slate-50/80 to-white ${isCompact ? 'px-3 pt-3 pb-2' : 'px-4 pt-4 pb-3'}`}>
        <div className="flex items-start gap-3">
          <div className={`rounded-xl bg-white border border-[var(--border)] flex items-center justify-center shrink-0 shadow-sm ${isCompact ? 'w-10 h-10' : 'w-12 h-12'}`}>
            <Icon className={`text-[var(--primary)] ${isCompact ? 'w-5 h-5' : 'w-6 h-6'}`} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className={`font-bold leading-tight truncate ${isCompact ? 'text-base' : 'text-xl'}`}>
                {pass.visitorName}
              </h3>
              <div className="flex items-center gap-1.5 shrink-0">
                {useBadge && <StatusBadge status={pass.status} labels={labels} />}
                <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-[var(--border)] text-[var(--muted)]">
                  {TYPE_LABELS[pass.passType as PassType] || pass.passType}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 mt-1">
              <span className={`font-mono font-bold text-[var(--primary)] ${isCompact ? 'text-sm' : 'text-lg'}`}>
                {pass.passNumber}
              </span>
              <CopyPassNumber passNumber={pass.passNumber} title={labels.buttons.copyNumber} />
              {showQrLink && (
                <Link
                  href={`/ticket/${encodeURIComponent(pass.passNumber)}`}
                  target="_blank"
                  className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--primary)] hover:bg-[var(--surface-muted)]"
                  title={labels.buttons.qrPass}
                  onClick={(e) => e.stopPropagation()}
                >
                  <QrCode className="w-4 h-4" />
                </Link>
              )}
            </div>

            {showCreator && pass.creatorName && (
              <div className="text-xs text-[var(--muted)] mt-1">
                {labels.card.orderedBy}: {pass.creatorName}
                {pass.creatorCompany ? ` · ${pass.creatorCompany}` : ''}
              </div>
            )}
          </div>

          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{labels.card.office}</div>
            <div className={`font-bold leading-none text-[var(--primary)] ${isCompact ? 'text-2xl' : 'text-3xl'}`}>
              {pass.office}
            </div>
            {pass.floor && (
              <div className="text-xs text-[var(--muted)] mt-0.5">
                {pass.floor} {labels.card.floorSuffix}
              </div>
            )}
          </div>
        </div>

        {(pass.businessCenterName || pass.companyName) && (
          <div className={`flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[var(--muted)] ${isCompact ? 'text-xs' : 'text-sm'}`}>
            {pass.businessCenterName && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {pass.businessCenterName}
              </span>
            )}
            {pass.companyName && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" />
                {pass.companyName}
              </span>
            )}
          </div>
        )}

        {headerExtra}
      </div>

      {useTimeline && (
        <div className={`${isCompact ? 'px-2 sm:px-3 py-3' : 'px-3 sm:px-5 py-4'} ${isTerminal ? 'bg-[var(--surface-muted)]' : 'bg-white'}`}>
          <PassVisitTimeline pass={pass} labels={labels} compact={isCompact} />
        </div>
      )}

      <div className={`border-t border-[var(--border)] bg-[var(--surface-muted)] ${isCompact ? 'px-3 py-2' : 'px-4 py-3'}`}>
        <div className={`flex flex-wrap gap-x-4 gap-y-2 ${isCompact ? 'text-xs' : 'text-sm'}`}>
          <span className="inline-flex items-center gap-1.5 text-[var(--text)]">
            <Clock className="w-3.5 h-3.5 text-[var(--muted)]" />
            {pass.visitDate}
            {visitWindow && <span className="text-[var(--muted)]">· {visitWindow}</span>}
          </span>

          {pass.visitorPhone && (
            <a
              href={`tel:${pass.visitorPhone}`}
              className="inline-flex items-center gap-1.5 text-[var(--primary)] hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <Phone className="w-3.5 h-3.5" />
              {pass.visitorPhone}
            </a>
          )}

          {pass.vehiclePlate && (
            <span className="inline-flex items-center gap-1.5 font-mono font-semibold">
              <Car className="w-3.5 h-3.5 text-[var(--muted)]" />
              {pass.vehiclePlate}
            </span>
          )}

          {pass.visitPurpose && (
            <span className="text-[var(--muted)]">{pass.visitPurpose}</span>
          )}

          {!showCreator && (pass.creatorName || pass.creatorCompany) && !isCompact && (
            <span className="inline-flex items-center gap-1.5 text-[var(--muted)] text-xs">
              <UserCircle className="w-3.5 h-3.5" />
              {pass.creatorName}
              {pass.creatorCompany && ` · ${pass.creatorCompany}`}
            </span>
          )}
        </div>

        {pass.comment && (
          <p className="mt-2 text-xs text-[var(--muted)] flex items-start gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {pass.comment}
          </p>
        )}

        {pass.rejectionReason && (
          <p className="mt-2 text-xs text-red-600 flex items-start gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span><span className="font-medium">{labels.card.rejectionReason}:</span> {pass.rejectionReason}</span>
          </p>
        )}
      </div>

      {children}

      {actions && (
        <div
          className="px-4 py-3 border-t border-[var(--border)] bg-white flex flex-col sm:flex-row gap-2"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      )}
    </article>
  );

  return content;
}