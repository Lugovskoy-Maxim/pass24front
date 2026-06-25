'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { api, PublicPassTicket } from '@/lib/api';
import { PassTicketView } from '@/components/PassTicketView';
import { useAuth } from '@/lib/auth';

export default function PassTicketPage() {
  const params = useParams();
  const passNumber = decodeURIComponent(params.passNumber as string);
  const { user } = useAuth();
  const [ticket, setTicket] = useState<PublicPassTicket | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError('');
    api.getPublicTicket(passNumber)
      .then(({ ticket: t }) => setTicket(t))
      .catch((err) => setError(err instanceof Error ? err.message : 'Пропуск не найден'))
      .finally(() => setLoading(false));
  }, [passNumber]);

  const backHref = user?.role === 'tenant' ? '/templates' : user ? '/passes' : '/login';

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="bg-[var(--primary)] text-white px-4 py-4">
        <div className="max-w-md mx-auto flex items-center gap-2">
          <Building2 className="w-5 h-5" />
          <span className="font-semibold">PASS24</span>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center text-[var(--muted)] animate-pulse">Загрузка пропуска...</div>
        ) : error ? (
          <div className="card p-8 text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <Link href={backHref} className="btn btn-secondary">На главную</Link>
          </div>
        ) : ticket ? (
          <>
            <PassTicketView ticket={ticket} enableEmailShare={!!user} />
            {user && (
              <div className="mt-6 text-center">
                <Link href={backHref} className="btn btn-primary">
                  {user.role === 'tenant' ? 'К шаблонам' : 'К списку пропусков'}
                </Link>
              </div>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}