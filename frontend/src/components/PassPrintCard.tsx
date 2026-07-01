'use client';

import { useMemo } from 'react';
import QRCode from 'react-qr-code';
import { Pass, TYPE_LABELS, getPassTicketUrl } from '@/lib/api';
import { useConfig } from '@/hooks/useConfig';
import { getUiLabels } from '@/lib/ui-labels';
import { getPassCardShellClass, getPassStatusTopStripeClass } from '@/lib/pass-status';
import { Building2, Printer } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

interface PassPrintCardProps {
  pass: Pass;
  businessCenterName?: string;
}

function PrintDetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div className="print-pass__row flex justify-between gap-4">
      <dt className="text-[var(--muted)] shrink-0">{label}</dt>
      <dd className="font-medium text-right break-words">{value}</dd>
    </div>
  );
}

export function PassPrintCard({ pass, businessCenterName }: PassPrintCardProps) {
  const config = useConfig();
  const labels = getUiLabels(config);
  const bcName = pass.businessCenterName || businessCenterName || labels.ticket.defaultBcName;

  const ticketUrl = useMemo(() => getPassTicketUrl(pass.passNumber), [pass.passNumber]);

  const visitTime = pass.visitTimeFrom
    ? `${pass.visitTimeFrom}${pass.visitTimeTo ? `–${pass.visitTimeTo}` : ''}`
    : undefined;

  const officeLine = `№${pass.office}${pass.floor ? `, ${pass.floor} ${labels.card.floorSuffix}` : ''}`;

  const vehicleLine = pass.vehiclePlate
    ? [pass.vehiclePlate, pass.vehicleModel].filter(Boolean).join(' · ')
    : undefined;

  const handlePrint = () => window.print();

  return (
    <div>
      <div className={`print-pass ${getPassCardShellClass()} p-6 max-w-md mx-auto`}>
        <div className={getPassStatusTopStripeClass(pass.status)} aria-hidden />

        <div className="text-center border-b border-[var(--border)] pb-4 mb-4">
          <div className="flex items-center justify-center gap-2 text-[var(--text)] mb-1">
            <Building2 className="w-5 h-5 shrink-0" />
            <span className="font-bold text-lg">{bcName}</span>
          </div>
          <div className="text-xs text-[var(--muted)]">{labels.print.guestPass}</div>
        </div>

        <div className="text-center mb-4">
          <div className="text-3xl font-mono font-bold tracking-wider text-[var(--text)]">{pass.passNumber}</div>
          <div className="mt-2 flex justify-center">
            <StatusBadge status={pass.status} labels={labels} />
          </div>
        </div>

        {ticketUrl && (
          <div className="print-pass__qr flex flex-col items-center gap-2 border-b border-[var(--border)] pb-4 mb-4">
            <div className="print-pass__qr-frame bg-white rounded-xl border border-[var(--border)] p-3">
              <QRCode value={ticketUrl} size={140} level="M" />
            </div>
            <p className="text-xs text-center text-[var(--muted)] max-w-[16rem] leading-snug">
              {labels.ticket.hint}
            </p>
          </div>
        )}

        <dl className="print-pass__details space-y-2 text-sm">
          <PrintDetailRow label={labels.card.visitor} value={pass.visitorName} />
          <PrintDetailRow label={labels.card.phone} value={pass.visitorPhone} />
          <PrintDetailRow label={labels.card.company} value={pass.companyName} />
          <PrintDetailRow
            label={labels.print.dateShort}
            value={visitTime ? `${pass.visitDate} ${visitTime}` : pass.visitDate}
          />
          <PrintDetailRow label={labels.card.office} value={officeLine} />
          <PrintDetailRow label={labels.card.type} value={TYPE_LABELS[pass.passType]} />
          <PrintDetailRow label={labels.card.visitPurposeShort} value={pass.visitPurpose} />
          <PrintDetailRow label={labels.card.vehicle} value={vehicleLine} />
          <PrintDetailRow label={labels.card.orderedBy} value={pass.creatorName} />
          <PrintDetailRow label={labels.card.comment} value={pass.comment} />
        </dl>
      </div>

      <button className="btn btn-secondary mt-4 mx-auto flex print:hidden" onClick={handlePrint}>
        <Printer className="w-4 h-4" />
        {labels.print.printButton}
      </button>
    </div>
  );
}