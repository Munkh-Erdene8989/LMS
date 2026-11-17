'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MyCourseCard } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { t } from '@/lib/i18n';
import { ProgressBar } from './learning-ui';

/** "Миний сургалт": эзэмшсэн курсууд (сүүлд үзсэн нь эхэнд), явцын хувь, "Үргэлжлүүлэх". */
export default function MyLearningPage() {
  const router = useRouter();
  const [items, setItems] = useState<MyCourseCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<MyCourseCard[]>('/learning/courses')
      .then((r) => setItems(r.data))
      .catch((err: unknown) => {
        if (err instanceof ApiRequestError && err.status === 401) router.replace('/login?next=/learning');
        else setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
      });
  }, [router]);

  if (!items) {
    return (
      <main className="page">
        <p>{error ?? t('me.loading')}</p>
      </main>
    );
  }

  return (
    <main className="page wide" style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t('learning.title')}</h1>
      {items.length === 0 ? (
        <div className="card" style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
          <p style={{ margin: 0 }}>{t('learning.empty')}</p>
          <Link className="btn" href="/courses">
            {t('learning.browse')}
          </Link>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
          {items.map((c) => (
            <li key={c.id} className="card learning-card">
              <Link href={`/learning/${c.id}`}>{c.coverUrl ? <img src={c.coverUrl} alt="" /> : <div className="cover-placeholder" />}</Link>
              <div style={{ display: 'grid', gap: 6 }}>
                <Link href={`/learning/${c.id}`} style={{ fontWeight: 700, color: 'var(--fg)' }}>
                  {c.title}
                </Link>
                <small className="muted">
                  {t('learning.teacher', { name: c.teacher.name })} ·{' '}
                  {c.ownsCourse ? t('learning.fullCourse') : t('learning.partialCourse', { owned: c.ownedLessonCount, total: c.lessonCount })}
                </small>
                <ProgressBar percent={c.progressPercent} />
                <small>
                  {t('learning.progress', { completed: c.completedLessonCount, owned: c.ownedLessonCount, percent: c.progressPercent })}
                </small>
                <div>
                  {c.continueLessonId ? (
                    <Link className="btn" href={`/courses/${c.id}/lessons/${c.continueLessonId}`}>
                      {c.lastViewedAt ? t('learning.continue') : t('learning.start')}
                    </Link>
                  ) : (
                    <span className="done-mark">{t('learning.allDone')}</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
