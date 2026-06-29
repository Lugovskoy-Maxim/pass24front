'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, Pass } from '@/lib/api';

export function useOverdueGuests(enabled: boolean) {
  const [passes, setPasses] = useState<Pass[]>([]);
  const [loading, setLoading] = useState(false);
  const [timeTick, setTimeTick] = useState(0);

  const refresh = useCallback(() => {
    if (!enabled) return;
    setLoading(true);
    api.getOverdueActive()
      .then(({ passes: data }) => setPasses(data))
      .catch(() => setPasses([]))
      .finally(() => setLoading(false));
  }, [enabled]);

  useEffect(() => {
    refresh();
    if (!enabled) return;
    const pollId = window.setInterval(refresh, 60_000);
    const tickId = window.setInterval(() => setTimeTick((t) => t + 1), 60_000);
    return () => {
      window.clearInterval(pollId);
      window.clearInterval(tickId);
    };
  }, [enabled, refresh]);

  return { passes, count: passes.length, loading, timeTick, refresh };
}