'use client';

import { use, useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  ASSIGNMENT_MAX_SCORE_LIMIT,
  AVAILABLE_LESSON_TYPES,
  COURSE_LEVELS,
  COVER_TYPES,
  isoToUbLocal,
  LIVE_DURATION_MAX,
  LIVE_DURATION_MIN,
  liveState,
  type CategoryNode,
  type CourseDetail,
  type LessonType,
  type LessonView,
  type SectionView,
  type UploadTicket,
} from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { t, type MessageKey } from '@/lib/i18n';
import { uploadFile } from '@/lib/upload';
import { LessonContentPreview, LessonStatusBadge, StatusBadge } from '../../../course-ui';
import { Markdown } from '../../../markdown';
import { QuizEditor, quizInputFrom } from './quiz-editor';

type Run = (fn: () => Promise<{ data: CourseDetail } | void>) => Promise<boolean>;

export default function CourseEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api<CourseDetail>(`/teacher/courses/${id}`)
      .then((r) => setCourse(r.data))
      .catch((err: unknown) => {
        if (err instanceof ApiRequestError && err.status === 401) router.replace('/login');
        else setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
      });
    void api<CategoryNode[]>('/categories').then((r) => setCategories(r.data));
  }, [id, router]);

  /** API дуудаад шинэ курсийн төлөвийг хүлээн авна; алдааг харуулна. */
  const run: Run = useCallback(async (fn) => {
    setError(null);
    setNotice(null);
    try {
      const r = await fn();
      if (r) setCourse(r.data);
      return true;
    } catch (err) {
      setError(err instanceof ApiRequestError || err instanceof Error ? err.message : t('auth.genericError'));
      return false;
    }
  }, []);

  if (!course) return <main className="page">{error ?? t('me.loading')}</main>;

  const locked = course.status === 'IN_REVIEW';
  const pendingNew = course.sections.flatMap((s) => s.lessons).filter((l) => !l.archived && (l.reviewStatus === 'DRAFT' || l.reviewStatus === 'REJECTED'));
  const canSubmit = !locked && (course.status !== 'PUBLISHED' || pendingNew.length > 0);

  return (
    <main className="page wide" style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>{course.title}</h1>
        <StatusBadge status={course.status} />
      </div>

      {course.reviewNote && course.status === 'REJECTED' && (
        <p className="card" style={{ borderColor: 'var(--err)', whiteSpace: 'pre-wrap', margin: 0 }}>
          <strong>{t('course.reviewNote')}:</strong> {course.reviewNote}
        </p>
      )}
      {locked && <p className="card" style={{ margin: 0 }}>{t('course.inReviewLocked')}</p>}
      {error && (
        <p role="alert" style={{ color: 'var(--err)', margin: 0 }}>
          {error}
        </p>
      )}
      {notice && <p style={{ color: 'var(--ok)', margin: 0 }}>{notice}</p>}

      <CourseInfo course={course} categories={categories} locked={locked} run={run} />
      <Curriculum course={course} locked={locked} run={run} />

      {canSubmit && (
        <section className="card" style={{ display: 'grid', gap: 8 }}>
          {course.status !== 'PUBLISHED' && course.problems.length > 0 && (
            <div>
              <strong>{t('course.problems')}</strong>
              <ul style={{ margin: '4px 0 0' }}>
                {course.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          <button
            className="btn"
            disabled={course.status !== 'PUBLISHED' && course.problems.length > 0}
            onClick={async () => {
              if (await run(() => api<CourseDetail>(`/teacher/courses/${id}/submit`, { method: 'POST' }))) {
                setNotice(t('course.submitted'));
              }
            }}
          >
            {course.status === 'PUBLISHED' ? t('course.submitNew') : t('course.submit')}
          </button>
        </section>
      )}
    </main>
  );
}

function CourseInfo({ course, categories, locked, run }: { course: CourseDetail; categories: CategoryNode[]; locked: boolean; run: Run }) {
  const [form, setForm] = useState({
    title: course.title,
    description: course.description,
    categoryId: course.categoryId ?? '',
    level: course.level,
    priceCredits: course.priceCredits === null ? '' : String(course.priceCredits),
  });
  const [uploading, setUploading] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e: FormEvent) {
    e.preventDefault();
    await run(() =>
      api<CourseDetail>(`/teacher/courses/${course.id}`, {
        method: 'PATCH',
        body: {
          title: form.title,
          description: form.description,
          categoryId: form.categoryId || null,
          level: form.level,
          priceCredits: form.priceCredits === '' ? null : Number(form.priceCredits),
        },
      }),
    );
  }

  async function uploadCover(file: File) {
    setUploading(true);
    await run(async () => {
      const ticket = (await api<UploadTicket>(`/teacher/courses/${course.id}/cover-upload`, { method: 'POST', body: { contentType: file.type } })).data;
      await uploadFile(ticket, file);
      return api<CourseDetail>(`/teacher/courses/${course.id}`, { method: 'PATCH', body: { coverKey: ticket.key } });
    });
    setUploading(false);
  }

  return (
    <section className="card">
      <form onSubmit={save} style={{ display: 'grid', gap: 12 }}>
        <strong>{t('course.info')}</strong>
        <fieldset disabled={locked} style={{ display: 'grid', gap: 12, border: 'none', padding: 0, margin: 0 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {course.coverUrl ? <img src={course.coverUrl} alt="" className="cover-preview" /> : <div className="cover-preview cover-placeholder" />}
            <label className="btn btn-ghost">
              {uploading ? t('course.uploading') : t('course.uploadCover')}
              <input
                type="file"
                accept={COVER_TYPES.join(',')}
                hidden
                onChange={(e) => e.target.files?.[0] && void uploadCover(e.target.files[0])}
              />
            </label>
          </div>
          <label style={{ display: 'grid', gap: 4 }}>
            {t('course.title')}
            <input className="input" required maxLength={200} value={form.title} onChange={set('title')} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            {t('course.description')}
            <textarea className="input" rows={5} maxLength={20000} value={form.description} onChange={set('description')} />
          </label>
          <div className="grid-2">
            <label style={{ display: 'grid', gap: 4 }}>
              {t('course.category')}
              <select className="input" value={form.categoryId} onChange={set('categoryId')}>
                <option value="">{t('course.chooseCategory')}</option>
                {categories.map((c) => (
                  <optgroup key={c.id} label={c.name}>
                    <option value={c.id}>{c.name}</option>
                    {c.children.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {c.name} › {ch.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              {t('course.level')}
              <select className="input" value={form.level} onChange={set('level')}>
                {COURSE_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {t(`course.level${l}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label style={{ display: 'grid', gap: 4 }}>
            {t('course.price')}
            <input className="input" type="number" min={1} step={1} value={form.priceCredits} onChange={set('priceCredits')} style={{ maxWidth: 200 }} />
            <span style={{ color: 'var(--muted)', fontSize: 14 }}>{t('course.lessonsTotal', { count: course.lessonsTotalCredits })}</span>
          </label>
          <button className="btn" style={{ justifySelf: 'start' }}>
            {t('course.save')}
          </button>
        </fieldset>
      </form>
    </section>
  );
}

function Curriculum({ course, locked, run }: { course: CourseDetail; locked: boolean; run: Run }) {
  const [sectionTitle, setSectionTitle] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const layout = (sections: SectionView[]) => sections.map((s) => ({ id: s.id, lessonIds: s.lessons.map((l) => l.id) }));
  const reorder = (next: { id: string; lessonIds: string[] }[]) =>
    run(() => api<CourseDetail>(`/teacher/courses/${course.id}/curriculum`, { method: 'PUT', body: { sections: next } }));

  function moveSection(i: number, dir: -1 | 1) {
    const next = layout(course.sections);
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    void reorder(next);
  }

  function moveLesson(si: number, li: number, dir: -1 | 1) {
    const next = layout(course.sections);
    const ids = next[si]!.lessonIds;
    const j = li + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[li], ids[j]] = [ids[j]!, ids[li]!];
    void reorder(next);
  }

  function moveToSection(lessonId: string, targetId: string) {
    const next = layout(course.sections).map((s) => ({ ...s, lessonIds: s.lessonIds.filter((x) => x !== lessonId) }));
    next.find((s) => s.id === targetId)!.lessonIds.push(lessonId);
    void reorder(next);
  }

  return (
    <section className="card" style={{ display: 'grid', gap: 12 }}>
      <strong>{t('course.curriculum')}</strong>
      {course.sections.map((s, si) => (
        <div key={s.id} className="section-block">
          <SectionHeader
            section={s}
            locked={locked}
            run={run}
            onUp={si > 0 ? () => moveSection(si, -1) : undefined}
            onDown={si < course.sections.length - 1 ? () => moveSection(si, 1) : undefined}
          />
          <ul className="lesson-list">
            {s.lessons.map((l, li) => (
              <li key={l.id}>
                <div className="lesson-row">
                  <span>
                    {l.title} <small>· {t(`course.type${l.type}` as MessageKey)}</small>{' '}
                    <small>· {t('course.credits', { count: l.priceCredits })}</small>
                    {l.isFreePreview && <small> · preview</small>}
                  </span>
                  <span style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                    {l.archived ? <span className="badge-status">{t('course.archived')}</span> : <LessonStatusBadge status={l.reviewStatus} />}
                    {!locked && !l.archived && (
                      <>
                        <button className="btn-icon" aria-label={t('course.up')} disabled={li === 0} onClick={() => moveLesson(si, li, -1)}>
                          ↑
                        </button>
                        <button className="btn-icon" aria-label={t('course.down')} disabled={li === s.lessons.length - 1} onClick={() => moveLesson(si, li, 1)}>
                          ↓
                        </button>
                      </>
                    )}
                    <button className="btn-icon" onClick={() => setOpen(open === l.id ? null : l.id)}>
                      {open === l.id ? t('course.close') : t('course.edit')}
                    </button>
                  </span>
                </div>
                {l.reviewNote && l.reviewStatus === 'REJECTED' && (
                  <p style={{ color: 'var(--err)', margin: '4px 0' }}>
                    {t('course.reviewNote')}: {l.reviewNote}
                  </p>
                )}
                {open === l.id && (
                  <LessonEditor
                    key={`${l.id}-${l.reviewStatus}-${l.type}`}
                    lesson={l}
                    sections={course.sections}
                    locked={locked || l.archived || l.reviewStatus === 'IN_REVIEW'}
                    run={run}
                    onMove={(target) => moveToSection(l.id, target)}
                  />
                )}
              </li>
            ))}
          </ul>
          {!locked && <AddLesson sectionId={s.id} run={run} />}
        </div>
      ))}
      {!locked && (
        <form
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => api<CourseDetail>(`/teacher/courses/${course.id}/sections`, { method: 'POST', body: { title: sectionTitle } }))) {
              setSectionTitle('');
            }
          }}
        >
          <input
            className="input"
            style={{ flex: '1 1 200px' }}
            required
            maxLength={200}
            placeholder={t('course.sectionPlaceholder')}
            aria-label={t('course.sectionPlaceholder')}
            value={sectionTitle}
            onChange={(e) => setSectionTitle(e.target.value)}
          />
          <button className="btn btn-ghost">{t('course.addSection')}</button>
        </form>
      )}
    </section>
  );
}

function SectionHeader({
  section,
  locked,
  run,
  onUp,
  onDown,
}: {
  section: SectionView;
  locked: boolean;
  run: Run;
  onUp?: () => void;
  onDown?: () => void;
}) {
  return (
    <div className="lesson-row" style={{ fontWeight: 700 }}>
      <span>{section.title}</span>
      {!locked && (
        <span style={{ display: 'flex', gap: 4 }}>
          <button className="btn-icon" aria-label={t('course.up')} disabled={!onUp} onClick={onUp}>
            ↑
          </button>
          <button className="btn-icon" aria-label={t('course.down')} disabled={!onDown} onClick={onDown}>
            ↓
          </button>
          <button
            className="btn-icon"
            onClick={() => {
              const title = window.prompt(t('course.rename'), section.title);
              if (title?.trim()) void run(() => api<CourseDetail>(`/teacher/sections/${section.id}`, { method: 'PATCH', body: { title } }));
            }}
          >
            {t('course.rename')}
          </button>
          {section.lessons.length === 0 && (
            <button className="btn-icon" onClick={() => void run(() => api<CourseDetail>(`/teacher/sections/${section.id}`, { method: 'DELETE' }))}>
              {t('course.remove')}
            </button>
          )}
        </span>
      )}
    </div>
  );
}

function AddLesson({ sectionId, run }: { sectionId: string; run: Run }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<LessonType>('TEXT');
  return (
    <form
      style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run(() => api<CourseDetail>(`/teacher/sections/${sectionId}/lessons`, { method: 'POST', body: { title, type } }))) setTitle('');
      }}
    >
      <input
        className="input"
        style={{ flex: '1 1 200px' }}
        required
        maxLength={200}
        placeholder={t('course.lessonPlaceholder')}
        aria-label={t('course.lessonPlaceholder')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <select className="input" style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value as LessonType)} aria-label="type">
        {AVAILABLE_LESSON_TYPES.map((ty) => (
          <option key={ty} value={ty}>
            {t(`course.type${ty}` as MessageKey)}
          </option>
        ))}
      </select>
      <button className="btn btn-ghost">{t('course.addLesson')}</button>
    </form>
  );
}

function LessonEditor({
  lesson,
  sections,
  locked,
  run,
  onMove,
}: {
  lesson: LessonView;
  sections: SectionView[];
  locked: boolean;
  run: Run;
  onMove: (sectionId: string) => void;
}) {
  // Live-ийн хуваарь, линк нийтлэгдсэн ч засагдана (ticket 14).
  const contentLocked = locked || (lesson.reviewStatus === 'APPROVED' && lesson.type !== 'LIVE');
  const live = lesson.content.type === 'LIVE' ? lesson.content : null;
  const liveInitial = {
    startsAt: live?.startsAt ? isoToUbLocal(live.startsAt) : '',
    duration: live?.durationMinutes ? String(live.durationMinutes) : '',
    meetingUrl: live?.meetingUrl ?? '',
  };
  const [liveForm, setLiveForm] = useState(liveInitial);
  const liveChanged = (Object.keys(liveInitial) as (keyof typeof liveInitial)[]).some((k) => liveForm[k] !== liveInitial[k]);
  const liveEnded = !!live?.startsAt && !!live.durationMinutes && liveState(live.startsAt, live.durationMinutes) === 'ENDED';
  const [title, setTitle] = useState(lesson.title);
  const [price, setPrice] = useState(String(lesson.priceCredits));
  const [preview, setPreview] = useState(lesson.isFreePreview);
  const [markdown, setMarkdown] = useState(lesson.content.type === 'TEXT' ? lesson.content.markdown : '');
  const [uploading, setUploading] = useState(false);
  const [quiz, setQuiz] = useState(() => quizInputFrom(lesson.content));
  const assignment = lesson.content.type === 'ASSIGNMENT' ? lesson.content : null;
  const [instructions, setInstructions] = useState(assignment?.instructions ?? '');
  const [maxScore, setMaxScore] = useState(assignment?.maxScore ? String(assignment.maxScore) : '');
  // Хадгалсны дараа API-ийн өгсөн id-уудтай болгож синк хийнэ
  useEffect(() => setQuiz(quizInputFrom(lesson.content)), [lesson.content]);

  async function save(e: FormEvent) {
    e.preventDefault();
    await run(() =>
      api<CourseDetail>(`/teacher/lessons/${lesson.id}`, {
        method: 'PATCH',
        body: {
          title,
          priceCredits: Number(price),
          isFreePreview: preview,
          ...(lesson.type === 'TEXT' && !contentLocked ? { content: { markdown } } : {}),
          ...(lesson.type === 'QUIZ' && !contentLocked ? { content: quiz } : {}),
          ...(lesson.type === 'ASSIGNMENT' && !contentLocked ? { content: { instructions, maxScore: Number(maxScore) } } : {}),
          // Офсетгүй цаг = Улаанбаатар (API хөрвүүлнэ). Өөрчлөгдсөн үед л — сануулга дахин товлогдоно.
          ...(lesson.type === 'LIVE' && !contentLocked && liveChanged
            ? { content: { startsAt: liveForm.startsAt, durationMinutes: Number(liveForm.duration), meetingUrl: liveForm.meetingUrl } }
            : {}),
        },
      }),
    );
  }

  async function uploadPdf(file: File) {
    setUploading(true);
    await run(async () => {
      const ticket = (await api<UploadTicket>(`/teacher/lessons/${lesson.id}/pdf-upload`, { method: 'POST' })).data;
      await uploadFile(ticket, file);
      return api<CourseDetail>(`/teacher/lessons/${lesson.id}`, { method: 'PATCH', body: { content: { fileKey: ticket.key, fileName: file.name } } });
    });
    setUploading(false);
  }

  return (
    <form onSubmit={save} className="lesson-editor">
      <fieldset disabled={locked} style={{ display: 'grid', gap: 10, border: 'none', padding: 0, margin: 0 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          {t('course.title')}
          <input className="input" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 4 }}>
            {t('course.lessonPrice')}
            <input className="input" type="number" min={0} step={1} value={price} onChange={(e) => setPrice(e.target.value)} style={{ maxWidth: 140 }} />
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
            {t('course.freePreview')}
          </label>
          {sections.length > 1 && (
            <select className="input" style={{ width: 'auto' }} value={lesson.sectionId} onChange={(e) => onMove(e.target.value)} aria-label={t('course.curriculum')}>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          )}
        </div>

        {contentLocked && lesson.reviewStatus === 'APPROVED' && <p style={{ margin: 0, color: 'var(--muted)' }}>{t('course.contentLocked')}</p>}

        {lesson.type === 'TEXT' &&
          (contentLocked ? (
            <LessonContentPreview lesson={lesson} />
          ) : (
            <div className="grid-2">
              <label style={{ display: 'grid', gap: 4 }}>
                {t('course.markdown')}
                <textarea className="input" rows={12} value={markdown} onChange={(e) => setMarkdown(e.target.value)} style={{ fontFamily: 'ui-monospace, monospace' }} />
              </label>
              <div className="card" style={{ overflow: 'auto', maxHeight: 360 }}>
                <Markdown source={markdown} />
              </div>
            </div>
          ))}

        {lesson.type === 'LIVE' && (
          <div style={{ display: 'grid', gap: 10 }}>
            <LessonContentPreview lesson={lesson} />
            {!contentLocked && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
                <label style={{ display: 'grid', gap: 4 }}>
                  {t('live.startsAt')}
                  <input
                    className="input"
                    type="datetime-local"
                    value={liveForm.startsAt}
                    onChange={(e) => setLiveForm((f) => ({ ...f, startsAt: e.target.value }))}
                  />
                </label>
                <label style={{ display: 'grid', gap: 4 }}>
                  {t('live.duration')}
                  <input
                    className="input"
                    type="number"
                    min={LIVE_DURATION_MIN}
                    max={LIVE_DURATION_MAX}
                    step={5}
                    style={{ maxWidth: 140 }}
                    value={liveForm.duration}
                    onChange={(e) => setLiveForm((f) => ({ ...f, duration: e.target.value }))}
                  />
                </label>
                <label style={{ display: 'grid', gap: 4, flex: '1 1 260px' }}>
                  {t('live.meetingUrl')}
                  <input
                    className="input"
                    type="url"
                    maxLength={500}
                    placeholder={t('live.meetingUrlPlaceholder')}
                    value={liveForm.meetingUrl}
                    onChange={(e) => setLiveForm((f) => ({ ...f, meetingUrl: e.target.value }))}
                  />
                </label>
              </div>
            )}
            {lesson.reviewStatus === 'APPROVED' && !locked && <small className="muted">{t('live.editableHint')}</small>}
            {liveEnded && !locked && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <small className="muted">{t('live.convertHint')}</small>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    if (window.confirm(t('live.convertConfirm'))) {
                      void run(() => api<CourseDetail>(`/teacher/lessons/${lesson.id}/convert-to-video`, { method: 'POST' }));
                    }
                  }}
                >
                  {t('live.convert')}
                </button>
              </div>
            )}
          </div>
        )}

        {lesson.type === 'VIDEO' && <LessonContentPreview lesson={lesson} />}

        {lesson.type === 'PDF' && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <LessonContentPreview lesson={lesson} />
            {!contentLocked && (
              <label className="btn btn-ghost">
                {uploading ? t('course.uploading') : t('course.uploadPdf')}
                <input type="file" accept="application/pdf" hidden onChange={(e) => e.target.files?.[0] && void uploadPdf(e.target.files[0])} />
              </label>
            )}
          </div>
        )}

        {lesson.type === 'QUIZ' &&
          (contentLocked ? <LessonContentPreview lesson={lesson} /> : <QuizEditor value={quiz} onChange={setQuiz} />)}

        {lesson.type === 'ASSIGNMENT' &&
          (contentLocked ? (
            <LessonContentPreview lesson={lesson} />
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ display: 'grid', gap: 4 }}>
                {t('assignment.maxScore')}
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={ASSIGNMENT_MAX_SCORE_LIMIT}
                  step={1}
                  style={{ maxWidth: 140 }}
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value)}
                />
              </label>
              <div className="grid-2">
                <label style={{ display: 'grid', gap: 4 }}>
                  {t('assignment.instructions')}
                  <textarea className="input" rows={10} value={instructions} onChange={(e) => setInstructions(e.target.value)} style={{ fontFamily: 'ui-monospace, monospace' }} />
                </label>
                <div className="card" style={{ overflow: 'auto', maxHeight: 320 }}>
                  <Markdown source={instructions} />
                </div>
              </div>
              <small className="muted">{t('assignment.editorHint')}</small>
            </div>
          ))}

        {lesson.problems.length > 0 && !contentLocked && (
          <p style={{ margin: 0, color: 'var(--err)' }}>
            {t('course.problems')} {lesson.problems.join('; ')}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn">{t('course.save')}</button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              if (window.confirm(t('course.removeConfirm'))) void run(() => api<CourseDetail>(`/teacher/lessons/${lesson.id}`, { method: 'DELETE' }));
            }}
          >
            {t('course.remove')}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
