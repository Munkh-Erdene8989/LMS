'use client';

import { use, useEffect, useState } from 'react';
import type { CourseDetail } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { t, type MessageKey } from '@/lib/i18n';
import { LessonContentPreview, LessonStatusBadge, StatusBadge } from '../../../course-ui';
import { Markdown } from '../../../markdown';

/** Админ курсийг бүх хичээлийн агуулгатай нь үзэж шийдвэрлэнэ. */
export default function AdminCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<CourseDetail>(`/admin/courses/${id}`).then((r) => setCourse(r.data));
  }, [id]);

  async function act(path: string, body?: unknown) {
    setError(null);
    try {
      setCourse((await api<CourseDetail>(path, { method: 'POST', body })).data);
      setReason('');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
    }
  }

  if (!course) return <main>{t('me.loading')}</main>;

  const pending = course.sections.flatMap((s) => s.lessons).filter((l) => l.reviewStatus === 'IN_REVIEW' && !l.archived);
  const decidable = course.status === 'IN_REVIEW' || (course.status === 'PUBLISHED' && pending.length > 0);

  return (
    <main style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>{course.title}</h1>
        <StatusBadge status={course.status} />
      </div>

      <section className="card" style={{ display: 'grid', gap: 8 }}>
        {course.coverUrl && <img src={course.coverUrl} alt="" style={{ maxWidth: 320, borderRadius: 6 }} />}
        <p style={{ margin: 0 }}>
          {t('course.teacher')}: {course.teacher.name ?? course.teacher.id} · {t(`course.level${course.level}` as MessageKey)} ·{' '}
          {t('course.credits', { count: course.priceCredits ?? 0 })} ({t('course.lessonsTotal', { count: course.lessonsTotalCredits })})
        </p>
        <Markdown source={course.description} />
      </section>

      {course.sections.map((s) => (
        <section key={s.id} className="card" style={{ display: 'grid', gap: 12 }}>
          <strong>{s.title}</strong>
          {s.lessons.map((l) => (
            <article key={l.id} className="lesson-editor" style={{ opacity: l.archived ? 0.5 : 1 }}>
              <div className="lesson-row">
                <span>
                  <strong>{l.title}</strong> <small>· {t(`course.type${l.type}` as MessageKey)}</small>{' '}
                  <small>· {t('course.credits', { count: l.priceCredits })}</small>
                  {l.isFreePreview && <small> · preview</small>}
                </span>
                <LessonStatusBadge status={l.reviewStatus} />
              </div>
              <LessonContentPreview lesson={l} />
              {l.reviewStatus === 'IN_REVIEW' && course.status === 'PUBLISHED' && (
                <button className="btn btn-ghost" disabled={!reason.trim()} onClick={() => act(`/admin/lessons/${l.id}/reject`, { reason })}>
                  {t('course.rejectLesson')}
                </button>
              )}
            </article>
          ))}
        </section>
      ))}

      {decidable && (
        <section className="card" style={{ display: 'grid', gap: 8, position: 'sticky', bottom: 0, background: 'var(--bg)' }}>
          <textarea
            className="input"
            rows={2}
            placeholder={t('course.rejectReason')}
            aria-label={t('course.rejectReason')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => act(`/admin/courses/${id}/approve`)}>
              {t('course.approve')}
            </button>
            <button className="btn btn-ghost" disabled={!reason.trim()} onClick={() => act(`/admin/courses/${id}/reject`, { reason })}>
              {t('course.reject')}
            </button>
          </div>
          {error && <p style={{ margin: 0, color: 'var(--err)' }}>{error}</p>}
        </section>
      )}
    </main>
  );
}
