'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { CommunitySummary } from '@lms/shared';
import { api, useApiFailure } from '@/lib/client-api';
import { formatRelative } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Button, LinkButton } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { Skeleton } from '../ui/skeleton';
import s from './communities.module.css';

/** Миний community-ууд: хичээлийг нь эзэмшдэг багш нарын community + өөрийнх (багш бол). */
export default function CommunitiesPage() {
  const fail = useApiFailure();
  const [items, setItems] = useState<CommunitySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    api<CommunitySummary[]>('/communities')
      .then((r) => setItems(r.data))
      .catch((err: unknown) => {
        const msg = fail(err);
        if (msg) setError(msg);
      });
  }, [fail, attempt]);

  function retry() {
    setError(null);
    setAttempt((n) => n + 1);
  }

  return (
    <div className="page-narrow">
      <div className={s.stack}>
        <h1 className={s.title}>{t('community.title')}</h1>
        {error && (
          <div role="alert" className={s.denied}>
            <p className={s.error}>{error}</p>
            <Button variant="secondary" onClick={retry}>
              {t('miscUi.retry')}
            </Button>
          </div>
        )}
        {items === null && !error && (
          <div className={s.list} aria-busy="true" aria-label={t('me.loading')}>
            {[0, 1, 2].map((i) => (
              <div key={i} className={s.skeletonRow}>
                <Skeleton width={48} height={48} radius="50%" />
                <span className={s.skeletonText}>
                  <Skeleton width="40%" />
                  <Skeleton width="25%" height="0.8em" />
                </span>
              </div>
            ))}
          </div>
        )}
        {items?.length === 0 && (
          <EmptyState
            title={t('miscUi.communitiesEmptyTitle')}
            description={t('community.empty')}
            action={<LinkButton href="/courses">{t('community.browse')}</LinkButton>}
          />
        )}
        {!!items?.length && (
          <ul className={s.list}>
            {items.map((c) => (
              <li key={c.teacher.id}>
                <Link href={`/communities/${c.teacher.id}`} className={s.item}>
                  {c.teacher.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className={s.avatar} src={c.teacher.avatarUrl} alt="" width={48} height={48} loading="lazy" />
                  ) : (
                    <span className={s.avatar} aria-hidden="true" />
                  )}
                  <span className={s.itemBody}>
                    <span className={s.itemName}>
                      {c.teacher.name}
                      {c.role === 'TEACHER' && <span className={s.pill}>{t('community.own')}</span>}
                    </span>
                    <span className={s.meta}>
                      {t('community.postCount', { count: c.postCount })}
                      {c.lastPostAt && ` · ${t('community.lastPost', { date: formatRelative(c.lastPostAt) })}`}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
