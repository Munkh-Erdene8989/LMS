'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CommunitySummary } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatDate } from '@/lib/format';
import { t } from '@/lib/i18n';

/** Миний community-ууд: хичээлийг нь эзэмшдэг багш нарын community + өөрийнх (багш бол). */
export default function CommunitiesPage() {
  const router = useRouter();
  const [items, setItems] = useState<CommunitySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<CommunitySummary[]>('/communities')
      .then((r) => setItems(r.data))
      .catch((err: unknown) => {
        if (err instanceof ApiRequestError && err.status === 401) router.replace('/login?next=/communities');
        else setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
      });
  }, [router]);

  return (
    <main className="page" style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t('community.title')}</h1>
      {error && (
        <p role="alert" style={{ color: 'var(--err)', margin: 0 }}>
          {error}
        </p>
      )}
      {items === null && !error && <p className="muted">{t('me.loading')}</p>}
      {items?.length === 0 && (
        <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
          <p className="muted" style={{ margin: 0 }}>
            {t('community.empty')}
          </p>
          <Link className="btn" href="/courses">
            {t('community.browse')}
          </Link>
        </div>
      )}
      <div style={{ display: 'grid', gap: 8 }}>
        {items?.map((c) => (
          <Link key={c.teacher.id} href={`/communities/${c.teacher.id}`} className="card teacher-box">
            {c.teacher.avatarUrl ? <img className="avatar" src={c.teacher.avatarUrl} alt="" /> : <div className="avatar" />}
            <div style={{ display: 'grid', gap: 2 }}>
              <strong>
                {c.teacher.name}
                {c.role === 'TEACHER' && <span className="pill" style={{ marginLeft: 8 }}>{t('community.own')}</span>}
              </strong>
              <small className="muted">
                {t('community.postCount', { count: c.postCount })}
                {c.lastPostAt && ` · ${t('community.lastPost', { date: formatDate(c.lastPostAt) })}`}
              </small>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
