'use client';

import { Pass, TYPE_LABELS } from '@/lib/api';
import { useConfig } from '@/hooks/useConfig';
import { getUiLabels } from '@/lib/ui-labels';
import { getPassCardShellClass, getPassStatusTopStripeClass } from '@/lib/pass-status';
import { Building2, Printer } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

interface PassPrintCardProps {
  pass: Pass;
  businessCenterName?: string;
}

export function PassPrintCard({ pass, businessCenterName }: PassPrintCardProps) {
  const config = useConfig();
  const labels = getUiLabels(config);
  const bcName = businessCenterName || labels.ticket.defaultBcName;

  const handlePrint = () => window.print();

  return (
    <div>
      <div className={`print-pass ${getPassCardShellClass()} p-6 max-w-md mx-auto`}>
        <div className={getPassStatusTopStripeClass(pass.status)} aria-hidden />

        <div className="text-center border-b border-[var(--border)] pb-4 mb-4">
          <div className="flex items-center justify-center gap-2 text-[var(--text)] mb-1">
            <Building2 className="w-5 h-5" />
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

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--muted)]">{labels.card.visitor}</dt>
            <dd className="font-medium text-right">{pass.visitorName}</dd>
          </div>
          {pass.companyName && (
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted)]">{labels.card.company}</dt>
              <dd className="text-right">{pass.companyName}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--muted)]">{labels.print.dateShort}</dt>
            <dd className="text-right">
              {pass.visitDate}
              {pass.visitTimeFrom && ` ${pass.visitTimeFrom}–${pass.visitTimeTo}`}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--muted)]">{labels.card.office}</dt>
            <dd className="text-right">
              №{pass.office}
              {pass.floor && `, ${pass.floor} ${labels.card.floorSuffix}`}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--muted)]">{labels.card.type}</dt>
            <dd>{TYPE_LABELS[pass.passType]}</dd>
          </div>
          {pass.vehiclePlate && (
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted)]">{labels.card.vehicle}</dt>
              <dd className="font-mono text-right">{pass.vehiclePlate}</dd>
            </div>
          )}
        </dl>
      </div>

      <button className="btn btn-secondary mt-4 mx-auto flex print:hidden" onClick={handlePrint}>
        <Printer className="w-4 h-4" />
        {labels.print.printButton}
      </button>
    </div>
  );
}