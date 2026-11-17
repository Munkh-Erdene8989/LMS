'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CourseDetail, CourseSummary } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { t } from '@/lib/i18n';
import { formatDate } from '@/lib/format';
import { StatusBadge } from '../../course-ui';

export default function TeacherCoursesPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<CourseSummary[]>('/teacher/courses')
      .then((r) => setCourses(r.data))
      .catch((err: unknown) => {
        if (err instanceof ApiRequestError && err.status === 401) router.replace('/login');
        else setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
      });
  }, [router]);

  async function create(e: FormEvent) {
    e.preventDefault();
    const r = await api<CourseDetail>('/teacher/courses', { method: 'POST', body: { title } });
    router.push(`/teacher/courses/${r.data.id}`);
  }

  return (
    <main className="page" style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>{t('course.myCourses')}</h1>
        <Link className="btn btn-ghost" href="/teacher/assignments">
          {t('assignment.inboxTitle')}
        </Link>
        <Link className="btn btn-ghost" href="/teacher/live">
          {t('live.calendarLink')}
        </Link>
      </div>
      {error && <p style={{ color: 'var(--err)' }}>{error}</p>}
      {courses && (
        <form onSubmit={create} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ flex: '1 1 240px' }}
            required
            maxLength={200}
            placeholder={t('course.newCoursePlaceholder')}
            aria-label={t('course.newCoursePlaceholder')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button className="btn">{t('course.newCourse')}</button>
        </form>
      )}
      {courses?.length === 0 && <p style={{ color: 'var(--muted)' }}>{t('course.empty')}</p>}
      <div style={{ display: 'grid', gap: 8 }}>
        {courses?.map((c) => (
          <Link key={c.id} href={`/teacher/courses/${c.id}`} className="card course-row">
            {c.coverUrl ? <img src={c.coverUrl} alt="" /> : <div className="cover-placeholder" />}
            <div style={{ display: 'grid', gap: 4 }}>
              <strong>{c.title}</strong>
              <span style={{ color: 'var(--muted)', fontSize: 14 }}>
                <StatusBadge status={c.status} /> · {t('course.lessons', { count: c.lessonCount })}
                {c.pendingLessonCount > 0 && ` · ${t('course.pending', { count: c.pendingLessonCount })}`} · {formatDate(c.updatedAt)}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}

