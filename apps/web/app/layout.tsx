import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { BRAND } from '@lms/shared';
import { t } from '@/lib/i18n';
import { SiteHeader } from './site-header';
import './globals.css';

export const metadata: Metadata = {
  title: BRAND.name,
  description: t('meta.description'),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={BRAND.defaultLocale}>
      <body>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
