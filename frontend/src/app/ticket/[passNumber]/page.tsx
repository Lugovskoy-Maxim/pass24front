'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { api, PublicPassTicket, getErrorMessage } from '@/lib/api';
import { PageError } from '@/components/PageError';
import { PassTicketView } from '@/components/PassTicketView';
import { SiteBrand } from '@/components/SiteBrand';
import { useAuth } from '@/lib/auth';
import { useConfig } from '@/hooks/useConfig';
import { getUiLabels } from '@/lib/ui-labels';

export default function PassTicketPage() {
  const params = useParams();
  const passNumber = decodeURIComponent(params.passNumber as string);
  const { user } = useAuth();
  const config = useConfig();
  const labels = getUiLabels(config);
  const [ticket, setTicket] = useState<PublicPassTicket | null>(null);
  const [error, setError] = useState('');
  const [errorCause, setErrorCause] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const loadTicket = () => {
    setLoading(true);
    setError('');
    setErrorCause(null);
    api.getPublicTicket(passNumber)
      .then(({ ticket: t }) => setTicket(t))
      .catch((err) => {
        setErrorCause(err);
        setError(getErrorMessage(err, labels.ticketPage.notFound));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTicket();
  }, [passNumber]);

  const backHref = user?.role === 'tenant' ? '/templates' : user ? '/passes' : '/login';

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="px-4 py-4" style={{ background: 'var(--header-bg)' }}>
        <div className="max-w-md mx-auto">
          <SiteBrand config={config} size="sm" variant="dark" />
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center text-[var(--muted)] animate-pulse">{labels.ticketPage.loading}</div>
        ) : error ? (
          <div className="space-y-4">
            <PageError message={error} error={errorCause} onRetry={loadTicket} retryLabel={labels.buttons.retry} />
            <div className="text-center">
              <Link href={backHref} className="btn btn-secondary">{labels.ticketPage.home}</Link>
            </div>
          </div>
        ) : ticket ? (
          <>
            <PassTicketView
              ticket={ticket}
              enableEmailShare={!!user}
              fallbackBusinessCenterName={config?.businessCenterName}
            />
            {user && (
              <div className="mt-6 text-center">
                <Link href={backHref} className="btn btn-primary">
                  {user.role === 'tenant' ? labels.buttons.backToTemplates : labels.buttons.backToPasses}
                </Link>
              </div>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}