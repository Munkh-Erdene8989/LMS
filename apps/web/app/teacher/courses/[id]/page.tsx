'use client';

import { use, useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ASSIGNMENT_MAX_SCORE_LIMIT,
  AVAILABLE_LESSON_TYPES,
  COURSE_LEVELS,
  COVER_MAX_BYTES,
  COVER_TYPES,
  attachmentContentType,
  isoToUbLocal,
  LESSON_ATTACHMENT_ACCEPT,
  LESSON_ATTACHMENT_MAX_BYTES,
  LESSON_ATTACHMENTS_MAX,
  LIVE_DURATION_MAX,
  LIVE_DURATION_MIN,
  liveState,
  PDF_MAX_BYTES,
  type CategoryNode,
  type CourseDetail,
  type LessonAttachmentView,
  type LessonType,
  type LessonView,
  type SectionView,
  type UploadTicket,
  type VideoLessonContent,
  type VideoUploadTicket,
  videoUploadAllowed,
} from '@lms/shared';
import { api, ApiRequestError, useApiFailure } from '@/lib/client-api';
import { t, type MessageKey } from '@/lib/i18n';
import { uploadFile, uploadWithProgress } from '@/lib/upload';
import { AttachmentList, LessonContentPreview, LessonStatusBadge, StatusBadge } from '../../../course-ui';
import { Markdown } from '../../../markdown';
import { Button } from '../../../ui/button';
import { useConfirm } from '../../../ui/confirm';
import { FileDrop } from '../../../ui/file-drop';
import { Skeleton } from '../../../ui/skeleton';
import { useToast } from '../../../ui/toast';
import { PromptDialog } from '../../prompt-dialog';
import s from '../../teacher.module.css';
import { useUnsavedWarning } from '../../use-unsaved';
import { QuizEditor, quizInputFrom } from './quiz-editor';

const MB = 1024 * 1024;

type Run = (fn: () => Promise<{ data: CourseDetail } | void>) => Promise<boolean>;

