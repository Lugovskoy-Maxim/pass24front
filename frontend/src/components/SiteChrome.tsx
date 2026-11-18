'use client';

import { usePathname } from 'next/navigation';
import { SiteFooter } from './SiteFooter';
import { HelpFaq } from './HelpFaq';
import { PwaInstallPrompt } from './PwaInstallPrompt';
import { PushNotificationPrompt } from './PushNotificationPrompt';

export function SiteChrome() {
  const pathname = usePathname();
  if (pathname === '/kiosk' || pathname.startsWith('/kiosk/')) return null;
  return (
    <>
      <SiteFooter />
      <PwaInstallPrompt />
      <PushNotificationPrompt />
      <HelpFaq />
    </>
  );
}
