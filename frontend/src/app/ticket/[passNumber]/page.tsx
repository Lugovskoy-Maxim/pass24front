'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { api, PublicPassTicket, getErrorMessage } from '@/lib/api';
import { PageError } from '@/components/PageError';
import { PassTicketView } from '@/components/PassTicketView';
import { PassTicketStaffPanel } from '@/components/PassTicketStaffPanel';
import { SiteBrand } from '@/components/SiteBrand';
import { useAuth } from '@/lib/auth';
import { useConfig } from '@/hooks/useConfig';
import { getUiLabels } from '@/lib/ui-labels';
import { useTheme } from '@/components/ThemeProvider';
import { ThemeToggle } from '@/components/ThemeToggle';
import { canManageTicketScan, canViewPasses, getHomePath, isTenantCompanyUser } from '@/lib/permissions';

export default function PassTicketPage() {
  const params = useParams();
  const passNumber = decodeURIComponent(params.passNumber as string);
  const { user } = useAuth();
  const config = useConfig();
  const labels = getUiLabels(config);
  const { theme } = useTheme();
  const [ticket, setTicket] = useState<PublicPassTicket | null>(null);
  const [error, setError] = useState('');
  const [errorCause, setErrorCause] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const homePath = getHomePath(user);
  const showStaffPanel = canManageTicketScan(user);
  const backHref = user && canViewPasses(user) ? '/passes' : homePath;
  const backLabel = user && canViewPasses(user)
    ? labels.buttons.backToPasses
    : isTenantCompanyUser(user)
      ? labels.buttons.backToTemplates
      : labels.buttons.backToPasses;

  const loadTicket = useCallback(() => {
    setLoading(true);
    setError('');
    setErrorCause(null);
    return api.getPublicTicket(passNumber)
      .then(({ ticket: t }) => setTicket(t))
      .catch((err) => {
        setErrorCause(err);
        setError(getErrorMessage(err, labels.ticketPage.notFound));
      })
      .finally(() => setLoading(false));
  }, [passNumber, labels.ticketPage.notFound]);

  useEffect(() => {
    loadTicket();
  }, [loadTicket]);

  return (
    <div className={`pass-ticket-page min-h-[100dvh] bg-[var(--bg)] ${showStaffPanel ? 'pass-ticket-page--staff' : ''}`}>
      <header className="pass-ticket-page__header border-b" style={{ background: 'var(--header-bg)', borderColor: 'var(--header-border)' }}>
        <div className="pass-ticket-page__header-inner flex items-center justify-between gap-2">
          <Link
            href={homePath}
            className="pass-ticket-page__brand min-w-0 rounded-md transition-opacity hover:opacity-85 active:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            aria-label={labels.ticketPage.home}
          >
            <SiteBrand config={config} size="sm" variant={theme === 'dark' ? 'dark' : 'light'} />
          </Link>
          <ThemeToggle compact />
        </div>
      </header>

      <main className="pass-ticket-page__main">
        {loading ? (
          <div className="text-center text-[var(--muted)] animate-pulse text-sm py-8">{labels.ticketPage.loading}</div>
        ) : error ? (
          <div className="space-y-3">
            <PageError message={error} error={errorCause} onRetry={loadTicket} retryLabel={labels.buttons.retry} />
            <div className="text-center">
              <Link href={homePath} className="btn btn-secondary text-sm">{labels.ticketPage.home}</Link>
            </div>
          </div>
        ) : ticket ? (
          <>
            <PassTicketView
              ticket={ticket}
              enableEmailShare={!!user && !showStaffPanel}
              fallbackBusinessCenterName={config?.businessCenterName}
              compact
            />
            {showStaffPanel && (
              <PassTicketStaffPanel passNumber={passNumber} onPassUpdated={loadTicket} />
            )}
            {user && !showStaffPanel && (
              <div className="mt-4 text-center">
                <Link href={backHref} className="btn btn-primary text-sm">
                  {backLabel}
                </Link>
              </div>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}