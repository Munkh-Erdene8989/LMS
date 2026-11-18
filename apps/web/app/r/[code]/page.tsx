'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ReferralVisitResult } from '@lms/shared';
import { api } from '@/lib/client-api';
import { t } from '@/lib/i18n';
import { safeNext } from '@/lib/next-path';
import { Button, LinkButton } from '../../ui/button';
import s from './referral.module.css';

/**
 * Багшийн referral линк (`/r/<code>`, сонголтоор `?next=/courses/…`). API cookie тавьж (нэвтэрсэн бол DB-д
 * бичээд) буцаана → багшийн profile эсвэл `next` руу шилжинэ.
 */
export default function ReferralLandingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const next = safeNext(new URLSearchParams(window.location.search).get('next'));
    api<ReferralVisitResult>('/referrals/visit', { method: 'POST', body: { code } })
      .then((r) => router.replace(next ?? `/teachers/${r.data.teacherId}`))
      .catch(() => setFailed(true));
  }, [code, router, attempt]);

  return (
    <div className="page-narrow">
      {failed ? (
        <div className={s.box} role="alert">
          <h1 className={s.title}>{t('miscUi.referralFailedTitle')}</h1>
          <p className={s.body}>{t('referral.invalid')}</p>
          <p className={s.body}>{t('miscUi.referralFailedFix')}</p>
          <div className={s.actions}>
            <LinkButton href="/courses">{t('referral.browse')}</LinkButton>
            <Button
              variant="secondary"
              onClick={() => {
                setFailed(false);
                setAttempt((n) => n + 1);
              }}
            >
              {t('miscUi.retry')}
            </Button>
          </div>
        </div>
      ) : (
        <div className={s.box} role="status">
          <span className={s.spinner} aria-hidden="true" />
          <p className={s.body}>{t('miscUi.referralOpening')}</p>
        </div>
      )}
    </div>
  );
}
