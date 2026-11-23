'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatUbDateTime, isoToUbLocal, type TeacherLiveItem } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { t } from '@/lib/i18n';
import { EmptyState } from '../../ui/empty-state';
import { Skeleton } from '../../ui/skeleton';
import s from '../teacher.module.css';

/** Улаанбаатарын өдөр (YYYY-MM-DD) бүрээр бүлэглэнэ. */
function groupByDay(items: TeacherLiveItem[]): [string, TeacherLiveItem[]][] {
  const days = new Map<string, TeacherLiveItem[]>();
  for (const item of items) {
    const day = isoToUbLocal(item.startsAt).slice(0, 10);
    days.set(day, [...(days.get(day) ?? []), item]);
  }
  return [...days.entries()];
}

/** Багшийн удахгүй болох шууд хичээлийн хуанли (SPEC story 63). */
export default function TeacherLiveCalendarPage() {
  const router = useRouter();
  const [items, setItems] = useState<TeacherLiveItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<TeacherLiveItem[]>('/teacher/live-lessons')
      .then((r) => setItems(r.data))
      .catch((err) => {
        if (err instanceof ApiRequestError && err.status === 401) router.replace('/login?next=/teacher/live');
        else setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
      });
  }, [router]);

  return (
    <div className={s.page}>
      <div className={s.stack}>
        <h1 className={s.title}>{t('live.calendarTitle')}</h1>
        <p className={s.lead}>{t('live.calendarHint')}</p>
      </div>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      {!items && !error && (
        <div className={s.stack} aria-busy="true" aria-label={t('ui.loading')}>
          <Skeleton height={96} radius={22} />
          <Skeleton height={96} radius={22} />
        </div>
      )}
      {items?.length === 0 && (
        <div className="card">
          <EmptyState title={t('live.calendarEmpty')} />
        </div>
      )}
      {items &&
        groupByDay(items).map(([day, dayItems]) => (
          <section key={day} className={s.stack} aria-labelledby={`day-${day}`}>
            <h2 id={`day-${day}`} className={s.sectionTitle}>
              {day}
            </h2>
            {dayItems.map((item) => (
              <article key={item.lessonId} className={`card ${s.liveItem}`}>
                <strong>{item.lessonTitle}</strong>
                <span className="muted">{item.courseTitle}</span>
                <span>{t('live.when', { startsAt: formatUbDateTime(item.startsAt), duration: item.durationMinutes })}</span>
                <span className="muted">
                  {t(item.state === 'LIVE' ? 'live.stateLIVE' : 'live.stateSCHEDULED')}
                  {!item.published && ` · ${t('live.calendarUnpublished')}`}
                </span>
                <span className={s.links}>
                  <Link href={`/teacher/courses/${item.courseId}`}>{t('live.calendarEdit')}</Link>
                  {item.meetingUrl && (
                    <a href={item.meetingUrl} target="_blank" rel="noopener noreferrer">
                      {t('live.calendarMeeting')}
                    </a>
                  )}
                </span>
              </article>
            ))}
          </section>
        ))}
    </div>
  );
}
