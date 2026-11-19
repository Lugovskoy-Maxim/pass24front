'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getErrorMessage, getToken } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { kioskApi } from '@/lib/kiosk';
import '../kiosk.css';

export default function KioskApprovalPage() {
  const { user, loading } = useAuth();
  const [code, setCode] = useState('');
  const [details, setDetails] = useState<{
    roomTitle: string;
    displayCode: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    setCode(window.location.hash.slice(1));
  }, []);

  useEffect(() => {
    if (!user) return;
    const token = getToken();
    if (!token || !/^[a-f0-9]{64}$/.test(code)) return;
    let active = true;
    void kioskApi
      .previewLogin(token, code)
      .then((result) => {
        if (active) setDetails(result);
      })
      .catch((e) => {
        if (active) setError(getErrorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [code, user]);

  async function approve() {
    const token = getToken();
    if (!token || busy || !details) return;
    setBusy(true);
    setError('');
    try {
      await kioskApi.approveLogin(token, code);
      window.history.replaceState(null, '', window.location.pathname);
      setApproved(true);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="kiosk kiosk-approval">
      <section className="kiosk-panel kiosk-checkout kiosk-stack">
        <h1>{approved ? 'Вход подтверждён' : 'Вход на планшете'}</h1>
        {approved ? (
          <p role="status">Продолжите бронирование на планшете.</p>
        ) : loading ? (
          <p role="status">Проверяем сессию Pass…</p>
        ) : !/^[a-f0-9]{64}$/.test(code) ? (
          <p>Отсканируйте QR-код с экрана планшета.</p>
        ) : !user ? (
          <>
            <p>
              Войдите в Pass в этом браузере, затем отсканируйте новый QR-код на
              планшете.
            </p>
            <Link className="btn btn-primary" href="/login">
              Войти в Pass
            </Link>
          </>
        ) : (
          <>
            {details ? (
              <>
                <p>
                  {details.roomTitle} · {user.full_name}
                </p>
                <p>Подтвердите вход, если на планшете показан этот код.</p>
                <strong className="kiosk-pair-code">
                  {details.displayCode}
                </strong>
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void approve()}
                >
                  {busy ? 'Подтверждаем…' : 'Подтвердить вход'}
                </button>
              </>
            ) : (
              !error && <p role="status">Проверяем QR-код…</p>
            )}
            {error && (
              <p className="kiosk-error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
