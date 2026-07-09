'use client';

import { useEffect } from 'react';
import { useConfig } from '@/hooks/useConfig';
import { applyThemeColors } from '@/lib/theme-colors';

export function ThemeColorsApplier() {
  const config = useConfig();

  useEffect(() => {
    applyThemeColors(config?.themePrimary, config?.themePrimaryHover);
  }, [config?.themePrimary, config?.themePrimaryHover]);

  return null;
}