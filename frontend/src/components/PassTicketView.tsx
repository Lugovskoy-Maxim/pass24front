'use client';

import { useMemo, useState } from 'react';
import QRCode from 'react-qr-code';
import {
  Building2,
  Calendar,
  Check,
  Clock,
  Copy,
  MapPin,
  User,
} from 'lucide-react';
import { PublicPassTicket, TYPE_LABELS, PassType } from '@/lib/api';
import { useConfig } from '@/hooks/useConfig';
import { getUiLabels } from '@/lib/ui-labels';
import {
  getPassCardShellClass,
  getPassIconTileClass,
  getPassStatusTopStripeClass,
} from '@/lib/pass-status';
import { SharePassActions } from './SharePassActions';
import { PassVisitTimeline } from './PassVisitTimeline';

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
  const businessCenterName = ticket.businessCenterName || fallbackBusinessCenterName || labels.ticket.defaultBcName;
  const [copied, setCopied] = useState(false);

  const ticketUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/ticket/${encodeURIComponent(ticket.passNumber)}`;
  }, [ticket.passNumber]);

  const visitWindow = ticket.visitTimeFrom
    ? `${ticket.visitTimeFrom}${ticket.visitTimeTo ? ` – ${ticket.visitTimeTo}` : ''}`
    : null;

  const isTerminal = ['rejected', 'cancelled', 'expired', 'completed'].includes(ticket.status);

  const handleCopy = async () => {
    if (!ticketUrl) return;
    try {
      await navigator.clipboard.writeText(ticketUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const typeLabel = TYPE_LABELS[ticket.passType as PassType] || ticket.passType;
  const qrSize = compact ? 112 : 180;

  return (
    <div className={`pass-ticket ${compact ? 'pass-ticket--compact' : ''} max-w-md mx-auto min-w-0 w-full`}>
      <article className={`${getPassCardShellClass()} pass-ticket__card min-w-0 max-w-full overflow-hidden`}>
        <div className={getPassStatusTopStripeClass(ticket.status)} aria-hidden />

        <header className="pass-ticket__header text-center border-b border-[var(--border)] bg-gradient-surface">
          <div className="inline-flex items-center justify-center gap-1.5 text-[var(--text)] max-w-full min-w-0">
            <Building2 className="w-4 h-4 shrink-0" />
            <span className="font-bold leading-tight truncate pass-ticket__bc-name" title={businessCenterName}>
              {businessCenterName}
            </span>
          </div>
          <p className="text-[10px] text-[var(--muted)] mt-0.5">{labels.card.electronicPass}</p>
        </header>

        <section className="pass-ticket__guest text-center border-b border-[var(--border)]">
          <div className={`pass-ticket__avatar mx-auto rounded-full ${getPassIconTileClass(ticket.status)}`}>
            <User className="pass-ticket__avatar-icon" />
          </div>
          <h1 className="pass-ticket__name font-bold leading-snug break-words max-w-full" title={ticket.visitorName}>
            {ticket.visitorName}
          </h1>
          <p className="pass-card__mono pass-ticket__number text-[var(--text)] font-semibold" title={ticket.passNumber}>
            {ticket.passNumber}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-1.5 pass-ticket__badges">
            <span className="text-[10px] px-2 py-0.5 rounded-full surface-muted border border-[var(--border)] text-[var(--muted)]">
              {typeLabel}
            </span>
          </div>
        </section>

        <section className="pass-ticket__meta grid grid-cols-2 gap-2 border-b border-[var(--border)] bg-[var(--surface-muted)]">
          <div className="col-span-2 flex items-center justify-center text-xs min-w-0">
            <span
              className="inline-flex items-center gap-1 font-semibold text-[var(--text)] min-w-0 max-w-full pass-card__chip"
              title={`${labels.card.office} ${ticket.office}${ticket.floor ? ` · ${ticket.floor} ${labels.card.floorSuffix}` : ''}`}
            >
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              {labels.card.office} {ticket.office}
              {ticket.floor && ` · ${ticket.floor} ${labels.card.floorSuffix}`}
            </span>
          </div>
          <div className="flex items-start gap-1.5 text-xs min-w-0">
            <Calendar className="w-3.5 h-3.5 text-[var(--muted)] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-[9px] uppercase tracking-wide text-[var(--muted)]">{labels.card.visitDate}</div>
              <div className="font-medium">{ticket.visitDate}</div>
            </div>
          </div>
          {visitWindow ? (
            <div className="flex items-start gap-1.5 text-xs min-w-0">
              <Clock className="w-3.5 h-3.5 text-[var(--muted)] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-wide text-[var(--muted)]">Время</div>
                <div className="font-medium">{visitWindow}</div>
              </div>
            </div>
          ) : (
            ticket.companyName && <div className="col-span-1" />
          )}
          {ticket.companyName && (
            <div className={`flex items-start gap-1.5 text-xs ${visitWindow ? 'col-span-2' : 'col-span-2'}`}>
              <Building2 className="w-3.5 h-3.5 text-[var(--muted)] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-wide text-[var(--muted)]">{labels.card.company}</div>
                <div className="font-medium truncate">{ticket.companyName}</div>
              </div>
            </div>
          )}
        </section>

        <section className="pass-ticket__qr border-b border-[var(--border)]">
          {!compact && (
            <p className="text-center text-sm text-[var(--muted)] leading-relaxed mb-3">
              {labels.ticket.hint}
            </p>
          )}
          {ticketUrl && (
            <div className="flex justify-center">
              <div className="pass-ticket__qr-frame bg-[var(--surface-elevated)] rounded-xl border border-[var(--border)] shadow-sm">
                <QRCode value={ticketUrl} size={qrSize} level="M" />
              </div>
            </div>
          )}
          {compact && (
            <p className="pass-ticket__hint text-center text-[var(--muted)] leading-snug">
              {labels.ticket.hint}
            </p>
          )}
        </section>

        <section className={`pass-ticket__timeline pass-card__timeline ${isTerminal ? 'bg-[var(--surface-muted)]' : 'bg-[var(--surface)]'}`}>
          <PassVisitTimeline pass={ticket} labels={labels} compact />
        </section>

        <footer className="pass-ticket__footer border-t border-[var(--border)] bg-[var(--surface)]">
          {enableEmailShare ? (
            <SharePassActions passIdOrNumber={ticket.passNumber} showQrLink={false} ticketLayout />
          ) : ticketUrl ? (
            <button type="button" className="btn btn-secondary w-full text-sm" onClick={handleCopy}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? labels.buttons.linkCopied : labels.buttons.copyLink}
            </button>
          ) : null}
        </footer>
      </article>

      <p className="pass-ticket__footer-note text-center text-[var(--muted)] leading-snug">
        {labels.ticket.footer}
      </p>
    </div>
  );
}