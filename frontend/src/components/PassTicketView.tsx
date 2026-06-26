'use client';

import { useMemo, useState } from 'react';
import QRCode from 'react-qr-code';
import { Building2, Copy, Check } from 'lucide-react';
import { PublicPassTicket } from '@/lib/api';
import { useConfig } from '@/hooks/useConfig';
import { getPassCardBorderClass, getUiLabels } from '@/lib/ui-labels';
import { SharePassActions } from './SharePassActions';
import { PassCardBase } from './PassCardBase';

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

  return (
    <div className="max-w-md mx-auto">
      <div className={`card overflow-hidden border-2 ${getPassCardBorderClass(ticket.status)}`}>
        <div className="text-center border-b border-[var(--border)] bg-gradient-to-b from-slate-50/80 to-white px-4 py-4">
          <div className="flex items-center justify-center gap-2 text-[var(--primary)] mb-1">
            <Building2 className="w-5 h-5" />
            <span className="font-bold text-lg">{businessCenterName}</span>
          </div>
          <div className="text-xs text-[var(--muted)]">{labels.card.electronicPass}</div>
        </div>

        <PassCardBase
          pass={{ ...ticket, businessCenterName }}
          labels={labels}
          variant="full"
          bare
          showTimeline
          showStatusBadge
          showQrLink={false}
          headerExtra={
            <div className="mt-3 space-y-4">
              <p className="text-center text-sm text-[var(--muted)] leading-relaxed px-1">
                {labels.ticket.hint}
              </p>
              {ticketUrl && (
                <div className="flex justify-center">
                  <div className="p-3 bg-white rounded-xl border border-[var(--border)] shadow-sm">
                    <QRCode value={ticketUrl} size={200} level="M" />
                  </div>
                </div>
              )}
            </div>
          }
        />
      </div>

      {enableEmailShare ? (
        <div className="mt-4">
          <SharePassActions passIdOrNumber={ticket.passNumber} showQrLink={false} />
        </div>
      ) : ticketUrl ? (
        <button type="button" className="btn btn-secondary w-full mt-4" onClick={handleCopy}>
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? labels.buttons.linkCopied : labels.buttons.copyLink}
        </button>
      ) : null}

      <p className="text-xs text-center text-[var(--muted)] mt-3">
        {labels.ticket.footer}
      </p>
    </div>
  );
}