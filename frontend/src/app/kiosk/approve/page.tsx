'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  getErrorMessage,
  getErrorStatus,
  getToken,
  isNetworkError,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { kioskApi } from '@/lib/kiosk';
import '../kiosk.css';

export default function KioskApprovalPage() {
  const { user, loading } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    function readCode() {
      setCode(window.location.hash.slice(1));
    }
    readCode();
    window.addEventListener('hashchange', readCode);
    return () => window.removeEventListener('hashchange', readCode);
  }, []);

  return (
    <main className="kiosk kiosk-approval">
      {code && /^[a-f0-9]{64}$/.test(code) && user && !loading ? (
        <Approval key={code} code={code} userName={user.full_name} />
      ) : (
        <section className="kiosk-panel kiosk-checkout kiosk-stack">
          <h1>Вход на планшете</h1>
          {loading || code === null ? (
            <p role="status">Проверяем сессию Pass…</p>
          ) : !/^[a-f0-9]{64}$/.test(code) ? (
            <p>Отсканируйте QR-код с экрана планшета.</p>
          ) : (
            <>
              <p>
                Войдите в Pass в этом браузере, затем отсканируйте новый QR-код
                на планшете.
              </p>
              <Link className="btn btn-primary" href="/login">
                Войти в Pass
              </Link>
            </>
          )}
        </section>
      )}
    </main>
  );
}

function Approval({ code, userName }: { code: string; userName: string }) {
  const [details, setDetails] = useState<{
    roomTitle: string;
    displayCode: string;
  } | null>(null);
  const [error, setError] = useState<{
    message: string;
    retryable: boolean;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setError({
        message:
          'Сессия Pass завершилась. Войдите снова и отсканируйте новый код.',
        retryable: false,
      });
      return;
    }
    let active = true;
    void kioskApi
      .previewLogin(token, code)
      .then((result) => {
        if (active) setDetails(result);
      })
      .catch((e) => {
        if (!active) return;
        const status = getErrorStatus(e);
        setError({
          message: getErrorMessage(e),
          retryable:
            isNetworkError(e) || status === 429 || (status ?? 0) >= 500,
        });
      });
    return () => {
      active = false;
    };
  }, [code, attempt]);

  async function approve() {
    const token = getToken();
    if (!token || busy || !details) return;
    setBusy(true);
    setError(null);
    try {
      await kioskApi.approveLogin(token, code);
      if (window.location.hash.slice(1) !== code) return;
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname,
      );
      setApproved(true);
    } catch (e) {
      const status = getErrorStatus(e);
      const retryable =
        isNetworkError(e) || status === 429 || (status ?? 0) >= 500;
      setError({ message: getErrorMessage(e), retryable });
      if (!retryable) setDetails(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="kiosk-panel kiosk-checkout kiosk-stack">
      <h1>{approved ? 'Вход подтверждён' : 'Вход на планшете'}</h1>
      {approved ? (
        <p role="status">Продолжите бронирование на планшете.</p>
      ) : (
        <>
          {details ? (
            <>
              <p>
                {details.roomTitle} · {userName}
              </p>
              <p>Подтвердите вход, если на планшете показан этот код.</p>
              <strong className="kiosk-pair-code">{details.displayCode}</strong>
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
              {error.message}
            </p>
          )}
          {!details && error?.retryable && (
            <button
              className="btn btn-secondary"
              onClick={() => {
                setError(null);
                setAttempt((value) => value + 1);
              }}
            >
              Повторить проверку
            </button>
          )}
        </>
      )}
    </section>
  );
}
