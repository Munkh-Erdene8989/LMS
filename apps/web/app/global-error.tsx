'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { BRAND } from '@lms/shared';
import { t } from '@/lib/i18n';
import s from './error-page.module.css';

/** Root layout дахь алдаа — өөрийн html/body шаардлагатай (globals.css ачаалагдахгүй). */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang={BRAND.defaultLocale}>
      <body>
        <main className={`${s.root} ${s.rootFull}`}>
          <div className={s.box} role="alert">
            <h1 className={s.title}>{t('errorPage.title')}</h1>
            <p className={s.body}>{t('errorPage.body')}</p>
            <p className={s.hint}>{t('miscUi.errorFix')}</p>
            {error.digest && <p className={s.hint}>{t('miscUi.errorRef', { code: error.digest })}</p>}
            <div className={s.actions}>
              <button type="button" className={s.btn} onClick={reset}>
                {t('errorPage.retry')}
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" className={`${s.btn} ${s.btnSecondary}`}>
                {t('miscUi.goHome')}
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
