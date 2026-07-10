'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Pass } from '@/lib/api';
import { api, getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useConfig } from '@/hooks/useConfig';
import { canManageTicketScan, hasPermission, isAdminPanelUser } from '@/lib/permissions';
import { isAwaitingEntry } from '@/lib/pass-entry';
import { passRequiresCheckout } from '@/lib/pass-checkout';
import { getUiLabels } from '@/lib/ui-labels';
import { useToast } from '@/components/Toast';
import { PassVisitorDataForm } from '@/components/PassVisitorDataForm';

interface PassTicketStaffPanelProps {
  passNumber: string;
  onPassUpdated: () => void;
}

export function PassTicketStaffPanel({ passNumber, onPassUpdated }: PassTicketStaffPanelProps) {
  const { user } = useAuth();
  const config = useConfig();
  const labels = getUiLabels(config);
  const { toast } = useToast();
  const [pass, setPass] = useState<Pass | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const canManage = canManageTicketScan(user);
  const canReception = hasPermission(user, 'passes.reception') || isAdminPanelUser(user);

  const loadPass = useCallback(() => {
    if (!canManage) return;
    setLoading(true);
    api.lookupPass(passNumber)
      .then(({ pass: p }) => setPass(p))
      .catch(() => setPass(null))
      .finally(() => setLoading(false));
  }, [canManage, passNumber]);

  useEffect(() => {
    loadPass();
  }, [loadPass]);

  if (!canManage) return null;

  const handleAction = async (action: 'reject' | 'checkin' | 'checkout') => {
    if (!pass) return;
    setActionLoading(true);
    try {
      let updated: Pass;
      if (action === 'reject') {
        if (!rejectReason.trim()) {
          toast('Укажите причину отклонения', 'error');
          return;
        }
        ({ pass: updated } = await api.updateStatus(pass.id, 'rejected', rejectReason.trim()));
      } else if (action === 'checkin') ({ pass: updated } = await api.checkIn(pass.id));
      else ({ pass: updated } = await api.checkOut(pass.id));

      setPass(updated);
      setRejectReason('');
      onPassUpdated();
      const toastMsg = action === 'reject' ? labels.toasts.rejected
        : action === 'checkin' ? labels.toasts.checkedIn
        : labels.toasts.checkedOut;
      toast(toastMsg, 'success');
    } catch (err) {
      toast(getErrorMessage(err, 'Ошибка'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const hasActions = pass && canReception && (
    isAwaitingEntry(pass.status) || (pass.status === 'active' && passRequiresCheckout(pass))
  );

  return (
    <section className="pass-ticket-staff" aria-label="Действия ресепшн">
      <div className="pass-ticket-staff__inner card overflow-hidden">
        <div className="px-3 py-2.5 border-b border-[var(--border)] flex items-center gap-2 bg-[var(--surface-muted)]">
          <ShieldCheck className="w-4 h-4 text-[var(--accent)] shrink-0" />
          <span className="text-sm font-semibold">Ресепшн / охрана</span>
        </div>

        {loading && !pass ? (
          <p className="px-3 py-4 text-sm text-[var(--muted)] animate-pulse">Загрузка...</p>
        ) : !pass ? (
          <p className="px-3 py-4 text-sm text-[var(--muted)]">Нет доступа к управлению пропуском</p>
        ) : (
          <>
            {hasActions && (
              <div className="px-3 py-3 space-y-2 border-b border-[var(--border)] bg-[var(--surface-muted)]">
                {isAwaitingEntry(pass.status) && (
                  <>
                    <button
                      type="button"
                      className="btn btn-success w-full text-sm"
                      disabled={actionLoading}
                      onClick={() => handleAction('checkin')}
                    >
                      {labels.buttons.checkInBuilding}
                    </button>
                    <input
                      className="input text-sm"
                      placeholder={labels.reception.rejectPlaceholder}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-danger w-full text-sm"
                      disabled={actionLoading || !rejectReason.trim()}
                      onClick={() => handleAction('reject')}
                    >
                      {labels.buttons.reject}
                    </button>
                  </>
                )}
                {pass.status === 'active' && passRequiresCheckout(pass) && (
                  <button
                    type="button"
                    className="btn btn-primary w-full text-sm"
                    disabled={actionLoading}
                    onClick={() => handleAction('checkout')}
                  >
                    {labels.buttons.checkOut}
                  </button>
                )}
              </div>
            )}
            <PassVisitorDataForm
              pass={pass}
              onUpdated={(updated) => {
                setPass(updated);
                onPassUpdated();
              }}
            />
          </>
        )}
      </div>
    </section>
  );
}