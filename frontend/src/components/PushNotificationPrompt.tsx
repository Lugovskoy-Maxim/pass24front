'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { api, getPushRenewalUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isTenantCompanyUser } from '@/lib/permissions';

const DISMISSED_KEY = 'pass24-push-prompt-dismissed-session';

function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function serializeSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!subscription.endpoint || !p256dh || !auth) {
    throw new Error('Браузер не вернул ключи push-подписки');
  }
  return { endpoint: subscription.endpoint, keys: { p256dh, auth } };
}

function isIos(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function subscriptionUsesKey(
  subscription: PushSubscription,
  publicKey: string,
): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const expected = base64UrlToUint8Array(publicKey);
  const actual = new Uint8Array(current);
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return navigator.serviceWorker.ready;
}

export function PushNotificationPrompt() {
  const { user } = useAuth();
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [installPromptVisible, setInstallPromptVisible] = useState(false);
  const [requiresInstall, setRequiresInstall] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [permission, setPermission] =
    useState<NotificationPermission>('default');
  const syncPromiseRef = useRef<Promise<boolean> | null>(null);

  const syncSubscription = useCallback(
    async (key: string, allowCreate: boolean) => {
      if (syncPromiseRef.current) return syncPromiseRef.current;
      const operation = (async () => {
        const registration = await getRegistration();
        let subscription = await registration.pushManager.getSubscription();

        if (subscription && !subscriptionUsesKey(subscription, key)) {
          await subscription.unsubscribe();
          subscription = null;
        }
        if (!subscription && allowCreate) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToUint8Array(key),
          });
        }
        if (!subscription) return false;
        const result = await api.savePushSubscription(
          serializeSubscription(subscription),
        );
        const renewalConfig = {
          type: 'CONFIGURE_PUSH_RENEWAL',
          publicKey: key,
          renewalToken: result.renewalToken,
          renewalUrl: getPushRenewalUrl(),
        };
        [registration.active, registration.waiting, registration.installing]
          .filter((worker): worker is ServiceWorker => !!worker)
          .forEach((worker) => worker.postMessage(renewalConfig));
        sessionStorage.removeItem(DISMISSED_KEY);
        return true;
      })();
      syncPromiseRef.current = operation;
      try {
        return await operation;
      } finally {
        if (syncPromiseRef.current === operation) syncPromiseRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    const onInstallVisibility = (event: Event) => {
      const customEvent = event as CustomEvent<{ visible?: boolean }>;
      setInstallPromptVisible(customEvent.detail?.visible === true);
    };
    window.addEventListener(
      'pass24:pwa-install-visibility',
      onInstallVisibility,
    );
    return () =>
      window.removeEventListener(
        'pass24:pwa-install-visibility',
        onInstallVisibility,
      );
  }, []);

  useEffect(() => {
    if (!isTenantCompanyUser(user)) return;
    if (!window.isSecureContext) {
      setError(
        'Уведомления работают только через защищённое HTTPS-соединение.',
      );
      setVisible(true);
      return;
    }

    // На iOS/iPadOS Web Push доступен только у приложения, запущенного с экрана «Домой».
    // До установки инструкции показывает PwaInstallPrompt.
    if (isIos() && !isStandalone()) {
      setRequiresInstall(true);
      setError(
        'На iPhone и iPad сначала добавьте приложение на экран «Домой», затем откройте его с иконки.',
      );
      setVisible(true);
      return;
    }
    setRequiresInstall(false);

    if (
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    ) {
      setError(
        'Этот браузер не поддерживает Web Push. Обновите браузер или установите приложение.',
      );
      setVisible(true);
      return;
    }

    let cancelled = false;
    const sync = async () => {
      try {
        const config = await api.getPushConfig();
        if (cancelled || !config.enabled || !config.publicKey) return;
        setPublicKey(config.publicKey);
        const currentPermission = Notification.permission;
        setPermission(currentPermission);

        if (currentPermission === 'denied') {
          setError(
            'Уведомления заблокированы. Разрешите их в настройках сайта и обновите страницу.',
          );
          setVisible(true);
          return;
        }

        const connected = await syncSubscription(
          config.publicKey,
          currentPermission === 'granted',
        );
        if (cancelled) return;
        if (connected) {
          setError('');
          setVisible(false);
        } else if (!sessionStorage.getItem(DISMISSED_KEY)) {
          setVisible(true);
        }
      } catch {
        if (cancelled) return;
        setError(
          'Не удалось подключить уведомления. Проверьте интернет и попробуйте ещё раз.',
        );
        setVisible(true);
      }
    };

    void sync();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    const onServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED') void sync();
    };
    navigator.serviceWorker.addEventListener('message', onServiceWorkerMessage);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker.removeEventListener(
        'message',
        onServiceWorkerMessage,
      );
    };
  }, [syncSubscription, user]);

  const dismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  };

  const subscribe = async () => {
    if (!publicKey) return;
    if (Notification.permission === 'denied') {
      setError(
        'Уведомления заблокированы. Разрешите их в настройках сайта и обновите страницу.',
      );
      return;
    }

    setBusy(true);
    setError('');
    try {
      const result =
        Notification.permission === 'granted'
          ? 'granted'
          : await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') {
        setError(
          result === 'denied'
            ? 'Уведомления заблокированы. Разрешите их в настройках сайта.'
            : 'Разрешение не выдано. Нажмите «Включить», когда будете готовы.',
        );
        return;
      }
      const connected = await syncSubscription(publicKey, true);
      if (!connected) throw new Error('Push subscription was not created');
      setVisible(false);
    } catch {
      setError(
        'Не удалось включить уведомления. Проверьте настройки браузера и повторите попытку.',
      );
    } finally {
      setBusy(false);
    }
  };

  if (!visible || installPromptVisible) return null;
  return (
    <div
      className="pwa-install"
      role="dialog"
      aria-label="Уведомления о гостях"
    >
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
          <Bell className="w-6 h-6" />
        </div>
        <div className="pwa-install__body">
          <p className="pwa-install__title">Узнавайте о приходе гостей</p>
          <p className="pwa-install__text">
            Включите уведомления — сообщим, когда гость войдёт в бизнес-центр.
          </p>
          {error && (
            <p className="pwa-install__text text-[var(--danger)]">{error}</p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary pwa-install__btn"
          onClick={subscribe}
          disabled={busy || permission === 'denied' || requiresInstall}
        >
          <Bell className="w-4 h-4" />
          {busy
            ? 'Подключаем…'
            : requiresInstall
              ? 'Сначала установите приложение'
              : permission === 'denied'
                ? 'Заблокировано браузером'
                : 'Включить'}
        </button>
      </div>
    </div>
  );
}
