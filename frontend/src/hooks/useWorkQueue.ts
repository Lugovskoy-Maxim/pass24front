'use client';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '@/lib/auth';
import { Counts, operations } from '@/lib/operations';

type State = { counts: Counts | null; stale: boolean };
const EMPTY: State = { counts: null, stale: false };
const stores = new Map<
  string,
  {
    state: State;
    listeners: Set<() => void>;
    timer?: ReturnType<typeof setInterval>;
    inflight?: Promise<void>;
    queued?: boolean;
  }
>();
function getStore(key: string) {
  let store = stores.get(key);
  if (!store) {
    store = { state: EMPTY, listeners: new Set() };
    stores.set(key, store);
  }
  return store;
}
function refresh(key: string, afterAction = false) {
  const store = getStore(key);
  if (!key) return;
  if (store.inflight) { if (afterAction) store.queued = true; return store.inflight; }
  store.inflight = operations
    .counts()
    .then((counts) => {
      store.state = { counts, stale: false };
    })
    .catch(() => {
      store.state = { ...store.state, stale: true };
    })
    .finally(() => {
      store.inflight = undefined;
      store.listeners.forEach((notify) => notify());
      if (store.queued) { store.queued = false; void refresh(key); }
    });
  return store.inflight;
}
export function useWorkQueue() {
  const { user } = useAuth();
  const key = user?.permissions?.includes('admin.panel')
    ? user.id + ':' + [...user.permissions].sort().join(',')
    : '';
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!key) return () => undefined;
      const store = getStore(key);
      store.listeners.add(notify);
      if (!store.timer)
        store.timer = setInterval(() => {
          if (!document.hidden) void refresh(key);
        }, 20000);
      void refresh(key);
      return () => {
        store.listeners.delete(notify);
        if (!store.listeners.size && store.timer) {
          clearInterval(store.timer);
          store.timer = undefined;
        }
      };
    },
    [key],
  );
  const snapshot = useCallback(
    () => (key ? getStore(key).state : EMPTY),
    [key],
  );
  const state = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  useEffect(() => {
    if (!key) return;
    const update = () => {
      if (!document.hidden) void refresh(key, true);
    };
    document.addEventListener('visibilitychange', update);
    window.addEventListener('pass-work-queue-refresh', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('pass-work-queue-refresh', update);
    };
  }, [key]);
  return state;
}
