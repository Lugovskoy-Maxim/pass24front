'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

const DISMISS_KEY = 'pass24-pwa-install-dismissed';
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function wasDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    return !Number.isNaN(ts) && Date.now() - ts < DISMISS_MS;
  } catch {
    return false;
  }
}

export function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosMode, setIosMode] = useState(false);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setVisible(false);
  }, []);

  useEffect(() => {
    if (isStandalone() || wasDismissedRecently()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    if (isIos()) {
      setIosMode(true);
      setVisible(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') dismiss();
      else setVisible(false);
    } catch {
      setVisible(false);
    } finally {
      setDeferred(null);
    }
  };

  if (!visible) return null;

  return (
    <div className="pwa-install" role="dialog" aria-label="Установить приложение">
      <div className="pwa-install__card card">
        <button
          type="button"
          className="pwa-install__close"
          onClick={dismiss}
          aria-label="Закрыть"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="pwa-install__icon" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" width={40} height={40} />
        </div>
        <div className="pwa-install__body">
          <p className="pwa-install__title">Установить приложение</p>
          <p className="pwa-install__text">
            {iosMode
              ? 'Нажмите «Поделиться» и выберите «На экран Домой», чтобы открывать пропуска в один тап.'
              : 'Добавьте «Пропуска.МСтиль» на главный экран — быстрый доступ к заказу и проверке QR.'}
          </p>
        </div>
        {iosMode ? (
          <div className="pwa-install__ios-hint" aria-hidden>
            <Share className="w-4 h-4 shrink-0" />
            <span>Поделиться → На экран «Домой»</span>
          </div>
        ) : (
          <button type="button" className="btn btn-primary pwa-install__btn" onClick={install}>
            <Download className="w-4 h-4" />
            Установить
          </button>
        )}
      </div>
    </div>
  );
}