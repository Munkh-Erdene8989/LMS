import type { Prisma } from '@lms/db';
import type { CourseDetail, CourseSummary, LessonContent, LessonView, QuizContent } from '@lms/shared';
import { liveEndsAt } from '@lms/shared';
import type { StorageAdapter } from '../adapters/storage';
import { LESSON_TYPES, type AssignmentContent, type LiveContent, type PdfContent, type StoredQuiz, type TextContent, type VideoContent } from './lesson-types';

export const courseDetailInclude = {
  teacher: { select: { id: true, name: true } },
  sections: {
    orderBy: { position: 'asc' },
    include: { lessons: { orderBy: { position: 'asc' } } },
  },
} as const satisfies Prisma.CourseInclude;

export type CourseWithCurriculum = Prisma.CourseGetPayload<{ include: typeof courseDetailInclude }>;
type LessonRow = CourseWithCurriculum['sections'][number]['lessons'][number];

/** PDF-ийн signed URL хэр удаан хүчинтэй (teacher/admin урьдчилан үзэхэд) */
const PREVIEW_URL_TTL = 10 * 60;

export function lessonProblems(lesson: Pick<LessonRow, 'type' | 'content' | 'title'>): string[] {
  const def = LESSON_TYPES[lesson.type];
  const problems = def ? def.problems(lesson.content) : ['Энэ төрөл одоогоор дэмжигдээгүй'];
  return lesson.title.trim() ? problems : ['Гарчиг хоосон', ...problems];
}

/**
 * Курс бүхэлдээ шалгуулахад (private бол нийтлэхэд) бэлэн эсэх.
 * PRIVATE курс үнэгүй, каталогт гарахгүй тул үнэ, ангилал, зургийг шаардахгүй.
 */
export function courseProblems(course: CourseWithCurriculum): string[] {
  const problems: string[] = [];
  const isPrivate = course.visibility === 'PRIVATE';
  if (!course.title.trim()) problems.push('Курсийн гарчиг хоосон');
  if (!course.description.trim()) problems.push('Курсийн тайлбар хоосон');
  if (!isPrivate && !course.categoryId) problems.push('Ангилал сонгоогүй');
  if (!isPrivate && !course.coverKey) problems.push('Курсийн зураг оруулаагүй');
  const lessons = activeLessons(course);
  if (lessons.length === 0) problems.push('Дор хаяж нэг хичээл нэмнэ үү');
  if (!isPrivate) {
    if (course.priceCredits === null) problems.push('Курсийн бүтэн үнэ тогтоогоогүй');
    else if (lessons.length > 0 && course.priceCredits > lessonsTotal(course)) {
      problems.push('Курсийн бүтэн үнэ хичээлүүдийн нийт үнээс их байна');
    }
  }
  for (const l of lessons) {
    if (l.reviewStatus === 'APPROVED') continue;
    for (const p of lessonProblems(l)) problems.push(`"${l.title || 'Нэргүй хичээл'}": ${p}`);
  }
  return problems;
}

export function activeLessons(course: CourseWithCurriculum): LessonRow[] {
  return course.sections.flatMap((s) => s.lessons).filter((l) => !l.archivedAt);
}

export function lessonsTotal(course: CourseWithCurriculum): number {
  return activeLessons(course).reduce((sum, l) => sum + l.priceCredits, 0);
}

export async function toCourseDetail(course: CourseWithCurriculum, storage: StorageAdapter): Promise<CourseDetail> {
  const sections = await Promise.all(
    course.sections.map(async (s) => ({
      id: s.id,
      title: s.title,
      position: s.position,
      lessons: await Promise.all(s.lessons.map((l) => toLessonView(l, storage))),
    })),
  );
  return {
    id: course.id,
    title: course.title,
    description: course.description,
    coverUrl: course.coverKey ? storage.publicUrl(course.coverKey) : null,
    categoryId: course.categoryId,
    level: course.level,
    priceCredits: course.priceCredits,
    status: course.status,
    visibility: course.visibility,
    reviewNote: course.reviewNote,
    submittedAt: course.submittedAt?.toISOString() ?? null,
    publishedAt: course.publishedAt?.toISOString() ?? null,
    lessonsTotalCredits: lessonsTotal(course),
    problems: courseProblems(course),
    sections,
    teacher: course.teacher,
  };
}

