'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

interface ThemeToggleProps {
  className?: string;
  compact?: boolean;
}

export function ThemeToggle({ className = '', compact = false }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={[
        'inline-flex items-center justify-center gap-1.5 rounded transition-colors',
        compact ? 'p-2' : 'px-3 py-1.5 text-sm',
        className,
      ].join(' ')}
      style={{
        color: 'var(--header-muted)',
        border: '1px solid var(--header-border)',
        background: 'var(--header-control-bg)',
      }}
      title={isDark ? 'Светлая тема' : 'Тёмная тема'}
      aria-label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      {!compact && <span>{isDark ? 'Светлая' : 'Тёмная'}</span>}
    </button>
  );
}