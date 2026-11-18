'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { LessonType, MyCourseDetail } from '@lms/shared';
import { api } from '@/lib/client-api';
import { formatNumber } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import { ArrowLeftIcon, CheckIcon, ChevronDownIcon, LockIcon, PlayIcon } from '../../../../learning/icons';
import { ProgressBar } from '../../../../learning/learning-ui';
import styles from './lesson.module.css';

export interface FrameLesson {
  id: string;
  title: string;
  type: LessonType;
  priceCredits: number;
  isFreePreview: boolean;
  /** Контент нээлттэй (эзэмшсэн, багш, админ) */
  open: boolean;
}

export interface FrameSection {
  id: string;
  title: string;
  lessons: FrameLesson[];
}

/** Хичээлийн ахиц өөрчлөгдсөн үед (дууслаа, quiz тэнцсэн, даалгавар илгээсэн) sidebar-ыг шинэчлэх event. */
export const LESSON_PROGRESS_EVENT = 'lesson:progress';

const DESKTOP = '(min-width: 980px)';

/**
 * Хичээл үзэх хүрээ: хөнгөн дээд мөр (буцах + ахиц), үндсэн хэсэг, хичээлийн жагсаалт (≥980px баруун sidebar,
 * мобайлд accordion). Ахицыг нэвтэрсэн үед `/learning/courses/:id`-ээс авна; авч чадаагүй бол ахиц харуулахгүй.
 */
export function LessonFrame({
  courseId,
  courseTitle,
  sections,
  currentId,
  children,
}: {
  courseId: string;
  courseTitle: string;
  sections: FrameSection[];
  currentId: string;
  children: ReactNode;
}) {
  const [progress, setProgress] = useState<MyCourseDetail | null>(null);
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      api<MyCourseDetail>(`/learning/courses/${courseId}`)
        .then((r) => alive && setProgress(r.data))
        .catch(() => undefined);
    };
    load();
    window.addEventListener(LESSON_PROGRESS_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(LESSON_PROGRESS_EVENT, load);
    };
  }, [courseId]);

  // Desktop-д жагсаалт үргэлж нээлттэй; мобайлд accordion (хаалттай эхэлнэ).
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const sync = () => setListOpen(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const done = new Set<string>();
  for (const s of progress?.sections ?? []) for (const l of s.lessons) if (l.progress?.completed) done.add(l.id);

  return (
    <div className={`page ${styles.wrap}`}>
      <div className={styles.topbar}>
        <Link href={`/courses/${courseId}`} className={styles.back}>
          <ArrowLeftIcon />
          {t('learningUi.backToCourse')}
        </Link>
        <p className={styles.courseTitle}>{courseTitle}</p>
        {progress && progress.ownedLessonCount > 0 && (
          <div className={styles.topProgress}>
            <div className={styles.bar}>
              <ProgressBar percent={progress.progressPercent} />
            </div>
            <span>{progress.progressPercent}%</span>
          </div>
        )}
      </div>

      <div className={`${styles.layout} ${sections.length === 0 ? styles.single : ''}`}>
        <div className={styles.main}>{children}</div>
        {sections.length > 0 && (
          <aside className={styles.side} aria-label={t('learningUi.lessonList')}>
            <details className={styles.listBox} open={listOpen} onToggle={(e) => setListOpen(e.currentTarget.open)}>
              <summary className={styles.listSummary}>
                <span>{t('learningUi.lessonList')}</span>
                <ChevronDownIcon className={styles.chevron} />
              </summary>
              <div className={styles.listScroll}>
                {sections.map((s) => (
                  <section key={s.id}>
                    <h2 className={styles.sectionTitle}>{s.title}</h2>
                    <ul className={styles.rows}>
                      {s.lessons.map((l) => (
                        <LessonRow key={l.id} courseId={courseId} lesson={l} current={l.id === currentId} completed={done.has(l.id)} />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </details>
          </aside>
        )}
      </div>
    </div>
  );
}

function LessonRow({
  courseId,
  lesson: l,
  current,
  completed,
}: {
  courseId: string;
  lesson: FrameLesson;
  current: boolean;
  completed: boolean;
}) {
  const accessible = l.open || l.isFreePreview;
  const state: MessageKey = completed ? 'learning.completed' : accessible ? 'learningUi.statusOpen' : 'learning.locked';
  const iconClass = completed ? styles.iconDone : accessible ? styles.iconFree : '';
  const price = l.priceCredits === 0 ? t('catalog.free') : t('catalog.credits', { count: formatNumber(l.priceCredits) });
  return (
    <li>
      <Link
        href={`/courses/${courseId}/lessons/${l.id}`}
        className={`${styles.row} ${current ? styles.current : ''}`}
        aria-current={current ? 'page' : undefined}
      >
        <span className={styles.rowBody}>
          <span className={`${styles.icon} ${iconClass}`}>{completed ? <CheckIcon /> : accessible ? <PlayIcon /> : <LockIcon />}</span>
          <span className={styles.rowText}>
            <span className={styles.rowTitle}>{l.title}</span>
            <span className={styles.rowMeta}>{t(`course.type${l.type}` as MessageKey)}</span>
          </span>
        </span>
        <span className={styles.rowEnd}>{accessible ? '' : price}</span>
        <span className={styles.srOnly}>{t(state)}</span>
      </Link>
    </li>
  );
}
