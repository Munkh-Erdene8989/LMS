'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CourseDetail, CourseSummary } from '@lms/shared';
import { api, errorText, useApiFailure } from '@/lib/client-api';
import { t } from '@/lib/i18n';
import { formatDate } from '@/lib/format';
import { useViewer } from '@/lib/viewer';
import { StatusBadge } from '../../course-ui';
import { Button } from '../../ui/button';
import { EmptyState } from '../../ui/empty-state';
import { Skeleton } from '../../ui/skeleton';
import s from '../teacher.module.css';

export default function TeacherCoursesPage() {
  const router = useRouter();
  const fail = useApiFailure();
  const { viewer } = useViewer();
  // Хаалттай (private) курс зохиох эрх зөвхөн house teacher-т (API ч шалгана).
  const canPrivate = viewer.user?.isHouseTeacher === true;
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<CourseSummary[]>('/teacher/courses')
      .then((r) => setCourses(r.data))
      .catch((err: unknown) => {
        const msg = fail(err);
        if (msg) setError(msg);
      });
  }, [fail]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<CourseDetail>('/teacher/courses', {
        method: 'POST',
        body: canPrivate ? { title, visibility } : { title },
      });
      router.push(`/teacher/courses/${r.data.id}`);
    } catch (err) {
      setError(errorText(err));
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
          {canPrivate && (
            <select
              className={`input ${s.autoWidth}`}
              name="visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as 'PUBLIC' | 'PRIVATE')}
              aria-label={t('course.visibility')}
            >
              <option value="PUBLIC">{t('course.visibilityPUBLIC')}</option>
              <option value="PRIVATE">{t('course.visibilityPRIVATE')}</option>
            </select>
          )}
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
                <th scope="col" className={s.num}>
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
                    {c.visibility === 'PRIVATE' && <span className="badge-status"> {t('course.privateBadge')}</span>}
                  </td>
                  <td className={s.num}>
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
