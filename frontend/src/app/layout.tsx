import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/components/Toast';
import './globals.css';

export const metadata: Metadata = {
  title: 'PASS24 БЦ — Пропуска для бизнес-центра',
  description: 'Система заказа пропусков для арендаторов офисов в бизнес-центре',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}