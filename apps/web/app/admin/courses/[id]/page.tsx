'use client';

import { use, useEffect, useState } from 'react';
import type { CourseDetail } from '@lms/shared';
import { api } from '@/lib/client-api';
import { t, type MessageKey } from '@/lib/i18n';
import { Button } from '../../../ui/button';
import { AttachmentList, LessonContentPreview, LessonStatusBadge, StatusBadge } from '../../../course-ui';
import { Markdown } from '../../../markdown';
import { ErrorLine, LoadingRows, ReasonDialog, errorText } from '../../admin-ui';
import styles from '../../admin.module.css';

type Rejecting = { kind: 'course' } | { kind: 'lesson'; id: string };

/** Админ курсийг бүх хичээлийн агуулгатай нь үзэж шийдвэрлэнэ. */
export default function AdminCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [rejecting, setRejecting] = useState<Rejecting | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<CourseDetail>(`/admin/courses/${id}`)
      .then((r) => setCourse(r.data))
      .catch((err: unknown) => setError(errorText(err)));
  }, [id]);

  async function act(path: string, body?: unknown) {
    setError(null);
    try {
      setCourse((await api<CourseDetail>(path, { method: 'POST', body })).data);
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (!course) return <div className={styles.stack}>{error ? <ErrorLine>{error}</ErrorLine> : <LoadingRows />}</div>;

  const pending = course.sections.flatMap((s) => s.lessons).filter((l) => l.reviewStatus === 'IN_REVIEW' && !l.archived);
  const decidable = course.status === 'IN_REVIEW' || (course.status === 'PUBLISHED' && pending.length > 0);

  return (
    <div className={styles.stackLg}>
      <div className={styles.itemHead}>
        <h1 className={styles.title}>{course.title}</h1>
        <StatusBadge status={course.status} />
      </div>

      <section className={styles.item}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {course.coverUrl && <img className={styles.cover} src={course.coverUrl} alt="" width={320} height={180} loading="lazy" />}
        <p className={styles.line}>
          {t('course.teacher')}: {course.teacher.name ?? course.teacher.id} · {t(`course.level${course.level}` as MessageKey)} ·{' '}
          {t('course.credits', { count: course.priceCredits ?? 0 })} ({t('course.lessonsTotal', { count: course.lessonsTotalCredits })})
        </p>
        <Markdown source={course.description} />
      </section>

      {course.sections.map((s) => (
        <section key={s.id} className={styles.item} aria-label={s.title}>
          <strong>{s.title}</strong>
          {s.lessons.map((l) => (
            <article key={l.id} className={`lesson-editor ${l.archived ? styles.lessonDim : ''}`}>
              <div className="lesson-row">
                <span>
                  <strong>{l.title}</strong> <small>· {t(`course.type${l.type}` as MessageKey)}</small>{' '}
                  <small>· {t('course.credits', { count: l.priceCredits })}</small>
                  {l.isFreePreview && <small> · preview</small>}
                </span>
                <LessonStatusBadge status={l.reviewStatus} />
              </div>
              <LessonContentPreview lesson={l} />
              <AttachmentList attachments={l.attachments} />
              {l.reviewStatus === 'IN_REVIEW' && course.status === 'PUBLISHED' && (
                <div>
                  <Button variant="secondary" size="sm" onClick={() => setRejecting({ kind: 'lesson', id: l.id })}>
                    {t('course.rejectLesson')}
                  </Button>
                </div>
              )}
            </article>
          ))}
        </section>
      ))}

      {decidable && (
        <section className={`${styles.item} ${styles.decision}`}>
          <div className={styles.rowActions}>
            <Button onClick={() => void act(`/admin/courses/${id}/approve`)}>{t('course.approve')}</Button>
            <Button variant="secondary" onClick={() => setRejecting({ kind: 'course' })}>
              {t('course.reject')}
            </Button>
          </div>
          {error && <ErrorLine>{error}</ErrorLine>}
        </section>
      )}
      {!decidable && error && <ErrorLine>{error}</ErrorLine>}

      <ReasonDialog
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title={rejecting?.kind === 'lesson' ? t('course.rejectLesson') : t('course.reject')}
        label={t('course.rejectReason')}
        confirmLabel={rejecting?.kind === 'lesson' ? t('course.rejectLesson') : t('course.reject')}
        danger
        onSubmit={async (reason) => {
          if (!rejecting) return;
          await act(rejecting.kind === 'lesson' ? `/admin/lessons/${rejecting.id}/reject` : `/admin/courses/${id}/reject`, { reason });
        }}
      />
    </div>
  );
}
