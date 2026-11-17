'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MyCourseDetail, MyCourseLesson } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { t, type MessageKey } from '@/lib/i18n';
import { ProgressBar } from '../learning-ui';

/** Эзэмшсэн курсийн хөтөлбөр: lesson бүрийн дууссан эсэх, видеоны хувь, quiz-ийн оноо. */
export default function MyCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = use(params);
  const router = useRouter();
  const [course, setCourse] = useState<MyCourseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<MyCourseDetail>(`/learning/courses/${courseId}`)
      .then((r) => setCourse(r.data))
      .catch((err: unknown) => {
        if (err instanceof ApiRequestError && err.status === 401) router.replace(`/login?next=/learning/${courseId}`);
        else setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
      });
  }, [courseId, router]);

  if (!course) {
    return (
      <main className="page">
        <Link href="/learning">{t('learning.backToLearning')}</Link>
        <p>{error ?? t('me.loading')}</p>
      </main>
    );
  }

  return (
    <main className="page" style={{ display: 'grid', gap: 16 }}>
      <Link href="/learning">{t('learning.backToLearning')}</Link>
      <div style={{ display: 'grid', gap: 6 }}>
        <h1 style={{ margin: 0 }}>{course.title}</h1>
        <small className="muted">{t('learning.teacher', { name: course.teacher.name })}</small>
        <ProgressBar percent={course.progressPercent} />
        <small>
          {t('learning.progress', { completed: course.completedLessonCount, owned: course.ownedLessonCount, percent: course.progressPercent })}
        </small>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {course.continueLessonId ? (
            <Link className="btn" href={`/courses/${course.id}/lessons/${course.continueLessonId}`}>
              {course.lastViewedAt ? t('learning.continue') : t('learning.start')}
            </Link>
          ) : (
            <span className="done-mark">{t('learning.allDone')}</span>
          )}
          <Link className="btn btn-ghost" href={`/courses/${course.id}`}>
            {t('learning.openCourse')}
          </Link>
        </div>
      </div>

      <section className="card" style={{ display: 'grid', gap: 12 }}>
        <strong>{t('learning.curriculum')}</strong>
        {course.sections.map((s) => (
          <div key={s.id} className="section-block">
            <div style={{ fontWeight: 700 }}>{s.title}</div>
            <ul className="lesson-list">
              {s.lessons.map((l) => (
                <li key={l.id} className="lesson-row">
                  <span>
                    {l.progress?.completed && (
                      <span className="done-mark" aria-label={t('learning.completed')}>
                        ✓{' '}
                      </span>
                    )}
                    {l.owned || l.isFreePreview ? <Link href={`/courses/${course.id}/lessons/${l.id}`}>{l.title}</Link> : l.title}{' '}
                    <small>· {t(`course.type${l.type}` as MessageKey)}</small>
                  </span>
                  <small className="muted">{lessonStatus(l)}</small>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </main>
  );
}

function lessonStatus(l: MyCourseLesson): string {
  const parts: string[] = [];
  if (l.archived) parts.push(t('learning.archived'));
  if (!l.owned) parts.push(t('learning.locked'));
  const p = l.progress;
  if (p?.completed) parts.push(t('learning.completed'));
  if (p && l.type === 'VIDEO' && !p.completed && p.watchedPercent > 0) parts.push(t('learning.watched', { percent: p.watchedPercent }));
  if (p && p.bestScorePercent !== null) parts.push(t('learning.bestScore', { percent: p.bestScorePercent }));
  return parts.join(' · ');
}
