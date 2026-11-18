import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { BRAND, LEGAL_DOC_TYPES, LEGAL_SLUGS } from '@lms/shared';
import { t } from '@/lib/i18n';
import { SiteHeader } from './site-header';
import './globals.css';

// CSP nonce хүсэлт бүр өөр (middleware.ts) тул бүх хуудас dynamic render — статик prerender хийвэл script-д nonce орохгүй.
export const dynamic = 'force-dynamic';

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
        <footer className="site-footer">
          {LEGAL_DOC_TYPES.map((type) => (
            <Link key={type} href={`/legal/${LEGAL_SLUGS[type]}`}>
              {t(`legal.${type}`)}
            </Link>
          ))}
        </footer>
      </body>
    </html>
  );
}
