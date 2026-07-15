'use client';

import { useEffect, useRef } from 'react';

/** Интервал фонового обновления данных (мс). */
export const AUTO_REFRESH_MS = 20_000;

export function useAutoRefresh(
  refresh: () => void | Promise<unknown>,
  options?: {
    intervalMs?: number;
    enabled?: boolean;
    pauseWhenHidden?: boolean;
  },
) {
  const {
    intervalMs = AUTO_REFRESH_MS,
    enabled = true,
    pauseWhenHidden = true,
  } = options ?? {};

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      if (pauseWhenHidden && document.hidden) return;
      void refreshRef.current();
    };

    const intervalId = window.setInterval(tick, intervalMs);

    const onVisible = () => {
      if (!document.hidden) void refreshRef.current();
    };
    if (pauseWhenHidden) {
      document.addEventListener('visibilitychange', onVisible);
    }

    return () => {
      window.clearInterval(intervalId);
      if (pauseWhenHidden) {
        document.removeEventListener('visibilitychange', onVisible);
      }
    };
  }, [enabled, intervalMs, pauseWhenHidden]);
}