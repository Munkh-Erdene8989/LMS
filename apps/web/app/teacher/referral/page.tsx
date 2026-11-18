'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReferralLinkView } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Button } from '../../ui/button';
import { Skeleton } from '../../ui/skeleton';
import { useToast } from '../../ui/toast';
import s from '../teacher.module.css';

/** Багшийн referral линк: хуулах товч, шимтгэлийн тайлбар, товч статистик. */
export default function TeacherReferralPage() {
  const router = useRouter();
  const { toast, error: toastError } = useToast();
  const [view, setView] = useState<ReferralLinkView | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      <div className={s.page}>
        <h1 className={s.title}>{t('referral.title')}</h1>
        {error ? (
          <p role="alert" className={s.error}>
            {error}
          </p>
        ) : (
          <div aria-busy="true" aria-label={t('ui.loading')}>
            <Skeleton height={120} radius={22} />
          </div>
        )}
      </div>
    );
  }

  const url = `${origin}${view.path}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast(t('teacherUi.linkCopied'));
    } catch {
      toastError(t('teacherUi.copyFailed'));
    }
  }

  const st = view.stats;
  return (
    <div className={s.page}>
      <h1 className={s.title}>{t('referral.title')}</h1>
      <p className={s.lead}>
        {t('referral.intro', {
          days: view.windowDays,
          referral: view.commissionReferralPercent,
          platform: view.commissionPlatformPercent,
        })}
      </p>

      <section className={`card ${s.card}`}>
        <label className={s.field} htmlFor="referral-link">
          {t('referral.yourLink')}
        </label>
        <div className={s.copyRow}>
          <input
            id="referral-link"
            name="referral-link"
            className={`input ${s.grow}`}
            readOnly
            autoComplete="off"
            value={url}
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button onClick={() => void copy()}>{t('referral.copy')}</Button>
        </div>
        <small className="muted">{t('referral.courseHint', { path: `${view.path}?next=/courses/…` })}</small>
      </section>

      <div className={s.stats}>
        <section className={`card ${s.stat}`}>
          <span className={s.statLabel}>{t('referral.activeLearners', { days: view.windowDays })}</span>
          <strong className={s.statValue}>{formatNumber(st.activeLearners)}</strong>
          <small className="muted">{t('referral.totalLearners', { count: formatNumber(st.learners) })}</small>
        </section>
        <section className={`card ${s.stat}`}>
          <span className={s.statLabel}>{t('referral.sales')}</span>
          <strong className={s.statValue}>
            {t('referral.salesValue', { referral: formatNumber(st.referralSales), platform: formatNumber(st.platformSales) })}
          </strong>
          <Link href="/teacher/analytics">{t('referral.analyticsLink')}</Link>
        </section>
      </div>
      <p className={s.hint}>{t('referral.rules')}</p>
    </div>
  );
}
