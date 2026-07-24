'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  Calendar,
  Car,
  Check,
  Copy,
  ExternalLink,
  History,
  IdCard,
  MapPin,
  MessageSquare,
  Phone,
  QrCode,
  User,
  UserCircle,
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
import { useAuth } from '@/lib/auth';
import { canViewAllPasses, canUseReception, hasPermission } from '@/lib/permissions';
import { buildHistoryHref } from '@/lib/visit-history';
import { passShowsVisitTimeline } from '@/lib/pass-checkout';
import { PassVisitTimeline } from './PassVisitTimeline';
import { PassVisitorDataForm } from './PassVisitorDataForm';
import { StatusBadge } from './StatusBadge';

function HistoryLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-[11px] text-link hover:underline"
    >
      <History className="w-3 h-3" />
      {label}
    </Link>
  );
}

function CopyButton({ value, title }: { value: string; title: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
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
      className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--link)] hover:bg-[var(--surface-muted)] transition-colors shrink-0"
      title={title}
      aria-label={title}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function formatPassport(pass: Pass) {
  if (!pass.visitorPassportSeries && !pass.visitorPassportNumber) return undefined;
  const base = [pass.visitorPassportSeries, pass.visitorPassportNumber].filter(Boolean).join(' ');
  return pass.visitorPassportIssuedBy ? `${base} · ${pass.visitorPassportIssuedBy}` : base;
}

function InfoRow({
  icon: Icon,
  label,
  value,
  mono,
  trailing,
}: {
  icon?: typeof User;
  label: string;
  value?: React.ReactNode;
  mono?: boolean;
  trailing?: React.ReactNode;
}) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="pass-detail__row">
      <dt className="pass-detail__label">
        {Icon && <Icon className="w-3 h-3 shrink-0 opacity-70" aria-hidden />}
        {label}
      </dt>
      <dd className={`pass-detail__value ${mono ? 'font-mono' : ''}`}>
        <span className="min-w-0 break-words">{value}</span>
        {trailing}
      </dd>
    </div>
  );
}

interface PassDetailPanelProps {
  pass: Pass;
  labels?: UiLabels;
  showCreator?: boolean;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  onPassUpdated?: (pass: Pass) => void;
}

