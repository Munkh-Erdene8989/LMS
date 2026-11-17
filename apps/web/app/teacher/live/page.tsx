'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatUbDateTime, isoToUbLocal, type TeacherLiveItem } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { t } from '@/lib/i18n';

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
    <main className="page" style={{ display: 'grid', gap: 16 }}>
      <Link href="/teacher/courses">{t('assignment.backToCourses')}</Link>
      <h1 style={{ margin: 0 }}>{t('live.calendarTitle')}</h1>
      <p className="muted" style={{ margin: 0 }}>
        {t('live.calendarHint')}
      </p>
      {error && (
        <p role="alert" style={{ color: 'var(--err)', margin: 0 }}>
          {error}
        </p>
      )}
      {items?.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          {t('live.calendarEmpty')}
        </p>
      )}
      {items &&
        groupByDay(items).map(([day, dayItems]) => (
          <section key={day} style={{ display: 'grid', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>{day}</h2>
            {dayItems.map((item) => (
              <article key={item.lessonId} className="card" style={{ display: 'grid', gap: 4, padding: 12 }}>
                <strong>{item.lessonTitle}</strong>
                <span className="muted">{item.courseTitle}</span>
                <span>{t('live.when', { startsAt: formatUbDateTime(item.startsAt), duration: item.durationMinutes })}</span>
                <span className="muted">
                  {t(item.state === 'LIVE' ? 'live.stateLIVE' : 'live.stateSCHEDULED')}
                  {!item.published && ` · ${t('live.calendarUnpublished')}`}
                </span>
                <span style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
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
    </main>
  );
}
