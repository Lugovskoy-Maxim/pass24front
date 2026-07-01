'use client';

import { createContext, useContext, useCallback, ReactNode } from 'react';
import { Toaster, toast as sonnerToast } from 'sonner';
import { useTheme } from '@/components/ThemeProvider';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const opts = { duration: 4000 };
    switch (type) {
      case 'success':
        sonnerToast.success(message, opts);
        break;
      case 'error':
        sonnerToast.error(message, opts);
        break;
      case 'warning':
        sonnerToast.warning(message, opts);
        break;
      default:
        sonnerToast.message(message, opts);
    }
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <Toaster
        theme={theme}
        position="bottom-right"
        closeButton
        richColors
        toastOptions={{
          className: 'pass24-toast',
          style: {
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
          },
        }}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}