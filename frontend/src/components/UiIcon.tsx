'use client';

import { resolveUiIcon } from '@/lib/lucide-icons';

interface UiIconProps {
  name?: string | null;
  className?: string;
  strokeWidth?: number;
}

export function UiIcon({ name, className = 'w-4 h-4', strokeWidth = 2 }: UiIconProps) {
  const Icon = resolveUiIcon(name);
  return <Icon className={className} strokeWidth={strokeWidth} aria-hidden />;
}