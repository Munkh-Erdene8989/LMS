'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { BRAND } from '@lms/shared';
import { t } from '@/lib/i18n';

/** Root layout дахь алдаа — өөрийн html/body шаардлагатай. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang={BRAND.defaultLocale}>
      <body>
        <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
          <h1>{t('errorPage.title')}</h1>
          <p>{t('errorPage.body')}</p>
          <button onClick={reset}>{t('errorPage.retry')}</button>
        </main>
      </body>
    </html>
  );
}
