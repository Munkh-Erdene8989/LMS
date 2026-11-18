'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatUbDateTime, type CertificateView, type MyCourseCard } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { t } from '@/lib/i18n';
import { EmptyState } from '../ui/empty-state';
import { LinkButton } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { BookIcon, CheckIcon } from './icons';
import { ProgressBar } from './learning-ui';
import styles from './learning.module.css';

/** "Миний сургалт": эзэмшсэн курсууд (сүүлд үзсэн нь эхэнд), явцын хувь, нэг primary "Үргэлжлүүлэх". */
export default function MyLearningPage() {
  const router = useRouter();
  const [items, setItems] = useState<MyCourseCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [certificates, setCertificates] = useState<CertificateView[]>([]);

  useEffect(() => {
    api<CertificateView[]>('/learning/certificates')
      .then((r) => setCertificates(r.data))
      .catch(() => setCertificates([]));
  }, []);

  useEffect(() => {
    api<MyCourseCard[]>('/learning/courses')
      .then((r) => setItems(r.data))
      .catch((err: unknown) => {
        if (err instanceof ApiRequestError && err.status === 401) router.replace('/login?next=/learning');
        else setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
      });
  }, [router]);

  return (
    <div className={`page ${styles.page}`}>
      <header className={styles.heading}>
        <h1 className={styles.h1}>{t('learning.title')}</h1>
        {items && items.length > 0 && <p className={styles.lead}>{t('learningUi.lead')}</p>}
      </header>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      {!items && !error && (
        <ul className={styles.grid} aria-busy="true" aria-label={t('me.loading')}>
          {[0, 1, 2].map((i) => (
            <li key={i} className={styles.skeletonCard}>
              <Skeleton height="auto" radius={0} className={styles.cover} />
              <div className={styles.skeletonBody}>
                <Skeleton height="1.2em" width="80%" />
                <Skeleton height="0.9em" width="50%" />
                <Skeleton height="4px" radius={999} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {items && items.length === 0 && (
        <EmptyState
          icon={<BookIcon />}
          title={t('learning.empty')}
          description={t('learningUi.emptyHint')}
          action={<LinkButton href="/courses">{t('learning.browse')}</LinkButton>}
        />
      )}

      {items && items.length > 0 && (
        <ul className={styles.grid}>
          {items.map((c) => (
            <li key={c.id} className={styles.card}>
              <Link href={`/learning/${c.id}`} tabIndex={-1} aria-hidden="true">
                {c.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={styles.cover} src={c.coverUrl} alt="" width={640} height={360} loading="lazy" />
                ) : (
                  <span className={`${styles.cover} ${styles.coverFallback}`}>
                    <BookIcon />
                  </span>
                )}
              </Link>
              <div className={styles.body}>
                <h2 className={styles.cardTitle}>
                  <Link href={`/learning/${c.id}`}>{c.title}</Link>
                </h2>
                <p className={styles.meta}>
                  {t('learning.teacher', { name: c.teacher.name })} ·{' '}
                  {c.ownsCourse
                    ? t('learning.fullCourse')
                    : t('learning.partialCourse', {
                        owned: c.ownedLessonCount,
                        total: c.lessonCount,
                      })}
                </p>
                <ProgressBar percent={c.progressPercent} />
                <p className={styles.progressText}>
                  {t('learning.progress', {
                    completed: c.completedLessonCount,
                    owned: c.ownedLessonCount,
                    percent: c.progressPercent,
                  })}
                </p>
                <div className={styles.actions}>
                  {c.continueLessonId ? (
                    <LinkButton href={`/courses/${c.id}/lessons/${c.continueLessonId}`}>
                      {c.lastViewedAt ? t('learning.continue') : t('learning.start')}
                    </LinkButton>
                  ) : (
                    <span className={styles.doneMark}>
                      <CheckIcon />
                      {t('learning.allDone')}
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {certificates.length > 0 && (
        <section className={styles.panel} aria-labelledby="my-certificates">
          <h2 id="my-certificates" className={styles.panelTitle}>
            {t('certificate.mine')}
          </h2>
          <ul className={styles.plainList}>
            {certificates.map((c) => (
              <li key={c.code}>
                <Link href={`/learning/${c.courseId}`}>{c.courseTitle}</Link>{' '}
                <span className={styles.muted}>· {formatUbDateTime(c.issuedAt).slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
