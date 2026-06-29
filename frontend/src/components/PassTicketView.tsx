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
import { StatusBadge } from './StatusBadge';

interface PassTicketViewProps {
  ticket: PublicPassTicket;
  enableEmailShare?: boolean;
  fallbackBusinessCenterName?: string;
}

export function PassTicketView({
  ticket,
  enableEmailShare = false,
  fallbackBusinessCenterName,
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

  return (
    <div className="max-w-md mx-auto min-w-0 w-full px-2 sm:px-0">
      <article className={`${getPassCardShellClass()} min-w-0 max-w-full overflow-hidden`}>
        <div className={getPassStatusTopStripeClass(ticket.status)} aria-hidden />

        {/* Шапка БЦ */}
        <header className="text-center px-5 pt-5 pb-4 border-b border-[var(--border)] bg-gradient-surface">
          <div className="inline-flex items-center justify-center gap-2 text-[var(--text)] max-w-full min-w-0">
            <Building2 className="w-5 h-5 shrink-0" />
            <span className="font-bold text-lg leading-tight truncate" title={businessCenterName}>{businessCenterName}</span>
          </div>
          <p className="text-xs text-[var(--muted)] mt-1">{labels.card.electronicPass}</p>
        </header>

        {/* Гость */}
        <section className="px-5 pt-5 pb-4 text-center border-b border-[var(--border)]">
          <div className={`w-14 h-14 mx-auto mb-3 rounded-full ${getPassIconTileClass(ticket.status)}`}>
            <User className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold leading-snug break-words max-w-full" title={ticket.visitorName}>{ticket.visitorName}</h1>
          <p className="pass-card__mono text-sm text-[var(--text)] font-semibold mt-1" title={ticket.passNumber}>{ticket.passNumber}</p>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
            <StatusBadge status={ticket.status} labels={labels} />
            <span className="text-xs px-2.5 py-0.5 rounded-full surface-muted border border-[var(--border)] text-[var(--muted)]">
              {typeLabel}
            </span>
          </div>
        </section>

        {/* Ключевые данные */}
        <section className="px-5 py-4 grid grid-cols-2 gap-3 border-b border-[var(--border)] bg-[var(--surface-muted)]">
          <div className="col-span-2 flex items-center justify-center gap-4 text-sm flex-wrap min-w-0">
            <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--text)] min-w-0 max-w-full pass-card__chip" title={`${labels.card.office} ${ticket.office}${ticket.floor ? ` · ${ticket.floor} ${labels.card.floorSuffix}` : ''}`}>
              <MapPin className="w-4 h-4 shrink-0" />
              {labels.card.office} {ticket.office}
              {ticket.floor && ` · ${ticket.floor} ${labels.card.floorSuffix}`}
            </span>
          </div>
          <div className="flex items-start gap-2 text-sm min-w-0">
            <Calendar className="w-4 h-4 text-[var(--muted)] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{labels.card.visitDate}</div>
              <div className="font-medium">{ticket.visitDate}</div>
            </div>
          </div>
          {visitWindow && (
            <div className="flex items-start gap-2 text-sm min-w-0">
              <Clock className="w-4 h-4 text-[var(--muted)] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Время</div>
                <div className="font-medium">{visitWindow}</div>
              </div>
            </div>
          )}
          {ticket.companyName && (
            <div className="col-span-2 flex items-start gap-2 text-sm">
              <Building2 className="w-4 h-4 text-[var(--muted)] shrink-0 mt-0.5" />
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{labels.card.company}</div>
                <div className="font-medium">{ticket.companyName}</div>
              </div>
            </div>
          )}
          {ticket.visitPurpose && (
            <div className="col-span-2 text-sm text-center text-[var(--muted)]">
              {ticket.visitPurpose}
            </div>
          )}
        </section>

        {/* QR */}
        <section className="px-5 py-5 border-b border-[var(--border)]">
          <p className="text-center text-sm text-[var(--muted)] leading-relaxed mb-4">
            {labels.ticket.hint}
          </p>
          {ticketUrl && (
            <div className="flex justify-center">
              <div className="p-4 bg-[var(--surface-elevated)] rounded-2xl border border-[var(--border)] shadow-sm">
                <QRCode value={ticketUrl} size={180} level="M" />
              </div>
            </div>
          )}
        </section>

        {/* Timeline */}
        <section className={`pass-card__timeline px-4 py-4 ${isTerminal ? 'bg-[var(--surface-muted)]' : 'bg-[var(--surface)]'}`}>
          <PassVisitTimeline pass={ticket} labels={labels} compact />
        </section>

        {/* Действия */}
        <footer className="px-5 py-4 border-t border-[var(--border)] bg-[var(--surface)]">
          {enableEmailShare ? (
            <SharePassActions passIdOrNumber={ticket.passNumber} showQrLink={false} ticketLayout />
          ) : ticketUrl ? (
            <button type="button" className="btn btn-secondary w-full" onClick={handleCopy}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? labels.buttons.linkCopied : labels.buttons.copyLink}
            </button>
          ) : null}
        </footer>
      </article>

      <p className="text-xs text-center text-[var(--muted)] mt-4 px-2 leading-relaxed">
        {labels.ticket.footer}
      </p>
    </div>
  );
}