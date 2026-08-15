'use client';

import { useMemo, useState } from 'react';
import QRCode from 'react-qr-code';
import {
  Building2,
  Calendar,
  Clock,
  MapPin,
  Navigation,
  QrCode,
} from 'lucide-react';
import {
  buildMapsRouteUrl,
  openMapsRoute,
  PublicPassTicket,
  TYPE_LABELS,
  PassType,
} from '@/lib/api';
import { useConfig } from '@/hooks/useConfig';
import { getUiLabels } from '@/lib/ui-labels';
import {
  getPassCardShellClass,
  getPassStatusTopStripeClass,
} from '@/lib/pass-status';
import { SharePassActions } from './SharePassActions';
import { passShowsVisitTimeline } from '@/lib/pass-checkout';
import { PassVisitTimeline } from './PassVisitTimeline';
import { PassNumber } from './PassNumber';
import { isShortOfficeCode } from '@/lib/pass-display';

interface PassTicketViewProps {
  ticket: PublicPassTicket;
  enableEmailShare?: boolean;
  fallbackBusinessCenterName?: string;
  compact?: boolean;
}

export function PassTicketView({
  ticket,
  enableEmailShare = false,
  fallbackBusinessCenterName,
  compact = true,
}: PassTicketViewProps) {
  const config = useConfig();
  const labels = getUiLabels(config);
  const [qrOpen, setQrOpen] = useState(false);

  const businessCenterName =
    ticket.businessCenterName ||
    fallbackBusinessCenterName ||
    labels.ticket.defaultBcName;
  const businessCenterAddress =
    ticket.businessCenterAddress?.trim() ||
    config?.businessCenters
      ?.find((bc) => bc.name === businessCenterName)
      ?.address?.trim() ||
    '';

  const routeProvider =
    ticket.routeMapsProvider ||
    config?.businessCenters?.find((bc) => bc.name === businessCenterName)
      ?.routeMapsProvider ||
    'yandex';

  const ticketUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/ticket/${encodeURIComponent(ticket.passNumber)}`;
  }, [ticket.passNumber]);

  const visitWindow = ticket.visitTimeFrom
    ? `${ticket.visitTimeFrom}${ticket.visitTimeTo ? ` – ${ticket.visitTimeTo}` : ''}`
    : null;

  const isTerminal = ['rejected', 'cancelled', 'expired', 'completed'].includes(
    ticket.status,
  );

  const typeLabel = TYPE_LABELS[ticket.passType as PassType] || ticket.passType;
  const qrSize = compact ? 112 : 180;
  const companyLogo = ticket.companyLogo?.trim();
  const companyName = ticket.companyName?.trim();
  const routeUrl = businessCenterAddress
    ? buildMapsRouteUrl(businessCenterAddress, routeProvider)
    : '';

  return (
    <div
      className={`pass-ticket ${compact ? 'pass-ticket--compact' : ''} max-w-md mx-auto min-w-0 w-full`}
    >
      <article
        className={`${getPassCardShellClass()} pass-ticket__card min-w-0 max-w-full overflow-hidden`}
      >
        <div
          className={getPassStatusTopStripeClass(ticket.status)}
          aria-hidden
        />

        <header className="pass-ticket__header text-center border-b border-[var(--border)] bg-gradient-surface">
          <div className="inline-flex items-baseline justify-center gap-1.5 text-[var(--text)] max-w-full min-w-0 px-1">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-[var(--muted)] shrink-0">
              {labels.card.businessCenterAbbr}
            </span>
            <span
              className="font-bold leading-tight truncate pass-ticket__bc-name"
              title={businessCenterName}
            >
              {businessCenterName}
            </span>
          </div>
          {businessCenterAddress ? (
            <p
              className="text-[11px] text-[var(--muted)] mt-1 leading-snug px-2 break-words"
              title={businessCenterAddress}
            >
              <MapPin className="w-3 h-3 inline-block mr-0.5 -mt-0.5" />
              {businessCenterAddress}
            </p>
          ) : null}
          <p className="text-[10px] text-[var(--muted)] mt-0.5">
            {labels.card.electronicPass}
          </p>
        </header>

        <section className="pass-ticket__guest text-center border-b border-[var(--border)]">
          <h1
            className="pass-ticket__name font-bold leading-snug break-words max-w-full"
            title={ticket.visitorName}
          >
            {ticket.visitorName}
          </h1>
          <div className="pass-ticket__number mt-1 flex justify-center">
            <PassNumber value={ticket.passNumber} size="lg" />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1.5 pass-ticket__badges">
            <span className="text-[10px] px-2 py-0.5 rounded-[var(--radius-sm)] surface-muted border border-[var(--border)] text-[var(--muted)]">
              {typeLabel}
            </span>
          </div>
        </section>

        <section className="pass-ticket__meta grid grid-cols-2 gap-2 border-b border-[var(--border)] bg-[var(--surface-muted)]">
          <div className="col-span-2 pass-ticket__office-block py-0.5">
            <div className="text-[9px] uppercase tracking-wide text-[var(--muted)]">
              {labels.card.office}
            </div>
            <div
              className={
                isShortOfficeCode(ticket.office)
                  ? 'pass-ticket__office-number'
                  : 'pass-ticket__office-number pass-ticket__office-number--name'
              }
              title={ticket.office || undefined}
            >
              {ticket.office || '—'}
            </div>
            {(ticket.floor || businessCenterName) && (
              <div className="pass-ticket__office-meta">
                {ticket.floor ? (
                  <span>
                    {ticket.floor} {labels.card.floorSuffix}
                  </span>
                ) : null}
                {ticket.floor && businessCenterName ? <span> · </span> : null}
                {businessCenterName ? (
                  <span className="pass-ticket__office-bc">
                    {businessCenterName}
                  </span>
                ) : null}
              </div>
            )}
          </div>
          <div className="flex items-start gap-1.5 text-xs min-w-0">
            <Calendar className="w-3.5 h-3.5 text-[var(--muted)] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-[9px] uppercase tracking-wide text-[var(--muted)]">
                {labels.card.visitDate}
              </div>
              <div className="font-medium">{ticket.visitDate}</div>
            </div>
          </div>
          {visitWindow ? (
            <div className="flex items-start gap-1.5 text-xs min-w-0">
              <Clock className="w-3.5 h-3.5 text-[var(--muted)] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-wide text-[var(--muted)]">
                  Время
                </div>
                <div className="font-medium">{visitWindow}</div>
              </div>
            </div>
          ) : (
            companyName && <div className="col-span-1" />
          )}
          {companyName && (
            <div className="flex items-start gap-2 text-xs col-span-2 min-w-0">
              {companyLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={companyLogo}
                  alt=""
                  className="w-8 h-8 object-contain shrink-0 mt-0.5"
                />
              ) : (
                <Building2 className="w-3.5 h-3.5 text-[var(--muted)] shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-wide text-[var(--muted)]">
                  {labels.card.company}
                </div>
                <div className="font-medium truncate" title={companyName}>
                  {companyName}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="pass-ticket__qr border-b border-[var(--border)] space-y-3">
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="btn btn-secondary w-full text-sm inline-flex items-center justify-center gap-2"
              onClick={() => setQrOpen((v) => !v)}
              aria-expanded={qrOpen}
            >
              <QrCode className="w-4 h-4 shrink-0" />
              {qrOpen ? labels.buttons.hideQr : labels.buttons.showQr}
            </button>

            {qrOpen && ticketUrl && (
              <div className="space-y-2 animate-in fade-in">
                {!compact && (
                  <p className="text-center text-sm text-[var(--muted)] leading-relaxed">
                    {labels.ticket.hint}
                  </p>
                )}
                <div className="flex justify-center">
                  <div className="pass-ticket__qr-frame bg-[var(--surface-elevated)] rounded-xl border border-[var(--border)] shadow-sm p-3">
                    <QRCode value={ticketUrl} size={qrSize} level="M" />
                  </div>
                </div>
                {compact && (
                  <p className="pass-ticket__hint text-center text-[var(--muted)] leading-snug">
                    {labels.ticket.hint}
                  </p>
                )}
              </div>
            )}

            {!qrOpen && (
              <p className="text-center text-[10px] text-[var(--muted)] leading-snug">
                {labels.ticket.showQrHint}
              </p>
            )}
          </div>

          {routeUrl ? (
            <a
              href={routeUrl}
              className="btn btn-primary w-full text-sm inline-flex items-center justify-center gap-2"
              onClick={(e) => {
                e.preventDefault();
                openMapsRoute(routeUrl);
              }}
            >
              <Navigation className="w-4 h-4 shrink-0" />
              {labels.buttons.buildRoute}
            </a>
          ) : null}
        </section>

        {passShowsVisitTimeline(ticket) && (
          <section
            className={`pass-ticket__timeline pass-card__timeline ${isTerminal ? 'bg-[var(--surface-muted)]' : 'bg-[var(--surface)]'}`}
          >
            <PassVisitTimeline pass={ticket} labels={labels} compact />
          </section>
        )}

        <footer className="pass-ticket__footer border-t border-[var(--border)] bg-[var(--surface)]">
          <SharePassActions
            passIdOrNumber={ticket.passNumber}
            showQrLink={false}
            ticketLayout
            enableEmailShare={enableEmailShare}
          />
        </footer>
      </article>

      <p className="pass-ticket__footer-note text-center text-[var(--muted)] leading-snug">
        {labels.ticket.footer}
      </p>
    </div>
  );
}
