'use client';

import { useEffect, useState } from 'react';
import { api, BcConfig } from '@/lib/api';

let cached: BcConfig | null = null;

export function useConfig() {
  const [config, setConfig] = useState<BcConfig | null>(cached);

  useEffect(() => {
    if (cached) return;
    api.getConfig().then((c) => { cached = c; setConfig(c); });
  }, []);

  return config;
}