export default function CourseEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const fail = useApiFailure();
  const { toast } = useToast();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<CourseDetail>(`/teacher/courses/${id}`)
      .then((r) => setCourse(r.data))
      .catch((err: unknown) => {
        const msg = fail(err);
        if (msg) setError(msg);
      });
    void api<CategoryNode[]>('/categories').then((r) => setCategories(r.data));
  }, [id, fail]);

  /** API дуудаад шинэ курсийн төлөвийг хүлээн авна; алдааг харуулна. */
  const run: Run = useCallback(async (fn) => {
    setError(null);
    try {
      const r = await fn();
      if (r) setCourse(r.data);
      return true;
    } catch (err) {
      setError(err instanceof ApiRequestError || err instanceof Error ? err.message : t('auth.genericError'));
      return false;
    }
  }, []);

  if (!course) {
    return (
      <div className={s.page}>
        {error ? (
          <p role="alert" className={s.error}>
            {error}
          </p>
        ) : (
          <div className={s.stack} aria-busy="true" aria-label={t('ui.loading')}>
            <Skeleton height={36} width="50%" />
            <Skeleton height={280} radius={22} />
          </div>
        )}
      </div>
    );
  }

  const locked = course.status === 'IN_REVIEW';
  const isPrivate = course.visibility === 'PRIVATE';
  const pendingNew = course.sections.flatMap((x) => x.lessons).filter((l) => !l.archived && (l.reviewStatus === 'DRAFT' || l.reviewStatus === 'REJECTED'));
  const canSubmit = !locked && (course.status !== 'PUBLISHED' || pendingNew.length > 0);

  return (
    <div className={s.page}>
      <div className={s.pageHead}>
        <h1 className={s.title}>{course.title}</h1>
        <StatusBadge status={course.status} />
        {isPrivate && <span className="badge-status">{t('course.privateBadge')}</span>}
      </div>
      {isPrivate && <p className="muted">{t('course.privateHint')}</p>}

      {course.reviewNote && course.status === 'REJECTED' && (
        <p className={`card ${s.cardDanger} ${s.pre}`}>
          <strong>{t('course.reviewNote')}:</strong> {course.reviewNote}
        </p>
      )}
      {locked && <p className="card">{t('course.inReviewLocked')}</p>}
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}

      <CourseInfo course={course} categories={categories} locked={locked} run={run} />
      <Curriculum course={course} locked={locked} run={run} isPrivate={isPrivate} />

      {canSubmit && (
        <section className={`card ${s.card}`}>
          {course.status !== 'PUBLISHED' && course.problems.length > 0 && (
            <div>
              <strong>{t('course.problems')}</strong>
              <ul className={s.problems}>
                {course.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          <Button
            className={s.startSelf}
            disabled={course.status !== 'PUBLISHED' && course.problems.length > 0}
            onClick={async () => {
              if (await run(() => api<CourseDetail>(`/teacher/courses/${id}/submit`, { method: 'POST' }))) {
                toast(t(isPrivate ? 'course.published' : 'course.submitted'));
              }
            }}
          >
            {isPrivate ? t('course.publish') : course.status === 'PUBLISHED' ? t('course.submitNew') : t('course.submit')}
          </Button>
        </section>
      )}
    </div>
  );
}

function CourseInfo({ course, categories, locked, run }: { course: CourseDetail; categories: CategoryNode[]; locked: boolean; run: Run }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    title: course.title,
    description: course.description,
    categoryId: course.categoryId ?? '',
    level: course.level,
    priceCredits: course.priceCredits === null ? '' : String(course.priceCredits),
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const dirty =
    form.title !== course.title ||
    form.description !== course.description ||
    form.categoryId !== (course.categoryId ?? '') ||
    form.level !== course.level ||
    form.priceCredits !== (course.priceCredits === null ? '' : String(course.priceCredits));
  useUnsavedWarning(dirty || uploading);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const ok = await run(() =>
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
    setSaving(false);
    if (ok) toast(t('teacherUi.saved'));
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
      <form onSubmit={save} className={s.form}>
        <h2 className={s.sectionTitle}>{t('course.info')}</h2>
        <fieldset disabled={locked} className={s.fieldset}>
          <div className={s.row}>
            {course.coverUrl ? (
              <img src={course.coverUrl} alt="" className={s.coverPreview} width={240} height={135} />
            ) : (
              <div className={s.coverPreview} />
            )}
            <FileDrop
              label={t('course.uploadCover')}
              hint={t('ui.fileHint', { types: 'JPG/PNG/WEBP', max: COVER_MAX_BYTES / MB })}
              accept={COVER_TYPES.join(',')}
              maxBytes={COVER_MAX_BYTES}
              disabled={locked}
              progress={uploading || null}
              progressLabel={t('course.uploading')}
              onFile={(file) => void uploadCover(file)}
            />
          </div>
          <label className={s.field}>
            {t('course.title')}
            <input className="input" name="title" autoComplete="off" required maxLength={200} value={form.title} onChange={set('title')} />
          </label>
          <label className={s.field}>
            {t('course.description')}
            <textarea className="input" name="description" autoComplete="off" rows={5} maxLength={20000} value={form.description} onChange={set('description')} />
          </label>
          <div className="grid-2">
            <label className={s.field}>
              {t('course.category')}
              <select className="input" name="categoryId" value={form.categoryId} onChange={set('categoryId')}>
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
            <label className={s.field}>
              {t('course.level')}
              <select className="input" name="level" value={form.level} onChange={set('level')}>
                {COURSE_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {t(`course.level${l}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {course.visibility !== 'PRIVATE' && (
          <label className={s.field}>
            {t('course.price')}
            <input
              className={`input ${s.narrowInput}`}
              name="priceCredits"
              type="number"
              inputMode="numeric"
              autoComplete="off"
              min={1}
              step={1}
              value={form.priceCredits}
              onChange={set('priceCredits')}
            />
            <span className={s.hint}>{t('course.lessonsTotal', { count: course.lessonsTotalCredits })}</span>
          </label>
          )}
          <div className={s.row}>
            <Button type="submit" loading={saving} loadingLabel={t('teacherUi.saving')}>
              {t('course.save')}
            </Button>
            {dirty && <small className={s.dirty}>{t('teacherUi.unsaved')}</small>}
          </div>
        </fieldset>
      </form>
    </section>
  );
}

function Curriculum({ course, locked, run, isPrivate }: { course: CourseDetail; locked: boolean; run: Run; isPrivate: boolean }) {
  const confirm = useConfirm();
  const [sectionTitle, setSectionTitle] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const layout = (sections: SectionView[]) => sections.map((x) => ({ id: x.id, lessonIds: x.lessons.map((l) => l.id) }));
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
    const next = layout(course.sections).map((x) => ({ ...x, lessonIds: x.lessonIds.filter((y) => y !== lessonId) }));
    next.find((x) => x.id === targetId)!.lessonIds.push(lessonId);
    void reorder(next);
  }

  return (
    <section className={`card ${s.card}`}>
      <h2 className={s.sectionTitle}>{t('course.curriculum')}</h2>
      {course.sections.map((sec, si) => (
        <div key={sec.id} className={s.section}>
          <SectionHeader
            section={sec}
            locked={locked}
            run={run}
            confirm={confirm}
            onUp={si > 0 ? () => moveSection(si, -1) : undefined}
            onDown={si < course.sections.length - 1 ? () => moveSection(si, 1) : undefined}
          />
          <ul className={s.lessonList}>
            {sec.lessons.map((l, li) => (
              <li key={l.id}>
                <div className={s.lessonRow}>
                  <span>
                    {l.title} <small className={s.lessonMeta}>· {t(`course.type${l.type}` as MessageKey)}</small>{' '}
                    {!isPrivate && <small className={s.lessonMeta}>· {t('course.credits', { count: l.priceCredits })}</small>}
                    {!isPrivate && l.isFreePreview &&<small className={s.lessonMeta}> · preview</small>}
                  </span>
                  <span className={s.row}>
                    {l.archived ? <span className="badge-status">{t('course.archived')}</span> : <LessonStatusBadge status={l.reviewStatus} />}
                    {!locked && !l.archived && (
                      <>
                        <button type="button" className="btn-icon" aria-label={t('course.up')} disabled={li === 0} onClick={() => moveLesson(si, li, -1)}>
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          aria-label={t('course.down')}
                          disabled={li === sec.lessons.length - 1}
                          onClick={() => moveLesson(si, li, 1)}
                        >
                          ↓
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="btn-icon"
                      aria-expanded={open === l.id}
                      aria-controls={`lesson-editor-${l.id}`}
                      onClick={() => setOpen(open === l.id ? null : l.id)}
                    >
                      {open === l.id ? t('course.close') : t('course.edit')}
                    </button>
                  </span>
                </div>
                {l.reviewNote && l.reviewStatus === 'REJECTED' && (
                  <p className={s.error}>
                    {t('course.reviewNote')}: {l.reviewNote}
                  </p>
                )}
                {open === l.id && (
                  <LessonEditor
                    key={`${l.id}-${l.reviewStatus}-${l.type}`}
                    lesson={l}
                    sections={course.sections}
                    isPrivate={isPrivate}
                    locked={locked || l.archived || l.reviewStatus === 'IN_REVIEW'}
                    run={run}
                    confirm={confirm}
                    onMove={(target) => moveToSection(l.id, target)}
                  />
                )}
              </li>
            ))}
          </ul>
          {!locked && <AddLesson sectionId={sec.id} run={run} isPrivate={isPrivate} />}
        </div>
      ))}
      {!locked && (
        <form
          className={s.row}
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => api<CourseDetail>(`/teacher/courses/${course.id}/sections`, { method: 'POST', body: { title: sectionTitle } }))) {
              setSectionTitle('');
            }
          }}
        >
          <input
            className={`input ${s.grow}`}
            name="sectionTitle"
            autoComplete="off"
            required
            maxLength={200}
            placeholder={t('course.sectionPlaceholder')}
            aria-label={t('course.sectionPlaceholder')}
            value={sectionTitle}
            onChange={(e) => setSectionTitle(e.target.value)}
          />
          <Button type="submit" variant="secondary">
            {t('course.addSection')}
          </Button>
        </form>
      )}
    </section>
  );
}

function SectionHeader({
  section,
  locked,
  run,
  confirm,
  onUp,
  onDown,
}: {
  section: SectionView;
  locked: boolean;
  run: Run;
  confirm: ReturnType<typeof useConfirm>;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  return (
    <div className={`${s.sectionHead}`}>
      <span>{section.title}</span>
      {!locked && (
        <span className={s.row}>
          <button type="button" className="btn-icon" aria-label={t('course.up')} disabled={!onUp} onClick={onUp}>
            ↑
          </button>
          <button type="button" className="btn-icon" aria-label={t('course.down')} disabled={!onDown} onClick={onDown}>
            ↓
          </button>
          <button type="button" className="btn-icon" onClick={() => setRenaming(true)}>
            {t('course.rename')}
          </button>
          {section.lessons.length === 0 && (
            <button
              type="button"
              className="btn-icon"
              onClick={async () => {
                const ok = await confirm({
                  title: t('teacherUi.removeSectionTitle'),
                  body: section.title,
                  confirmLabel: t('course.remove'),
                  danger: true,
                });
                if (ok) void run(() => api<CourseDetail>(`/teacher/sections/${section.id}`, { method: 'DELETE' }));
              }}
            >
              {t('course.remove')}
            </button>
          )}
        </span>
      )}
      <PromptDialog
        open={renaming}
        title={t('course.rename')}
        label={t('course.title')}
        initial={section.title}
        required
        maxLength={200}
        onClose={() => setRenaming(false)}
        onSubmit={(title) => {
          setRenaming(false);
          if (title) void run(() => api<CourseDetail>(`/teacher/sections/${section.id}`, { method: 'PATCH', body: { title } }));
        }}
      />
    </div>
  );
}

function AddLesson({ sectionId, run, isPrivate }: { sectionId: string; run: Run; isPrivate: boolean }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<LessonType>('TEXT');
  useUnsavedWarning(title.trim() !== '');
  return (
    <form
      className={s.row}
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run(() => api<CourseDetail>(`/teacher/sections/${sectionId}/lessons`, { method: 'POST', body: { title, type } }))) setTitle('');
      }}
    >
      <input
        className={`input ${s.grow}`}
        name="lessonTitle"
        autoComplete="off"
        required
        maxLength={200}
        placeholder={t('course.lessonPlaceholder')}
        aria-label={t('course.lessonPlaceholder')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <select
        className={`input ${s.autoWidth}`}
        name="lessonType"
        value={type}
        onChange={(e) => setType(e.target.value as LessonType)}
        aria-label={t('teacherUi.lessonType')}
      >
        {AVAILABLE_LESSON_TYPES.filter((ty) => !(isPrivate && ty === 'ASSIGNMENT')).map((ty) => (
          <option key={ty} value={ty}>
            {t(`course.type${ty}` as MessageKey)}
          </option>
        ))}
      </select>
      <Button type="submit" variant="secondary">
        {t('course.addLesson')}
      </Button>
    </form>
  );
}

function LessonEditor({
  lesson,
  sections,
  isPrivate,
  locked,
  run,
  confirm,
  onMove,
}: {
  lesson: LessonView;
  sections: SectionView[];
  isPrivate: boolean;
  locked: boolean;
  run: Run;
  confirm: ReturnType<typeof useConfirm>;
  onMove: (sectionId: string) => void;
}) {
  const { toast } = useToast();
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
  const markdownInitial = lesson.content.type === 'TEXT' ? lesson.content.markdown : '';
  const [markdown, setMarkdown] = useState(markdownInitial);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quiz, setQuiz] = useState(() => quizInputFrom(lesson.content));
  const assignment = lesson.content.type === 'ASSIGNMENT' ? lesson.content : null;
  const instructionsInitial = assignment?.instructions ?? '';
  const maxScoreInitial = assignment?.maxScore ? String(assignment.maxScore) : '';
  const [instructions, setInstructions] = useState(instructionsInitial);
  const [maxScore, setMaxScore] = useState(maxScoreInitial);
  // Хадгалсны дараа API-ийн өгсөн id-уудтай болгож синк хийнэ
  useEffect(() => setQuiz(quizInputFrom(lesson.content)), [lesson.content]);

  const dirty =
    !locked &&
    (title !== lesson.title ||
      price !== String(lesson.priceCredits) ||
      preview !== lesson.isFreePreview ||
      (!contentLocked &&
        (markdown !== markdownInitial ||
          instructions !== instructionsInitial ||
          maxScore !== maxScoreInitial ||
          liveChanged ||
          (lesson.type === 'QUIZ' && JSON.stringify(quiz) !== JSON.stringify(quizInputFrom(lesson.content))))));
  useUnsavedWarning(dirty || uploading);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const ok = await run(() =>
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
    setSaving(false);
    if (ok) toast(t('teacherUi.saved'));
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
    <form onSubmit={save} className={s.lessonEditor} id={`lesson-editor-${lesson.id}`}>
      <fieldset disabled={locked} className={s.fieldset}>
        <label className={s.field}>
          {t('course.title')}
          <input className="input" name="title" autoComplete="off" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className={s.rowEnd}>
          {!isPrivate && (
          <label className={s.field}>
            {t('course.lessonPrice')}
            <input
              className={`input ${s.narrowInput}`}
              name="price"
              type="number"
              inputMode="numeric"
              autoComplete="off"
              min={0}
              step={1}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          )}
          {!isPrivate && (
          <label className={s.inline}>
            <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
            {t('course.freePreview')}
          </label>
          )}
          {sections.length > 1 && (
            <select
              className={`input ${s.autoWidth}`}
              name="sectionId"
              value={lesson.sectionId}
              onChange={(e) => onMove(e.target.value)}
              aria-label={t('teacherUi.moveToSection')}
            >
              {sections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.title}
                </option>
              ))}
            </select>
          )}
        </div>

        {contentLocked && lesson.reviewStatus === 'APPROVED' && <p className={s.hint}>{t('course.contentLocked')}</p>}

        {lesson.type === 'TEXT' &&
          (contentLocked ? (
            <LessonContentPreview lesson={lesson} />
          ) : (
            <div className="grid-2">
              <label className={s.field}>
                {t('course.markdown')}
                <textarea
                  className={`input ${s.mono}`}
                  name="markdown"
                  autoComplete="off"
                  spellCheck={false}
                  rows={12}
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                />
              </label>
              <div className={`card ${s.preview}`} aria-label={t('teacherUi.preview')}>
                <Markdown source={markdown} />
              </div>
            </div>
          ))}

        {lesson.type === 'LIVE' && (
          <div className={s.stack}>
            <LessonContentPreview lesson={lesson} />
            {!contentLocked && (
              <div className={s.rowEnd}>
                <label className={s.field}>
                  {t('live.startsAt')}
                  <input
                    className="input"
                    name="startsAt"
                    type="datetime-local"
                    value={liveForm.startsAt}
                    onChange={(e) => setLiveForm((f) => ({ ...f, startsAt: e.target.value }))}
                  />
                </label>
                <label className={s.field}>
                  {t('live.duration')}
                  <input
                    className={`input ${s.narrowInput}`}
                    name="duration"
                    type="number"
                    inputMode="numeric"
                    autoComplete="off"
                    min={LIVE_DURATION_MIN}
                    max={LIVE_DURATION_MAX}
                    step={5}
                    value={liveForm.duration}
                    onChange={(e) => setLiveForm((f) => ({ ...f, duration: e.target.value }))}
                  />
                </label>
                <label className={`${s.field} ${s.grow}`}>
                  {t('live.meetingUrl')}
                  <input
                    className="input"
                    name="meetingUrl"
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
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
              <div className={s.row}>
                <small className="muted">{t('live.convertHint')}</small>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    const ok = await confirm({ title: t('teacherUi.convertTitle'), body: t('live.convertConfirm'), confirmLabel: t('live.convert') });
                    if (ok) void run(() => api<CourseDetail>(`/teacher/lessons/${lesson.id}/convert-to-video`, { method: 'POST' }));
                  }}
                >
                  {t('live.convert')}
                </Button>
              </div>
            )}
          </div>
        )}

        {lesson.content.type === 'VIDEO' && <VideoUpload lesson={lesson} content={lesson.content} locked={locked} run={run} />}

        {lesson.type === 'PDF' && (
          <div className={s.row}>
            <LessonContentPreview lesson={lesson} />
            {!contentLocked && (
              <FileDrop
                label={t('course.uploadPdf')}
                hint={t('ui.fileHint', { types: 'PDF', max: PDF_MAX_BYTES / MB })}
                accept="application/pdf"
                maxBytes={PDF_MAX_BYTES}
                progress={uploading || null}
                progressLabel={t('course.uploading')}
                onFile={(file) => void uploadPdf(file)}
              />
            )}
          </div>
        )}

        {lesson.type === 'QUIZ' &&
          (contentLocked ? <LessonContentPreview lesson={lesson} /> : <QuizEditor value={quiz} onChange={setQuiz} />)}

        {lesson.type === 'ASSIGNMENT' &&
          (contentLocked ? (
            <LessonContentPreview lesson={lesson} />
          ) : (
            <div className={s.stack}>
              <label className={s.field}>
                {t('assignment.maxScore')}
                <input
                  className={`input ${s.narrowInput}`}
                  name="maxScore"
                  type="number"
                  inputMode="numeric"
                  autoComplete="off"
                  min={1}
                  max={ASSIGNMENT_MAX_SCORE_LIMIT}
                  step={1}
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value)}
                />
              </label>
              <div className="grid-2">
                <label className={s.field}>
                  {t('assignment.instructions')}
                  <textarea
                    className={`input ${s.mono}`}
                    name="instructions"
                    autoComplete="off"
                    spellCheck={false}
                    rows={10}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                  />
                </label>
                <div className={`card ${s.preview}`} aria-label={t('teacherUi.preview')}>
                  <Markdown source={instructions} />
                </div>
              </div>
              <small className="muted">{t('assignment.editorHint')}</small>
            </div>
          ))}

        <LessonAttachments lesson={lesson} locked={locked} run={run} confirm={confirm} />

        {lesson.problems.length > 0 && !contentLocked && (
          <p className={s.error}>
            {t('course.problems')} {lesson.problems.join('; ')}
          </p>
        )}

        <div className={s.row}>
          <Button type="submit" loading={saving} loadingLabel={t('teacherUi.saving')}>
            {t('course.save')}
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              const ok = await confirm({
                title: t('teacherUi.removeLessonTitle'),
                body: t('course.removeConfirm'),
                confirmLabel: t('course.remove'),
                danger: true,
              });
              if (ok) void run(() => api<CourseDetail>(`/teacher/lessons/${lesson.id}`, { method: 'DELETE' }));
            }}
          >
            {t('course.remove')}
          </Button>
          {dirty && <small className={s.dirty}>{t('teacherUi.unsaved')}</small>}
        </div>
      </fieldset>
    </form>
  );
}

/** Видеоны төлөвийг автоматаар шалгах давтамж (UPLOADING / PROCESSING үед) */
const VIDEO_POLL_MS = 10_000;

/**
 * Видео lesson: файлыг browser-оос шууд Mux руу (API-аар дамжихгүй), дараа нь боловсруулалтын төлөв.
 * Төлөвийг webhook шинэчилнэ; энд `video-sync`-ээр (Mux API) давхар шалгана — webhook-гүй local dev-д ч ажиллана.
 */
function VideoUpload({ lesson, content, locked, run }: { lesson: LessonView; content: VideoLessonContent; locked: boolean; run: Run }) {
  const [percent, setPercent] = useState<number | null>(null);
  useUnsavedWarning(percent !== null);
  const allowed = !locked && videoUploadAllowed(lesson.reviewStatus, content);
  const pending = content.status === 'UPLOADING' || content.status === 'PROCESSING';
  const sync = useCallback(
    () => run(() => api<CourseDetail>(`/teacher/lessons/${lesson.id}/video-sync`, { method: 'POST' })),
    [lesson.id, run],
  );

  useEffect(() => {
    if (!pending || percent !== null) return;
    const timer = setInterval(() => void sync(), VIDEO_POLL_MS);
    return () => clearInterval(timer);
  }, [pending, percent, sync]);

  async function upload(file: File) {
    setPercent(0);
    await run(async () => {
      const ticket = (await api<VideoUploadTicket>(`/teacher/lessons/${lesson.id}/video-upload`, { method: 'POST' })).data;
      await uploadWithProgress(ticket.url, file, setPercent, (status) => t('video.uploadFailed', { status }));
      return api<CourseDetail>(`/teacher/lessons/${lesson.id}/video-sync`, { method: 'POST' });
    });
    setPercent(null);
  }

  return (
    <div className={s.stack}>
      <LessonContentPreview lesson={lesson} />
      {pending && <small className="muted">{t('video.processingHint')}</small>}
      {allowed && content.fromLive && lesson.reviewStatus === 'APPROVED' && <small className="muted">{t('video.recordingHint')}</small>}
      {allowed && (
        <div className={s.row}>
          <FileDrop
            label={content.status ? t('video.replace') : t('video.upload')}
            hint={t('video.fileHint')}
            accept="video/*"
            progress={percent}
            progressLabel={percent !== null ? t('video.uploadingPercent', { percent }) : undefined}
            onFile={(file) => void upload(file)}
          />
          {pending && percent === null && (
            <Button variant="secondary" onClick={() => void sync()}>
              {t('video.check')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Хичээлийн татаж авах материал. Засах дүрэм контенттой ижил (API): шалгагдсан (APPROVED) хичээлд түгжигдэнэ.
 * Upload: төрлийг өргөтгөлөөр ч тогтооно (`attachmentContentType`) → signed URL → storage → бүртгэх.
 */
function LessonAttachments({
  lesson,
  locked,
  run,
  confirm,
}: {
  lesson: LessonView;
  locked: boolean;
  run: Run;
  confirm: ReturnType<typeof useConfirm>;
}) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  useUnsavedWarning(uploading);
  const frozen = locked || lesson.reviewStatus === 'APPROVED';
  const full = lesson.attachments.length >= LESSON_ATTACHMENTS_MAX;
  if (frozen && lesson.attachments.length === 0) return null;

  async function upload(file: File) {
    const contentType = attachmentContentType(file.name, file.type);
    if (!contentType) return toast(t('course.attachmentWrongType'));
    setUploading(true);
    await run(async () => {
      const ticket = (await api<UploadTicket>(`/teacher/lessons/${lesson.id}/attachment-upload`, { method: 'POST', body: { contentType } }))
        .data;
      await uploadFile(ticket, file, contentType);
      return api<CourseDetail>(`/teacher/lessons/${lesson.id}/attachments`, {
        method: 'POST',
        body: { fileKey: ticket.key, fileName: file.name },
      });
    });
    setUploading(false);
  }

  async function remove(a: LessonAttachmentView) {
    const ok = await confirm({
      title: t('course.removeAttachmentTitle'),
      body: t('course.removeAttachmentConfirm', { name: a.fileName }),
      confirmLabel: t('course.remove'),
      danger: true,
    });
    if (ok) void run(() => api<CourseDetail>(`/teacher/attachments/${a.id}`, { method: 'DELETE' }));
  }

  return (
    <div className={s.stack}>
      <strong>{t('course.attachments')}</strong>
      <small className="muted">{frozen ? t('course.attachmentsLocked') : t('course.attachmentsHint')}</small>
      <AttachmentList attachments={lesson.attachments} onRemove={frozen ? undefined : (a) => void remove(a)} />
      {!frozen &&
        (full ? (
          <small className="muted">{t('course.attachmentsFull', { max: LESSON_ATTACHMENTS_MAX })}</small>
        ) : (
          <FileDrop
            label={t('course.uploadAttachment')}
            hint={t('ui.fileHint', { types: t('course.attachmentTypes'), max: LESSON_ATTACHMENT_MAX_BYTES / MB })}
            accept={LESSON_ATTACHMENT_ACCEPT}
            maxBytes={LESSON_ATTACHMENT_MAX_BYTES}
            progress={uploading || null}
            progressLabel={t('course.uploading')}
            onFile={(file) => void upload(file)}
          />
        ))}
    </div>
  );
}
