'use client';

import { Pass, TYPE_LABELS, STATUS_LABELS } from '@/lib/api';
import { Building2, Printer } from 'lucide-react';

interface PassPrintCardProps {
  pass: Pass;
  businessCenterName?: string;
}

export function PassPrintCard({ pass, businessCenterName = 'БЦ' }: PassPrintCardProps) {
  const handlePrint = () => window.print();

  return (
    <div>
      <div className="print-pass card p-6 border-2 border-[var(--primary)] max-w-md mx-auto">
        <div className="text-center border-b border-[var(--border)] pb-4 mb-4">
          <div className="flex items-center justify-center gap-2 text-[var(--primary)] mb-1">
            <Building2 className="w-5 h-5" />
            <span className="font-bold text-lg">{businessCenterName}</span>
          </div>
          <div className="text-xs text-[var(--muted)]">Гостевой пропуск</div>
        </div>

        <div className="text-center mb-4">
          <div className="text-3xl font-mono font-bold tracking-wider text-[var(--primary)]">{pass.passNumber}</div>
          <div className="text-xs text-[var(--muted)] mt-1">{STATUS_LABELS[pass.status]}</div>
        </div>

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-[var(--muted)]">Посетитель</dt><dd className="font-medium">{pass.visitorName}</dd></div>
          {pass.companyName && <div className="flex justify-between"><dt className="text-[var(--muted)]">Компания</dt><dd>{pass.companyName}</dd></div>}
          {pass.visitPurpose && <div className="flex justify-between"><dt className="text-[var(--muted)]">Цель</dt><dd>{pass.visitPurpose}</dd></div>}
          <div className="flex justify-between"><dt className="text-[var(--muted)]">Дата</dt><dd>{pass.visitDate} {pass.visitTimeFrom && `${pass.visitTimeFrom}–${pass.visitTimeTo}`}</dd></div>
          <div className="flex justify-between"><dt className="text-[var(--muted)]">Офис</dt><dd>№{pass.office}{pass.floor && `, ${pass.floor} эт.`}</dd></div>
          <div className="flex justify-between"><dt className="text-[var(--muted)]">Тип</dt><dd>{TYPE_LABELS[pass.passType]}</dd></div>
          {pass.vehiclePlate && <div className="flex justify-between"><dt className="text-[var(--muted)]">Авто</dt><dd className="font-mono">{pass.vehiclePlate}</dd></div>}
        </dl>
      </div>

      <button className="btn btn-secondary mt-4 mx-auto flex print:hidden" onClick={handlePrint}>
        <Printer className="w-4 h-4" />
        Печать пропуска
      </button>
    </div>
  );
}