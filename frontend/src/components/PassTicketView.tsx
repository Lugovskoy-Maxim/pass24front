'use client';

import { useMemo, useState } from 'react';
import QRCode from 'react-qr-code';
import { Building2, Copy, Check } from 'lucide-react';
import { PublicPassTicket, TYPE_LABELS } from '@/lib/api';
import { SharePassActions } from './SharePassActions';
import { StatusBadge } from './StatusBadge';
import { PassVisitTimeline } from './PassVisitTimeline';

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
  const businessCenterName = ticket.businessCenterName || fallbackBusinessCenterName || 'Бизнес-центр';
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

  const isTerminal = ['rejected', 'cancelled', 'expired', 'completed'].includes(ticket.status);

  return (
    <div className="max-w-md mx-auto">
      <div
        className={[
          'card overflow-hidden border-2',
          ticket.status === 'active' ? 'border-emerald-200' : '',
          ticket.status === 'pending' ? 'border-amber-200' : '',
          ticket.status === 'approved' ? 'border-blue-200' : '',
          !['active', 'pending', 'approved'].includes(ticket.status) ? 'border-[var(--primary)]' : '',
        ].filter(Boolean).join(' ')}
      >
        <div className="p-6 pb-0">
        <div className="text-center border-b border-[var(--border)] pb-4 mb-5">
          <div className="flex items-center justify-center gap-2 text-[var(--primary)] mb-1">
            <Building2 className="w-5 h-5" />
            <span className="font-bold text-lg">{businessCenterName}</span>
          </div>
          <div className="text-xs text-[var(--muted)]">Электронный пропуск</div>
        </div>

        <p className="text-center text-base font-medium leading-relaxed mb-6 px-1">
          Подойдите на стойку охраны и скажите своё ФИО или покажите QR-код
        </p>

        {ticketUrl && (
          <div className="flex justify-center mb-5">
            <div className="p-3 bg-white rounded-xl border border-[var(--border)]">
              <QRCode value={ticketUrl} size={200} level="M" />
            </div>
          </div>
        )}

        <div className="text-center mb-5">
          <div className="text-2xl font-bold">{ticket.visitorName}</div>
          <div className="text-xs text-[var(--muted)] mt-1 font-mono">{ticket.passNumber}</div>
          <div className="mt-2 flex justify-center">
            <StatusBadge status={ticket.status} />
          </div>
        </div>
        </div>

        <div className={`px-4 sm:px-6 py-4 border-t border-[var(--border)] ${isTerminal ? 'bg-slate-50/50' : 'bg-white'}`}>
          <PassVisitTimeline pass={ticket} />
        </div>

        <dl className="space-y-2 text-sm border-t border-[var(--border)] px-6 py-4">
          {ticket.companyName && (
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted)]">Компания</dt>
              <dd className="font-medium text-right">{ticket.companyName}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--muted)]">Дата визита</dt>
            <dd className="text-right">
              {ticket.visitDate}
              {ticket.visitTimeFrom && ` · ${ticket.visitTimeFrom}–${ticket.visitTimeTo}`}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--muted)]">Офис</dt>
            <dd className="text-right">
              №{ticket.office}
              {ticket.floor && `, ${ticket.floor} эт.`}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--muted)]">Тип</dt>
            <dd>{TYPE_LABELS[ticket.passType]}</dd>
          </div>
          {ticket.visitPurpose && (
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted)]">Цель</dt>
              <dd className="text-right">{ticket.visitPurpose}</dd>
            </div>
          )}
          {ticket.vehiclePlate && (
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted)]">Авто</dt>
              <dd className="font-mono">{ticket.vehiclePlate}</dd>
            </div>
          )}
        </dl>
      </div>

      {enableEmailShare ? (
        <div className="mt-4">
          <SharePassActions passIdOrNumber={ticket.passNumber} showQrLink={false} />
        </div>
      ) : ticketUrl ? (
        <button type="button" className="btn btn-secondary w-full mt-4" onClick={handleCopy}>
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Ссылка скопирована' : 'Скопировать ссылку на пропуск'}
        </button>
      ) : null}

      <p className="text-xs text-center text-[var(--muted)] mt-3">
        Сохраните эту страницу — ссылка постоянная и действует на дату визита
      </p>
    </div>
  );
}