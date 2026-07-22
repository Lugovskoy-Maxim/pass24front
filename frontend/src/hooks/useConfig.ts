'use client';

/**
 * Публичный конфиг сайта (бренд, FAQ, guide, SMS flags).
 * Модульный кэш + listeners: после admin save вызывайте invalidateConfigCache().
 */
import { useEffect, useState } from 'react';
import { api, BcConfig } from '@/lib/api';

let cached: BcConfig | null = null;
const listeners = new Set<() => void>();

function notifyConfigListeners() {
  listeners.forEach((listener) => listener());
}

/** Сброс кэша после PATCH site-settings. */
export function invalidateConfigCache() {
  cached = null;
  notifyConfigListeners();
}

export function useConfig() {
  const [config, setConfig] = useState<BcConfig | null>(cached);

  useEffect(() => {
    const load = () => {
      api.getConfig().then((c) => {
        cached = c;
        setConfig(c);
      });
    };

    if (cached) setConfig(cached);
    else load();

    listeners.add(load);
    return () => {
      listeners.delete(load);
    };
  }, []);

  return config;
}