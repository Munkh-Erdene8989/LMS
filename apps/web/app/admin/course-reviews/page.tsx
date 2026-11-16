'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ReviewQueueItem } from '@lms/shared';
import { api } from '@/lib/client-api';
import { t, type MessageKey } from '@/lib/i18n';
import { formatDate } from '@/lib/format';

export default function CourseReviewQueuePage() {
  const [items, setItems] = useState<ReviewQueueItem[] | null>(null);

  useEffect(() => {
    void api<ReviewQueueItem[]>('/admin/course-reviews').then((r) => setItems(r.data));
  }, []);

  return (
    <main style={{ display: 'grid', gap: 12 }}>
      <h1 style={{ margin: 0 }}>{t('course.reviewQueue')}</h1>
      {!items && <p>{t('me.loading')}</p>}
      {items?.length === 0 && <p>{t('course.queueEmpty')}</p>}
      {items?.map((i) => (
        <Link key={i.course.id} href={`/admin/courses/${i.course.id}`} className="card course-row">
          {i.course.coverUrl ? <img src={i.course.coverUrl} alt="" /> : <div className="cover-placeholder" />}
          <div style={{ display: 'grid', gap: 4 }}>
            <strong>{i.course.title}</strong>
            <span style={{ color: 'var(--muted)', fontSize: 14 }}>
              <span className="badge-status s-IN_REVIEW">{t(`course.kind${i.kind}` as MessageKey)}</span> · {t('course.teacher')}:{' '}
              {i.teacher.name ?? i.teacher.id.slice(0, 8)} ·{' '}
              {i.kind === 'LESSONS' ? t('course.pending', { count: i.course.pendingLessonCount }) : t('course.lessons', { count: i.course.lessonCount })}
              {i.submittedAt && ` · ${formatDate(i.submittedAt)}`}
            </span>
          </div>
        </Link>
      ))}
    </main>
  );
}