export function toCourseSummary(
  course: Prisma.CourseGetPayload<{ include: { lessons: { select: { reviewStatus: true; archivedAt: true } } } }>,
  storage: StorageAdapter,
): CourseSummary {
  const lessons = course.lessons.filter((l) => !l.archivedAt);
  return {
    id: course.id,
    title: course.title,
    status: course.status,
    visibility: course.visibility,
    coverUrl: course.coverKey ? storage.publicUrl(course.coverKey) : null,
    priceCredits: course.priceCredits,
    lessonCount: lessons.length,
    pendingLessonCount: lessons.filter((l) => l.reviewStatus === 'IN_REVIEW').length,
    updatedAt: course.updatedAt.toISOString(),
  };
}

async function toLessonView(l: LessonRow, storage: StorageAdapter): Promise<LessonView> {
  return {
    id: l.id,
    sectionId: l.sectionId,
    title: l.title,
    type: l.type,
    position: l.position,
    priceCredits: l.priceCredits,
    isFreePreview: l.isFreePreview,
    reviewStatus: l.reviewStatus,
    reviewNote: l.reviewNote,
    archived: !!l.archivedAt,
    problems: lessonProblems(l),
    // Багш/админы view — quiz-ийн зөв хариулттай.
    content: await toContent(l, storage, PREVIEW_URL_TTL, { revealAnswers: true }),
  };
}

/**
 * Lesson-ы агуулга (PDF бол `ttlSeconds` хугацаатай signed URL). Эрх шалгалтыг дуудагч хийнэ.
 * `revealAnswers` — quiz-ийн зөв хариулт; ЗӨВХӨН багш/админы засварлах, шалгах view-д `true`.
 * Live линк зөвхөн `revealMeetingUrl` үед (эзэмшигч, багш, админ — free preview-д биш).
 */
export async function toContent(
  l: Pick<LessonRow, 'type' | 'content'>,
  storage: StorageAdapter,
  ttlSeconds = PREVIEW_URL_TTL,
  { revealAnswers = false, revealMeetingUrl = true }: { revealAnswers?: boolean; revealMeetingUrl?: boolean } = {},
): Promise<LessonContent> {
  if (l.type === 'LIVE') {
    const c = l.content as unknown as LiveContent;
    return {
      type: 'LIVE',
      startsAt: c.startsAt ?? null,
      durationMinutes: c.durationMinutes ?? null,
      endsAt: c.startsAt && c.durationMinutes ? liveEndsAt(c.startsAt, c.durationMinutes) : null,
      meetingUrl: revealMeetingUrl ? (c.meetingUrl ?? null) : null,
    };
  }
  if (l.type === 'TEXT') return { type: 'TEXT', markdown: (l.content as unknown as TextContent).markdown ?? '' };
  if (l.type === 'PDF') {
    const c = l.content as unknown as PdfContent;
    return {
      type: 'PDF',
      fileName: c.fileName ?? null,
      size: c.size ?? null,
      url: c.fileKey ? await storage.signedDownloadUrl('private', c.fileKey, ttlSeconds) : null,
    };
  }
  if (l.type === 'QUIZ') return quizContent(l.content as unknown as StoredQuiz, revealAnswers);
  if (l.type === 'VIDEO') {
    // Playback token энд биш — `POST /media/lessons/:id/playback` (эрх + төхөөрөмжийн хязгаар).
    const c = l.content as unknown as VideoContent;
    return {
      type: 'VIDEO',
      status: c.status ?? null,
      durationSeconds: c.durationSeconds ?? null,
      error: c.error ?? null,
      fromLive: c.fromLive ?? null,
    };
  }
  if (l.type === 'ASSIGNMENT') {
    const c = l.content as unknown as AssignmentContent;
    return { type: 'ASSIGNMENT', instructions: c.instructions ?? '', maxScore: c.maxScore ?? null };
  }
  return { type: l.type };
}

/**
 * Quiz-ийн view. `revealAnswers` = false (learner) үед зөв хариулт (`answerKey`) огт ордоггүй —
 * асуулт, сонголтын зөвхөн id, текст.
 */
export function quizContent(c: StoredQuiz, revealAnswers: boolean): QuizContent {
  const questions = (c.questions ?? []).map((q) => ({
    id: q.id,
    text: q.text,
    multiple: q.multiple,
    options: q.options.map((o) => ({ id: o.id, text: o.text })),
  }));
  const view: QuizContent = { type: 'QUIZ', passPercent: c.passPercent ?? 0, questions };
  if (revealAnswers) view.answerKey = Object.fromEntries((c.questions ?? []).map((q) => [q.id, [...q.correctOptionIds]]));
  return view;
}
