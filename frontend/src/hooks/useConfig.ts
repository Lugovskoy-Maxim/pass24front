'use client';

/**
 * Публичный конфиг сайта (бренд, FAQ, guide, SMS flags).
 * Модульный кэш + listeners: после admin save вызывайте invalidateConfigCache().
 */
import { useEffect, useState } from 'react';
import { api, BcConfig } from '@/lib/api';

let cached: BcConfig | null = null;
let cachedAt = 0;
let pending: Promise<BcConfig> | null = null;
const CONFIG_TTL_MS = 5 * 60 * 1000;
const listeners = new Set<() => void>();

function notifyConfigListeners() {
  listeners.forEach((listener) => listener());
}

/** Сброс кэша после PATCH site-settings. */
export function invalidateConfigCache() {
  cached = null;
  cachedAt = 0;
  notifyConfigListeners();
}

function loadConfig(): Promise<BcConfig> {
  if (pending) return pending;
  pending = api
    .getConfig()
    .then((config) => {
      cached = config;
      cachedAt = Date.now();
      return config;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function useConfig() {
  const [config, setConfig] = useState<BcConfig | null>(cached);

  useEffect(() => {
    const load = () => {
      loadConfig()
        .then(setConfig)
        .catch(() => undefined);
    };

    if (cached && Date.now() - cachedAt < CONFIG_TTL_MS) setConfig(cached);
    else load();

    listeners.add(load);
    return () => {
      listeners.delete(load);
    };
  }, []);

  return config;
}
