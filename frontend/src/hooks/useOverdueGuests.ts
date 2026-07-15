'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, Pass } from '@/lib/api';
import { AUTO_REFRESH_MS } from '@/hooks/useAutoRefresh';

export function useOverdueGuests(enabled: boolean) {
  const [passes, setPasses] = useState<Pass[]>([]);
  const [loading, setLoading] = useState(false);
  const [timeTick, setTimeTick] = useState(0);

  const refresh = useCallback((options?: { silent?: boolean }): Promise<Pass[]> => {
    if (!enabled) return Promise.resolve([]);
    const silent = options?.silent;
    if (!silent) setLoading(true);
    return api.getOverdueActive()
      .then(({ passes: data }) => {
        setPasses(data);
        return data;
      })
      .catch(() => {
        setPasses([]);
        return [] as Pass[];
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }, [enabled]);

  useEffect(() => {
    refresh();
    if (!enabled) return;
    const pollId = window.setInterval(() => refresh({ silent: true }), AUTO_REFRESH_MS);
    const tickId = window.setInterval(() => setTimeTick((t) => t + 1), AUTO_REFRESH_MS);
    return () => {
      window.clearInterval(pollId);
      window.clearInterval(tickId);
    };
  }, [enabled, refresh]);

  return { passes, count: passes.length, loading, timeTick, refresh };
}