const CACHE = 'pass24-pwa-v2';
const PRECACHE = ['/', '/login'];
const PUSH_DB = 'pass24-push';
const PUSH_STORE = 'config';

function openPushDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PUSH_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(PUSH_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function savePushConfig(config) {
  const db = await openPushDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(PUSH_STORE, 'readwrite');
    transaction.objectStore(PUSH_STORE).put(config, 'renewal');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function loadPushConfig() {
  const db = await openPushDb();
  const result = await new Promise((resolve, reject) => {
    const request = db.transaction(PUSH_STORE).objectStore(PUSH_STORE).get('renewal');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

function base64UrlToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CONFIGURE_PUSH_RENEWAL') return;
  event.waitUntil(savePushConfig({
    publicKey: event.data.publicKey,
    renewalToken: event.data.renewalToken,
    renewalUrl: event.data.renewalUrl,
  }));
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/'))),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() || '' };
  }

  const notification = data.notification || data;
  const tasks = [
    self.registration.showNotification(notification.title || 'Пропуска', {
      body: notification.body || 'Новое уведомление',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: notification.tag || data.tag,
      renotify: true,
      data: { url: notification.navigate || notification.url || data.url || '/passes' },
    }),
  ];
  if ('setAppBadge' in self.navigator) {
    tasks.push(self.navigator.setAppBadge(1).catch(() => undefined));
  }
  event.waitUntil(Promise.all(tasks));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/passes', self.location.origin).href;
  event.waitUntil(
    Promise.all([
      'clearAppBadge' in self.navigator ? self.navigator.clearAppBadge() : Promise.resolve(),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
          await existing.navigate(target);
          return existing.focus();
      }
      return self.clients.openWindow(target);
      }),
    ]),
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const config = await loadPushConfig();
      if (!config?.publicKey || !config?.renewalToken || !config?.renewalUrl) return;

      const subscription = event.newSubscription || await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(config.publicKey),
      });
      const json = subscription.toJSON();
      const response = await fetch(config.renewalUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          renewalToken: config.renewalToken,
          endpoint: subscription.endpoint,
          keys: json.keys,
        }),
      });
      if (!response.ok) throw new Error(`Push renewal failed: ${response.status}`);

      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach((client) => client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' }));
    })(),
  );
});
