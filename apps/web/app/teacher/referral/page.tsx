'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ReferralLinkView } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';

/** Багшийн referral линк: хуулах товч, шимтгэлийн тайлбар, товч статистик. */
export default function TeacherReferralPage() {
  const router = useRouter();
  const [view, setView] = useState<ReferralLinkView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
    api<ReferralLinkView>('/teacher/referral')
      .then((r) => setView(r.data))
      .catch((err: unknown) => {
        if (err instanceof ApiRequestError && err.status === 401) router.replace('/login?next=/teacher/referral');
        else setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
      });
  }, [router]);

  if (!view) {
    return (
      <main className="page">
        <p>{error ?? t('me.loading')}</p>
      </main>
    );
  }

  const url = `${origin}${view.path}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const s = view.stats;
  return (
    <main className="page wide" style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t('referral.title')}</h1>
      <p className="muted" style={{ margin: 0 }}>
        {t('referral.intro', {
          days: view.windowDays,
          referral: view.commissionReferralPercent,
          platform: view.commissionPlatformPercent,
        })}
      </p>

      <section className="card" style={{ display: 'grid', gap: 8 }}>
        <strong>{t('referral.yourLink')}</strong>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="input" readOnly value={url} style={{ flex: '1 1 240px' }} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="btn" onClick={() => void copy()}>
            {copied ? t('referral.copied') : t('referral.copy')}
          </button>
        </div>
        <small className="muted">{t('referral.courseHint', { path: `${view.path}?next=/courses/…` })}</small>
      </section>

      <div className="grid-2">
        <section className="card credit-balance">
          <span className="muted">{t('referral.activeLearners', { days: view.windowDays })}</span>
          <strong>{formatNumber(s.activeLearners)}</strong>
          <small className="muted">{t('referral.totalLearners', { count: formatNumber(s.learners) })}</small>
        </section>
        <section className="card credit-balance">
          <span className="muted">{t('referral.sales')}</span>
          <strong>
            {t('referral.salesValue', { referral: formatNumber(s.referralSales), platform: formatNumber(s.platformSales) })}
          </strong>
        </section>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        {t('referral.rules')}
      </p>
    </main>
  );
}
