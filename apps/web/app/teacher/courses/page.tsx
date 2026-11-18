'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CourseDetail, CourseSummary } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { t } from '@/lib/i18n';
import { formatDate } from '@/lib/format';
import { StatusBadge } from '../../course-ui';
import { Button } from '../../ui/button';
import { EmptyState } from '../../ui/empty-state';
import { Skeleton } from '../../ui/skeleton';
import s from '../teacher.module.css';

export default function TeacherCoursesPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
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
    setBusy(true);
    setError(null);
    try {
      const r = await api<CourseDetail>('/teacher/courses', { method: 'POST', body: { title } });
      router.push(`/teacher/courses/${r.data.id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
      setBusy(false);
    }
  }

  return (
    <div className={s.page}>
      <h1 className={s.title}>{t('course.myCourses')}</h1>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      {courses && (
        <form onSubmit={create} className={`card ${s.row}`}>
          <input
            className={`input ${s.grow}`}
            name="title"
            autoComplete="off"
            required
            maxLength={200}
            placeholder={t('course.newCoursePlaceholder')}
            aria-label={t('course.newCoursePlaceholder')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Button type="submit" loading={busy}>
            {t('course.newCourse')}
          </Button>
        </form>
      )}
      {!courses && !error && (
        <div className={`card ${s.stack}`} aria-busy="true" aria-label={t('ui.loading')}>
          <Skeleton height={44} />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </div>
      )}
      {courses?.length === 0 && (
        <div className="card">
          <EmptyState title={t('course.empty')} />
        </div>
      )}
      {courses && courses.length > 0 && (
        <div className={`card ${s.tableWrap}`}>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">{t('teacherUi.colCourse')}</th>
                <th scope="col">{t('teacherUi.colStatus')}</th>
                <th scope="col" className="num">
                  {t('teacherUi.colLessons')}
                </th>
                <th scope="col">{t('teacherUi.colUpdated')}</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id} className={s.rowLink}>
                  <td>
                    <div className={s.courseCell}>
                      {c.coverUrl ? <img className={s.courseThumb} src={c.coverUrl} alt="" width={72} height={40} loading="lazy" /> : <div className={s.courseThumb} />}
                      <Link className={s.courseLink} href={`/teacher/courses/${c.id}`}>
                        {c.title}
                      </Link>
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="num">
                    {c.lessonCount}
                    {c.pendingLessonCount > 0 && <small className="muted"> · {t('course.pending', { count: c.pendingLessonCount })}</small>}
                  </td>
                  <td>{formatDate(c.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
