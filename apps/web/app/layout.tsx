import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Inter } from 'next/font/google';
import { BRAND, LEGAL_DOC_TYPES, LEGAL_SLUGS } from '@lms/shared';
import { t } from '@/lib/i18n';
import { SiteHeader } from './site-header';
import { DemoBadge } from './ui/demo-badge';
import './globals.css';

// next/font нь шрифтийг build-д татаж өөрийн домэйнээс (`/_next/static/media`) үйлчилнэ → CSP `font-src 'self'` зөрчигдөхгүй.
const inter = Inter({
  subsets: ['latin', 'cyrillic', 'cyrillic-ext'],
  display: 'swap',
  variable: '--font-inter',
});

// CSP nonce хүсэлт бүр өөр (middleware.ts) тул бүх хуудас dynamic render — статик prerender хийвэл script-д nonce орохгүй.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: BRAND.name,
  description: t('meta.description'),
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

/** Хадгалсан theme-ийг эхний зурахаас өмнө `data-theme` болгож тавина (flash үгүй). Хадгалаагүй бол system default. */
const THEME_INIT = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang={BRAND.defaultLocale} className={inter.variable} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
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
        <DemoBadge />
      </body>
    </html>
  );
}
