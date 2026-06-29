'use client';

import Link from 'next/link';
import {
  Calendar,
  MapPin,
  MessageSquare,
  Phone,
  QrCode,
  User,
} from 'lucide-react';
import { Pass, TYPE_LABELS, PassType } from '@/lib/api';
import {
  getGuestOverdueKind,
  getOverdueCardMessage,
  getUiLabels,
  UiLabels,
} from '@/lib/ui-labels';
import {
  getPassCardShellClass,
  getPassIconTileClass,
  getPassStatusStripeClass,
} from '@/lib/pass-status';
import { useConfig } from '@/hooks/useConfig';
import { PassVisitTimeline } from './PassVisitTimeline';
import { StatusBadge } from './StatusBadge';

function DetailRow({ label, value, mono }: { label: string; value?: React.ReactNode; mono?: boolean }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="py-2 border-b border-[var(--border)] last:border-0">
      <dt className="text-[10px] uppercase tracking-wide text-[var(--muted)] mb-0.5">{label}</dt>
      <dd className={`text-sm font-medium break-words ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

function formatDateTime(iso?: string) {
  if (!iso) return undefined;
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface PassDetailPanelProps {
  pass: Pass;
  labels?: UiLabels;
  showCreator?: boolean;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

export function PassDetailPanel({ pass, labels: labelsProp, showCreator, actions, children }: PassDetailPanelProps) {
  const config = useConfig();
  const labels = labelsProp || getUiLabels(config);
  const overdueKind = getGuestOverdueKind(pass);
  const stillInside = overdueKind !== null;
  const isTerminal = ['rejected', 'cancelled', 'expired', 'completed'].includes(pass.status);
  const visitWindow = pass.visitTimeFrom
    ? `${pass.visitTimeFrom}${pass.visitTimeTo ? ` – ${pass.visitTimeTo}` : ''}`
    : null;

  return (
    <div className={`${getPassCardShellClass({ overdue: stillInside })} min-w-0 max-w-full overflow-hidden`}>
      <div className="flex items-stretch min-w-0 w-full">
        <div className={getPassStatusStripeClass(pass.status, stillInside)} aria-hidden />

        <div className="pass-card__body">
          {overdueKind && (
            <div className="px-4 py-2 theme-alert-subtle border-b text-xs pass-card__alert">
              <span className="pass-card__alert-msg">{getOverdueCardMessage(overdueKind, pass, labels)}</span>
            </div>
          )}

          <div className="px-4 py-4 bg-gradient-surface border-b border-[var(--border)]">
            <div className="flex items-start gap-3 min-w-0">
              <div className={`shrink-0 ${getPassIconTileClass(pass.status, stillInside)} w-10 h-10`}>
                <User className="w-5 h-5" />
              </div>
              <div className="pass-card__main flex-1 min-w-0">
                <h3 className="pass-card__title text-lg" title={pass.visitorName}>{pass.visitorName}</h3>
                <p className="pass-card__mono text-sm font-semibold mt-1" title={pass.passNumber}>{pass.passNumber}</p>
                <div className="pass-card__badges mt-2">
                  <StatusBadge status={pass.status} labels={labels} overdueKind={overdueKind} />
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--muted)] max-w-full min-w-0 truncate">
                    {TYPE_LABELS[pass.passType as PassType] || pass.passType}
                  </span>
                </div>
              </div>
            </div>

            <div className="pass-card__chips mt-3">
              <span className="pass-card__chip text-xs bg-[var(--surface-elevated)] border border-[var(--border)] rounded-md px-2 py-1" title={`${labels.card.office} ${pass.office}${pass.floor ? ` · ${pass.floor}` : ''}`}>
                <MapPin className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
                {labels.card.office} {pass.office}
                {pass.floor && ` · ${pass.floor} ${labels.card.floorSuffix}`}
              </span>
              <span className="pass-card__chip text-xs bg-[var(--surface-elevated)] border border-[var(--border)] rounded-md px-2 py-1" title={`${pass.visitDate}${visitWindow ? ` · ${visitWindow}` : ''}`}>
                <Calendar className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
                {pass.visitDate}
                {visitWindow && ` · ${visitWindow}`}
              </span>
              <Link
                href={`/ticket/${encodeURIComponent(pass.passNumber)}`}
                target="_blank"
                className="pass-card__chip text-xs bg-[var(--surface-elevated)] border border-[var(--border)] rounded-md px-2 py-1 text-[var(--text)] hover:bg-[var(--surface-muted)]"
              >
                <QrCode className="w-3.5 h-3.5 shrink-0" />
                {labels.buttons.qrPass}
              </Link>
            </div>
          </div>

          <div className={`pass-card__timeline px-4 py-4 border-b border-[var(--border)] ${isTerminal ? 'bg-[var(--surface-muted)]' : 'bg-[var(--surface)]'}`}>
            <p className="text-[10px] uppercase tracking-wide text-[var(--muted)] mb-3">{labels.passes.detailTimeline}</p>
            <PassVisitTimeline pass={pass} labels={labels} overdue={stillInside} />
          </div>

          <dl className="px-4 py-2 divide-y divide-[var(--border)]">
            <DetailRow label={labels.card.company} value={pass.companyName} />
            <DetailRow label={labels.card.businessCenter} value={pass.businessCenterName} />
            <DetailRow label={labels.card.visitPurpose} value={pass.visitPurpose} />
            <DetailRow label={labels.card.phone} value={pass.visitorPhone && (
              <a href={`tel:${pass.visitorPhone}`} className="text-link hover:underline">{pass.visitorPhone}</a>
            )} />
            <DetailRow
              label={labels.card.vehicle}
              value={pass.vehiclePlate && `${pass.vehiclePlate}${pass.vehicleModel ? ` · ${pass.vehicleModel}` : ''}`}
              mono
            />
            {showCreator && (pass.creatorName || pass.creatorPhone || pass.creatorCompany) && (
              <div className="py-2 border-b border-[var(--border)]">
                <dt className="text-[10px] uppercase tracking-wide text-[var(--muted)] mb-1.5">{labels.card.orderedBy}</dt>
                <dd className="text-sm space-y-1.5">
                  {pass.creatorName && (
                    <div className="flex items-start gap-2 font-medium">
                      <User className="w-4 h-4 text-[var(--muted)] shrink-0 mt-0.5" />
                      <span className="break-words">{pass.creatorName}</span>
                    </div>
                  )}
                  {pass.creatorPhone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-[var(--muted)] shrink-0" />
                      <a href={`tel:${pass.creatorPhone}`} className="text-link hover:underline">
                        {pass.creatorPhone}
                      </a>
                    </div>
                  )}
                  {pass.creatorCompany && (
                    <div className="text-[var(--muted)] pl-6">{pass.creatorCompany}</div>
                  )}
                </dd>
              </div>
            )}
            <DetailRow label={labels.card.checkIn} value={formatDateTime(pass.checkedInAt)} />
            <DetailRow label={labels.card.checkOut} value={formatDateTime(pass.checkedOutAt)} />
            {pass.approvedAt && (
              <DetailRow label={labels.timeline.approve} value={formatDateTime(pass.approvedAt)} />
            )}
            {pass.comment && (
              <div className="py-2 border-b border-[var(--border)]">
                <dt className="text-[10px] uppercase tracking-wide text-[var(--muted)] mb-1 flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" />
                  {labels.card.comment}
                </dt>
                <dd className="text-sm surface-muted rounded-md p-2">{pass.comment}</dd>
              </div>
            )}
            {pass.rejectionReason && (
              <div className="py-2">
                <dt className="text-[10px] uppercase tracking-wide text-[var(--status-rejected)] mb-1">{labels.card.rejectionReason}</dt>
                <dd className="text-sm text-[var(--status-rejected)]">{pass.rejectionReason}</dd>
              </div>
            )}
          </dl>

          {children}

          {actions && (
            <div className="pass-card__actions px-4 py-4 border-t border-[var(--border)] surface-muted/50">
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}