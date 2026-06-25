'use client';

import { Car, User, Package, Wrench, Clock, MapPin, Building2 } from 'lucide-react';
import { Pass, PassType, TYPE_LABELS } from '@/lib/api';
import { StatusBadge } from './StatusBadge';

const TYPE_ICONS: Record<PassType, typeof User> = {
  visitor: User,
  parking: Car,
  delivery: Package,
  contractor: Wrench,
};

interface PassCardProps {
  pass: Pass;
  actions?: React.ReactNode;
  onClick?: () => void;
  showCreator?: boolean;
}

export function PassCard({ pass, actions, onClick, showCreator }: PassCardProps) {
  const Icon = TYPE_ICONS[pass.passType];

  return (
    <div
      className={`card p-4 ${onClick ? 'cursor-pointer hover:border-[var(--accent)] transition-colors' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
            <Icon className="w-4 h-4 text-[var(--primary)]" />
          </div>
          <div>
            <div className="font-semibold">{pass.visitorName}</div>
            <div className="text-xs text-[var(--muted)]">{pass.passNumber}</div>
            {pass.companyName && (
              <div className="text-xs text-[var(--muted)] flex items-center gap-1 mt-0.5">
                <Building2 className="w-3 h-3" />{pass.companyName}
              </div>
            )}
            {showCreator && pass.creatorName && (
              <div className="text-xs text-[var(--muted)] mt-0.5">
                Заказал: {pass.creatorName}{pass.creatorCompany ? ` · ${pass.creatorCompany}` : ''}
              </div>
            )}
          </div>
        </div>
        <StatusBadge status={pass.status} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm text-[var(--muted)] mb-3">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>
            {pass.visitDate}
            {pass.visitTimeFrom && ` ${pass.visitTimeFrom}`}
            {pass.visitTimeTo && `–${pass.visitTimeTo}`}
          </span>
        </div>
        <div className="flex items-center gap-1.5 col-span-2">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span>
            {pass.businessCenterName && `${pass.businessCenterName} · `}
            оф. {pass.office}
            {pass.floor && `, ${pass.floor} эт.`}
          </span>
        </div>
      </div>

      {pass.visitPurpose && (
        <div className="text-xs text-[var(--muted)] mb-2">Цель: {pass.visitPurpose}</div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs px-2 py-0.5 bg-slate-100 rounded">{TYPE_LABELS[pass.passType]}</span>
        {pass.vehiclePlate && (
          <span className="text-sm font-mono font-medium">{pass.vehiclePlate}</span>
        )}
      </div>

      {actions && (
        <div
          className="mt-3 pt-3 border-t border-[var(--border)] flex gap-2 flex-wrap"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      )}
    </div>
  );
}