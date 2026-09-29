'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep the boundary observable without exposing stack traces in the UI.
    console.error('Route error', error);
  }, [error]);

  return (
    <main className="app-shell-center flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="card max-w-lg p-6" role="alert">
        <h1 className="text-xl font-semibold">Не удалось открыть страницу</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Попробуйте повторить загрузку. Если ошибка повторяется, вернитесь на
          главную страницу или обратитесь к администратору.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button type="button" className="btn btn-primary" onClick={reset}>
            Повторить
          </button>
          <Link className="btn btn-secondary" href="/">
            На главную
          </Link>
        </div>
      </div>
    </main>
  );
}
