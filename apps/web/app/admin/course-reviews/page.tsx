'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ReviewQueueItem } from '@lms/shared';
import { api } from '@/lib/client-api';
import { t, type MessageKey } from '@/lib/i18n';
import { formatDate } from '@/lib/format';
import { EmptyState } from '../../ui/empty-state';
import { ErrorLine, LoadingRows, Pill, errorText } from '../admin-ui';
import styles from '../admin.module.css';

export default function CourseReviewQueuePage() {
  const [items, setItems] = useState<ReviewQueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ReviewQueueItem[]>('/admin/course-reviews')
      .then((r) => setItems(r.data))
      .catch((err: unknown) => setError(errorText(err)));
  }, []);

  return (
    <div className={styles.stack}>
      <h1 className={styles.title}>{t('course.reviewQueue')}</h1>
      {error && <ErrorLine>{error}</ErrorLine>}
      {!items && !error && <LoadingRows />}
      {items?.length === 0 && <EmptyState title={t('course.queueEmpty')} />}
      {!!items?.length && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption>{t('course.reviewQueue')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('adminOps.colCourse')}</th>
                <th scope="col">{t('adminUi.colKind')}</th>
                <th scope="col">{t('course.teacher')}</th>
                <th scope="col">{t('adminUi.colLessons')}</th>
                <th scope="col">{t('adminUi.colSubmitted')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.course.id}>
                  <th scope="row" className={styles.wrap}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {i.course.coverUrl && <img className={styles.thumb} src={i.course.coverUrl} alt="" width={56} height={36} loading="lazy" />}{' '}
                    <Link className={styles.anchor} href={`/admin/courses/${i.course.id}`}>
                      {i.course.title}
                    </Link>
                  </th>
                  <td>
                    <Pill tone="warn">{t(`course.kind${i.kind}` as MessageKey)}</Pill>
                  </td>
                  <td>{i.teacher.name ?? i.teacher.id.slice(0, 8)}</td>
                  <td>
                    {i.kind === 'LESSONS'
                      ? t('course.pending', { count: i.course.pendingLessonCount })
                      : t('course.lessons', { count: i.course.lessonCount })}
                  </td>
                  <td className={styles.nowrap}>{i.submittedAt ? formatDate(i.submittedAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
