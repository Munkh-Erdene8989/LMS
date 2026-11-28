'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import type { MyCourseDetail, MyCourseLesson } from '@lms/shared';
import { api, useApiFailure } from '@/lib/client-api';
import { t, type MessageKey } from '@/lib/i18n';
import { LinkButton } from '../../ui/button';
import { Skeleton } from '../../ui/skeleton';
import { ArrowLeftIcon, CheckIcon, LockIcon, PlayIcon } from '../icons';
import { ProgressBar } from '../learning-ui';
import styles from '../learning.module.css';
import { CertificateCard } from './certificate-card';

/** Эзэмшсэн курсийн хөтөлбөр: lesson бүрийн дууссан эсэх, видеоны хувь, quiz-ийн оноо. */
export default function MyCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = use(params);
  const fail = useApiFailure();
  const [course, setCourse] = useState<MyCourseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<MyCourseDetail>(`/learning/courses/${courseId}`)
      .then((r) => setCourse(r.data))
      .catch((err: unknown) => {
        const msg = fail(err);
        if (msg) setError(msg);
      });
  }, [courseId, fail]);

  const back = (
    <Link href="/learning" className={styles.back}>
      <ArrowLeftIcon />
      {t('learningUi.backToLearning')}
    </Link>
  );

  if (!course) {
    return (
      <div className={`page-narrow ${styles.page}`}>
        {back}
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : (
          <div className={styles.hero} aria-busy="true" aria-label={t('me.loading')}>
            <Skeleton height="2.2em" width="70%" />
            <Skeleton height="0.9em" width="40%" />
            <Skeleton height="4px" radius={999} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`page-narrow ${styles.page}`}>
      {back}
      <header className={styles.hero}>
        <h1 className={styles.h1}>{course.title}</h1>
        <p className={styles.meta}>{t('learning.teacher', { name: course.teacher.name })}</p>
        {course.isPrivate && (
          <p className={styles.badges}>
            {course.organizations.length > 0 ? (
              course.organizations.map((o) => (
                <span key={o.id} className="pill">
                  {t('learning.orgBadge', { name: o.name })}
                </span>
              ))
            ) : (
              <span className="pill">{t('learning.orgBadgeUnknown')}</span>
            )}
            {course.locked && <span className="pill">{t('learning.lockedBadge')}</span>}
          </p>
        )}
        <ProgressBar percent={course.progressPercent} />
        <p className={styles.progressText}>
          {t('learning.progress', {
            completed: course.completedLessonCount,
            owned: course.ownedLessonCount,
            percent: course.progressPercent,
          })}
        </p>
        <div className={styles.heroActions}>
          {course.locked ? (
            <span className={styles.muted}>{t('learning.lockedHint')}</span>
          ) : course.continueLessonId ? (
            <LinkButton href={`/courses/${course.id}/lessons/${course.continueLessonId}`}>
              {course.lastViewedAt ? t('learning.continue') : t('learning.start')}
            </LinkButton>
          ) : (
            <span className={styles.doneMark}>
              <CheckIcon />
              {t('learning.allDone')}
            </span>
          )}
          {!course.isPrivate && (
            <LinkButton variant="secondary" href={`/courses/${course.id}`}>
              {t('learning.openCourse')}
            </LinkButton>
          )}
        </div>
      </header>

      <CertificateCard courseId={course.id} />

      <section className={styles.curriculum} aria-labelledby="curriculum">
        <h2 id="curriculum" className={styles.panelTitle}>
          {t('learning.curriculum')}
        </h2>
        {course.sections.map((s) => (
          <div key={s.id}>
            <h3 className={styles.sectionTitle}>{s.title}</h3>
            <ul className={styles.rows}>
              {s.lessons.map((l) => (
                <LessonRow key={l.id} courseId={course.id} lesson={l} locked={course.locked} />
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}

function LessonRow({ courseId, lesson: l, locked }: { courseId: string; lesson: MyCourseLesson; locked: boolean }) {
  const done = !!l.progress?.completed;
  const accessible = !locked && (l.owned || l.isFreePreview);
  const body = (
    <span className={styles.rowBody}>
      <span className={`${styles.icon} ${done ? styles.iconDone : accessible ? styles.iconOpen : ''}`}>
        {done ? <CheckIcon /> : accessible ? <PlayIcon /> : <LockIcon />}
      </span>
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{l.title}</span>
        <span className={styles.rowMeta}>{t(`course.type${l.type}` as MessageKey)}</span>
      </span>
    </span>
  );
  return (
    <li>
      {accessible ? (
        <Link href={`/courses/${courseId}/lessons/${l.id}`} className={styles.row}>
          {body}
          <span className={styles.rowEnd}>{lessonStatus(l)}</span>
        </Link>
      ) : (
        <div className={styles.row}>
          {body}
          <span className={styles.rowEnd}>{lessonStatus(l)}</span>
        </div>
      )}
    </li>
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
