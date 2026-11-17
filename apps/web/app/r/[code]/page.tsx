'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ReferralVisitResult } from '@lms/shared';
import { api } from '@/lib/client-api';
import { t } from '@/lib/i18n';
import { safeNext } from '@/lib/next-path';

/**
 * Багшийн referral линк (`/r/<code>`, сонголтоор `?next=/courses/…`). API cookie тавьж (нэвтэрсэн бол DB-д
 * бичээд) буцаана → багшийн profile эсвэл `next` руу шилжинэ.
 */
export default function ReferralLandingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const next = safeNext(new URLSearchParams(window.location.search).get('next'));
    api<ReferralVisitResult>('/referrals/visit', { method: 'POST', body: { code } })
      .then((r) => router.replace(next ?? `/teachers/${r.data.teacherId}`))
      .catch(() => setFailed(true));
  }, [code, router]);

  return (
    <main className="page">
      {failed ? (
        <>
          <p>{t('referral.invalid')}</p>
          <a className="btn" href="/courses">
            {t('referral.browse')}
          </a>
        </>
      ) : (
        <p>{t('me.loading')}</p>
      )}
    </main>
  );
}
