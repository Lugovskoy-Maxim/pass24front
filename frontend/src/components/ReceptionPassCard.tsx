'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Building2,
  Car,
  CheckCircle,
  Clock,
  Copy,
  Check,
  LogIn,
  MapPin,
  MessageSquare,
  Package,
  Phone,
  QrCode,
  User,
  UserCircle,
  Wrench,
  XCircle,
} from 'lucide-react';
import { Pass, PassStatus, PassType, TYPE_LABELS } from '@/lib/api';
import { PassVisitTimeline } from './PassVisitTimeline';

const TYPE_ICONS: Record<PassType, typeof User> = {
  visitor: User,
  parking: Car,
  delivery: Package,
  contractor: Wrench,
};

export const RECEPTION_SECTIONS: {
  key: PassStatus;
  title: string;
  icon: typeof AlertCircle;
  iconClass: string;
  dimmed?: boolean;
}[] = [
  { key: 'pending', title: 'На рассмотрении', icon: AlertCircle, iconClass: 'text-amber-600' },
  { key: 'approved', title: 'Ожидают въезда', icon: Clock, iconClass: 'text-blue-600' },
  { key: 'active', title: 'В здании', icon: LogIn, iconClass: 'text-emerald-600' },
  { key: 'completed', title: 'Завершённые', icon: CheckCircle, iconClass: 'text-slate-500', dimmed: true },
  { key: 'expired', title: 'Истёкшие', icon: Clock, iconClass: 'text-gray-500', dimmed: true },
  { key: 'rejected', title: 'Отклонённые', icon: XCircle, iconClass: 'text-red-500', dimmed: true },
  { key: 'cancelled', title: 'Отменённые', icon: XCircle, iconClass: 'text-gray-500', dimmed: true },
];

interface ReceptionPassCardProps {
  pass: Pass;
  actions?: React.ReactNode;
  highlight?: boolean;
  dimmed?: boolean;
}

function CopyPassNumber({ passNumber }: { passNumber: string }) {
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
      className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--primary)] hover:bg-slate-100 transition-colors"
      title="Скопировать номер"
    >
      {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

export function ReceptionPassCard({ pass, actions, highlight, dimmed }: ReceptionPassCardProps) {
  const Icon = TYPE_ICONS[pass.passType];
  const visitWindow = pass.visitTimeFrom
    ? `${pass.visitTimeFrom}${pass.visitTimeTo ? ` – ${pass.visitTimeTo}` : ''}`
    : null;

  const isTerminal = ['rejected', 'cancelled', 'expired', 'completed'].includes(pass.status);

  return (
    <article
      className={[
        'card overflow-hidden transition-shadow',
        highlight ? 'ring-2 ring-[var(--primary)] ring-offset-2' : '',
        dimmed ? 'opacity-85' : 'hover:shadow-md',
        pass.status === 'active' ? 'border-emerald-200 shadow-emerald-50/50' : '',
        pass.status === 'pending' ? 'border-amber-200' : '',
      ].filter(Boolean).join(' ')}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-[var(--border)] bg-gradient-to-b from-slate-50/80 to-white">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-white border border-[var(--border)] flex items-center justify-center shrink-0 shadow-sm">
            <Icon className="w-6 h-6 text-[var(--primary)]" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold text-xl leading-tight truncate">{pass.visitorName}</h3>
              <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-white border border-[var(--border)] text-[var(--muted)]">
                {TYPE_LABELS[pass.passType]}
              </span>
            </div>

            <div className="flex items-center gap-1 mt-1">
              <span className="font-mono text-lg font-bold text-[var(--primary)]">{pass.passNumber}</span>
              <CopyPassNumber passNumber={pass.passNumber} />
              <Link
                href={`/ticket/${encodeURIComponent(pass.passNumber)}`}
                target="_blank"
                className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--primary)] hover:bg-slate-100"
                title="QR-пропуск"
              >
                <QrCode className="w-4 h-4" />
              </Link>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Офис</div>
            <div className="text-3xl font-bold leading-none text-[var(--primary)]">{pass.office}</div>
            {pass.floor && <div className="text-xs text-[var(--muted)] mt-0.5">{pass.floor} эт.</div>}
          </div>
        </div>

        {(pass.businessCenterName || pass.companyName) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-[var(--muted)]">
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
      </div>

      {/* Timeline */}
      <div className={`px-3 sm:px-5 py-4 ${isTerminal ? 'bg-slate-50/50' : 'bg-white'}`}>
        <PassVisitTimeline pass={pass} />
      </div>

      {/* Details */}
      <div className="px-4 py-3 border-t border-[var(--border)] bg-slate-50/30">
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-1.5 text-[var(--text)]">
            <Clock className="w-3.5 h-3.5 text-[var(--muted)]" />
            {pass.visitDate}
            {visitWindow && <span className="text-[var(--muted)]">· {visitWindow}</span>}
          </span>

          {pass.visitorPhone && (
            <a href={`tel:${pass.visitorPhone}`} className="inline-flex items-center gap-1.5 text-[var(--primary)] hover:underline">
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

          {(pass.creatorName || pass.creatorCompany) && (
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
      </div>

      {/* Actions */}
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
}