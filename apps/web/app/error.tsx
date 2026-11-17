'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { t } from '@/lib/i18n';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 16px' }}>
      <h1>{t('errorPage.title')}</h1>
      <p>{t('errorPage.body')}</p>
      <button className="btn" onClick={reset}>
        {t('errorPage.retry')}
      </button>
    </main>
  );
}