export function PassDetailPanel({
  pass,
  labels: labelsProp,
  showCreator,
  actions,
  children,
  onPassUpdated,
}: PassDetailPanelProps) {
  const config = useConfig();
  const { user } = useAuth();
  const labels = labelsProp || getUiLabels(config);
  const overdueKind = getGuestOverdueKind(pass);
  const stillInside = overdueKind !== null;
  const isTerminal = ['rejected', 'cancelled', 'expired', 'completed'].includes(pass.status);
  const visitWindow = pass.visitTimeFrom
    ? `${pass.visitTimeFrom}${pass.visitTimeTo ? ` – ${pass.visitTimeTo}` : ''}`
    : null;
  const passport = formatPassport(pass);

  const canSeeHistory = canViewAllPasses(user) || canUseReception(user) || hasPermission(user, 'admin.panel');
  const canEditPassport = canUseReception(user) || hasPermission(user, 'passes.approve') || hasPermission(user, 'admin.panel');

  const visitorHistoryHref = buildHistoryHref({
    scope: 'visitor',
    visitorName: pass.visitorName,
    visitorPhone: pass.visitorPhone,
    visitorPassportSeries: pass.visitorPassportSeries,
    visitorPassportNumber: pass.visitorPassportNumber,
  });

  const officeLabel = [
    `${labels.card.office} ${pass.office}`,
    pass.floor ? `${pass.floor} ${labels.card.floorSuffix}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <div className={`${getPassCardShellClass({ overdue: stillInside })} pass-detail min-w-0 max-w-full overflow-visible`}>
      <div className="flex items-stretch min-w-0 w-full">
        <div className={getPassStatusStripeClass(pass.status, stillInside)} aria-hidden />

        <div className="pass-card__body min-w-0">
          {overdueKind && (
            <div className="px-4 py-2.5 theme-alert-subtle border-b text-xs pass-card__alert">
              <span className="pass-card__alert-msg">{getOverdueCardMessage(overdueKind, pass, labels)}</span>
            </div>
          )}

          {/* Header */}
          <div className="px-4 pt-4 pb-3 bg-gradient-surface border-b border-[var(--border)]">
            <div className="flex items-start gap-3 min-w-0">
              <div className={`shrink-0 ${getPassIconTileClass(pass.status, stillInside)} w-11 h-11`}>
                <User className="w-5 h-5" />
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="pass-card__title text-lg leading-snug" title={pass.visitorName}>
                  {pass.visitorName}
                </h3>

                <div className="pass-card__badges mt-1.5">
                  <StatusBadge
                    status={pass.status}
                    labels={labels}
                    size="sm"
                    overdueKind={overdueKind}
                  />
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--muted)] max-w-full min-w-0 truncate">
                    {TYPE_LABELS[pass.passType as PassType] || pass.passType}
                  </span>
                </div>

                <div className="flex items-center gap-0.5 mt-2 min-w-0">
                  <span className="pass-card__mono text-sm font-semibold text-[var(--text)]" title={pass.passNumber}>
                    {pass.passNumber}
                  </span>
                  <CopyButton value={pass.passNumber} title={labels.buttons.copyNumber} />
                </div>

                {canSeeHistory && (
                  <div className="mt-1.5">
                    <HistoryLink href={visitorHistoryHref} label="История визитов" />
                  </div>
                )}
              </div>

              {/* Office highlight */}
              <div className="pass-detail__office shrink-0 text-center pl-3 border-l border-[var(--border)] min-w-[3.25rem]">
                <div className="text-[9px] uppercase tracking-wide text-[var(--muted)] leading-none mb-1">
                  {labels.card.office}
                </div>
                <div className="text-2xl font-bold leading-none tabular-nums text-[var(--text)]" title={pass.office}>
                  {pass.office}
                </div>
                {pass.floor && (
                  <div className="text-[11px] text-[var(--muted)] mt-1 leading-none">
                    {pass.floor} {labels.card.floorSuffix}
                  </div>
                )}
              </div>
            </div>

            {/* Quick links */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {canSeeHistory && pass.officeId ? (
                <Link
                  href={buildHistoryHref({ scope: 'office', officeId: pass.officeId, officeLabel: pass.office })}
                  className="pass-detail__chip"
                  title={`История офиса ${pass.office}`}
                >
                  <MapPin className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
                  {officeLabel}
                </Link>
              ) : (
                <span className="pass-detail__chip" title={officeLabel}>
                  <MapPin className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
                  {officeLabel}
                </span>
              )}
              <span className="pass-detail__chip" title={`${pass.visitDate}${visitWindow ? ` · ${visitWindow}` : ''}`}>
                <Calendar className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
                {pass.visitDate}
                {visitWindow && <span className="text-[var(--muted)]"> · {visitWindow}</span>}
              </span>
              <Link
                href={`/ticket/${encodeURIComponent(pass.passNumber)}`}
                target="_blank"
                className="pass-detail__chip pass-detail__chip--action"
              >
                <QrCode className="w-3.5 h-3.5 shrink-0" />
                {labels.buttons.qrPass}
                <ExternalLink className="w-3 h-3 opacity-50 shrink-0" />
              </Link>
            </div>
          </div>

          {/* Optional actions (e.g. share/print on /passes) — not reception check-in */}
          {actions && (
            <div
              className="pass-card__actions pass-card__actions--stack px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-muted)]"
              onClick={(e) => e.stopPropagation()}
            >
              {actions}
            </div>
          )}

          {/* Timeline */}
          {passShowsVisitTimeline(pass) && (
            <div className={`pass-card__timeline px-4 py-3.5 border-b border-[var(--border)] ${isTerminal ? 'bg-[var(--surface-muted)]' : 'bg-[var(--surface)]'}`}>
              <p className="text-[10px] uppercase tracking-wide text-[var(--muted)] mb-2.5 font-medium">
                {labels.passes.detailTimeline}
              </p>
              <PassVisitTimeline pass={pass} labels={labels} overdue={stillInside} />
            </div>
          )}

          {/* Details */}
          <dl className="pass-detail__list px-4 py-1">
            {pass.companyName && (
              <InfoRow
                icon={Building2}
                label={labels.card.company}
                value={
                  canSeeHistory ? (
                    <Link
                      href={buildHistoryHref({ scope: 'company', companyName: pass.companyName })}
                      className="text-link hover:underline"
                    >
                      {pass.companyName}
                    </Link>
                  ) : (
                    pass.companyName
                  )
                }
              />
            )}

            {pass.businessCenterName && (
              <InfoRow
                icon={Building2}
                label={labels.card.businessCenter}
                value={
                  canSeeHistory && pass.propertyId ? (
                    <Link
                      href={buildHistoryHref({
                        scope: 'bc',
                        propertyId: pass.propertyId,
                        bcName: pass.businessCenterName,
                      })}
                      className="text-link hover:underline"
                    >
                      {pass.businessCenterName}
                    </Link>
                  ) : (
                    pass.businessCenterName
                  )
                }
              />
            )}

            {pass.visitorPhone && (
              <InfoRow
                icon={Phone}
                label={labels.card.phone}
                value={
                  <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <a href={`tel:${pass.visitorPhone}`} className="text-link hover:underline font-medium">
                      {pass.visitorPhone}
                    </a>
                    {canSeeHistory && (
                      <HistoryLink
                        href={buildHistoryHref({ scope: 'visitor', visitorPhone: pass.visitorPhone })}
                        label="история"
                      />
                    )}
                  </span>
                }
              />
            )}

            {passport && (
              <InfoRow
                icon={IdCard}
                label="Паспорт"
                value={passport}
              />
            )}

            {pass.vehiclePlate && (
              <InfoRow
                icon={Car}
                label={labels.card.vehicle}
                mono
                value={`${pass.vehiclePlate}${pass.vehicleModel ? ` · ${pass.vehicleModel}` : ''}`}
              />
            )}

            {showCreator && (pass.creatorName || pass.creatorPhone || pass.creatorCompany) && (
              <div className="pass-detail__row pass-detail__row--block">
                <dt className="pass-detail__label">
                  <UserCircle className="w-3 h-3 shrink-0 opacity-70" aria-hidden />
                  {labels.card.orderedBy}
                </dt>
                <dd className="pass-detail__value pass-detail__value--stack">
                  {pass.creatorName && (
                    <span className="font-medium break-words">{pass.creatorName}</span>
                  )}
                  {pass.creatorPhone && (
                    <a href={`tel:${pass.creatorPhone}`} className="inline-flex items-center gap-1.5 text-link hover:underline text-sm">
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      {pass.creatorPhone}
                    </a>
                  )}
                  {pass.creatorCompany && (
                    <span className="text-[var(--muted)] text-xs break-words">{pass.creatorCompany}</span>
                  )}
                </dd>
              </div>
            )}

            {pass.comment && (
              <div className="pass-detail__row pass-detail__row--block">
                <dt className="pass-detail__label">
                  <MessageSquare className="w-3 h-3 shrink-0 opacity-70" aria-hidden />
                  {labels.card.comment}
                </dt>
                <dd className="pass-detail__note">
                  {pass.comment}
                </dd>
              </div>
            )}

            {pass.rejectionReason && (
              <div className="pass-detail__row pass-detail__row--block">
                <dt className="pass-detail__label pass-detail__label--danger">
                  <MessageSquare className="w-3 h-3 shrink-0" aria-hidden />
                  {labels.card.rejectionReason}
                </dt>
                <dd className="pass-detail__note pass-detail__note--danger">
                  {pass.rejectionReason}
                </dd>
              </div>
            )}
          </dl>

          {canEditPassport && onPassUpdated && (
            <PassVisitorDataForm pass={pass} onUpdated={onPassUpdated} />
          )}

          {children}
        </div>
      </div>
    </div>
  );
}
