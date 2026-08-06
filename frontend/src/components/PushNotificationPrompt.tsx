'use client';

import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isTenantCompanyUser } from '@/lib/permissions';

const DISMISSED_KEY = 'pass24-push-prompt-dismissed';
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;

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
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh, auth },
  };
}

export function PushNotificationPrompt() {
  const { user } = useAuth();
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if (!isTenantCompanyUser(user)) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
    setPermission(Notification.permission);

    api.getPushConfig().then(async (config) => {
      if (!config.enabled || !config.publicKey) return;
      setPublicKey(config.publicKey);
      if (Notification.permission === 'denied') {
        setError('Уведомления заблокированы в браузере. Разрешите их в настройках сайта и обновите страницу.');
        setVisible(true);
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        try {
          await api.savePushSubscription(serializeSubscription(existing));
        } catch {
          setError('Не удалось подключить уведомления. Попробуйте ещё раз.');
          setVisible(true);
        }
        return;
      }
      const dismissed = Number(localStorage.getItem(DISMISSED_KEY) || 0);
      if (!dismissed || Date.now() - dismissed > DISMISS_MS) setVisible(true);
    }).catch(() => {});
  }, [user]);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setVisible(false);
  };

  const subscribe = async () => {
    if (!publicKey) return;
    if (Notification.permission === 'denied') {
      setError('Уведомления заблокированы в браузере. Разрешите их в настройках сайта и обновите страницу.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const permission = await Notification.requestPermission();
      setPermission(permission);
      if (permission !== 'granted') {
        dismiss();
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(publicKey),
        });
      await api.savePushSubscription(serializeSubscription(subscription));
      setVisible(false);
    } catch {
      setError('Не удалось включить уведомления. Проверьте разрешение браузера и повторите попытку.');
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;
  return (
    <div className="pwa-install" role="dialog" aria-label="Уведомления о гостях">
      <div className="pwa-install__card card">
        <button type="button" className="pwa-install__close" onClick={dismiss} aria-label="Закрыть">
          <X className="w-4 h-4" />
        </button>
        <div className="pwa-install__icon" aria-hidden><Bell className="w-6 h-6" /></div>
        <div className="pwa-install__body">
          <p className="pwa-install__title">Узнавайте о приходе гостей</p>
          <p className="pwa-install__text">Включите push-уведомления — сообщим, когда гость войдёт в бизнес-центр.</p>
          {error && <p className="pwa-install__text text-[var(--danger)]">{error}</p>}
        </div>
        <button
          type="button"
          className="btn btn-primary pwa-install__btn"
          onClick={subscribe}
          disabled={busy || permission === 'denied'}
        >
          <Bell className="w-4 h-4" />
          {busy ? 'Подключаем…' : permission === 'denied' ? 'Заблокировано браузером' : 'Включить'}
        </button>
      </div>
    </div>
  );
}
