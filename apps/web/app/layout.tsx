import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Inter } from 'next/font/google';
import { BRAND, LEGAL_DOC_TYPES, LEGAL_SLUGS } from '@lms/shared';
import { t } from '@/lib/i18n';
import { SiteHeader } from './site-header';
import { ViewerProvider } from '@/lib/viewer';
import { ConfirmProvider } from './ui/confirm';
import { ToastProvider } from './ui/toast';
import { DemoBadge } from './ui/demo-badge';
import { ThemeToggle } from './theme-toggle';
import styles from './shell.module.css';
import './globals.css';

// next/font нь шрифтийг build-д татаж өөрийн домэйнээс (`/_next/static/media`) үйлчилнэ → CSP `font-src 'self'` зөрчигдөхгүй.
const inter = Inter({
  subsets: ['latin', 'cyrillic', 'cyrillic-ext'],
  // optional: шрифт солигдоход (swap) Cyrillic fallback-ийн өргөн өөр тул hero-ийн мөр шилжиж CLS үүсдэг. Preload-той тул ихэнхдээ шууд Inter.
  display: 'optional',
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
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        <ViewerProvider>
        <ToastProvider>
        <ConfirmProvider>
        <a href="#main" className={styles.skip}>
          {t('shell.skip')}
        </a>
        <SiteHeader />
        <main id="main" tabIndex={-1} className={styles.main}>
          {children}
        </main>
        <footer className={styles.footer}>
          <div className={styles.cols}>
            <div className={styles.about}>
              <Link href="/" className={styles.footBrand}>
                {BRAND.name}
              </Link>
              <p className={styles.tagline}>{t('shell.footerTagline')}</p>
            </div>
            <nav aria-label={t('shell.footerExplore')} className={styles.col}>
              <h2 className={styles.colTitle}>{t('shell.footerExplore')}</h2>
              <Link href="/courses">{t('shell.courses')}</Link>
              <Link href="/communities">{t('shell.community')}</Link>
              <Link href="/learning">{t('shell.myLearning')}</Link>
            </nav>
            <nav aria-label={t('shell.footerLegal')} className={styles.col}>
              <h2 className={styles.colTitle}>{t('shell.footerLegal')}</h2>
              {LEGAL_DOC_TYPES.map((type) => (
                <Link key={type} href={`/legal/${LEGAL_SLUGS[type]}`}>
                  {t(`legal.${type}`)}
                </Link>
              ))}
            </nav>
          </div>
          <div className={styles.bottom}>
            <span>{t('shell.footerBrand', { year: new Date().getFullYear(), brand: BRAND.name })}</span>
            <ThemeToggle />
          </div>
        </footer>
        </ConfirmProvider>
        </ToastProvider>
        </ViewerProvider>
        <DemoBadge />
      </body>
    </html>
  );
}
