import { Inject, Injectable } from '@nestjs/common';
import type { LessonProgress, Prisma } from '@lms/db';
import {
  VIDEO_COMPLETE_PERCENT,
  type CourseProgressSummary,
  type LessonLearningState,
  type LessonProgressView,
  type MyCourseCard,
  type MyCourseDetail,
  type MyCourseLesson,
  type QuizAnswerInput,
  type QuizAttemptResult,
  type QuizAttemptView,
  type QuizState,
} from '@lms/shared';
import { STORAGE, type StorageAdapter } from '../adapters/storage';
import { LessonAccessPolicy, type LessonViewer, type OpenedLesson } from '../catalog/lesson-access';
import type { StoredQuiz } from '../catalog/lesson-types';
import { teacherRef, teacherSelect } from '../catalog/public-catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { ownedCourses, ownsFrom, type Db, type OwnedCourse } from '../purchases/entitlements';
import { LearningErrors as E } from './errors';
import { AssignmentsService } from './assignments.service';
import { bumpProgress, progressView, type ProgressPatch } from './progress';
import { scoreQuiz } from './quiz';

/**
 * "Дууслаа" товчоор дуусгах төрлүүд. VIDEO — үзсэн хувиар, QUIZ — тэнцэхэд, ASSIGNMENT — анх илгээхэд
 * автоматаар (`AssignmentsService.submit`).
 */
const MANUAL_COMPLETION = new Set(['TEXT', 'PDF']);
const ATTEMPTS_SHOWN = 20;

const courseInclude = {
  teacher: { select: teacherSelect },
  sections: {
    orderBy: { position: 'asc' },
    include: { lessons: { where: { reviewStatus: 'APPROVED' }, orderBy: { position: 'asc' } } },
  },
} as const satisfies Prisma.CourseInclude;

type CourseRow = Prisma.CourseGetPayload<{ include: typeof courseInclude }>;
type LessonRow = CourseRow['sections'][number]['lessons'][number];

/**
 * Суралцах үйл явц: "Миний сургалт", lesson-ы явц, quiz.
 * - Эзэмшил — зөвхөн `purchases/entitlements.ts`; lesson-д хандах эрх — зөвхөн `LessonAccessPolicy.open`
 *   (контент үзэх эрхтэй хүн л явц бичиж, quiz бөглөнө: эзэмшигч, preview, багш, админ).
 * - Явц зөвхөн өсөнө: видеоны хувь, quiz-ийн хамгийн өндөр оноо max-аар; дууссан огноо нэг удаа.
 * - Курсийн явцын хувь = эзэмшиж буй, архивлаагүй lesson-уудаас дууссан нь.
 */
@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LessonAccessPolicy,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
    private readonly assignments: AssignmentsService,
  ) {}

  // ---- "Миний сургалт" -------------------------------------------------------

  async myCourses(userId: string): Promise<MyCourseCard[]> {
    const owned = await ownedCourses(this.prisma, userId);
    if (owned.size === 0) return [];
    const ids = [...owned.keys()];
    const [courses, progress] = await Promise.all([
      this.prisma.course.findMany({ where: { id: { in: ids }, status: 'PUBLISHED' }, include: courseInclude }),
      this.prisma.lessonProgress.findMany({ where: { userId, courseId: { in: ids } } }),
    ]);
    const cards = courses.map((c) => {
      const o = owned.get(c.id)!;
      const summary = summarize(c, o, progressByLesson(progress.filter((p) => p.courseId === c.id)));
      const card: MyCourseCard = {
        ...this.head(c),
        ownsCourse: o.ownsCourse,
        lessonCount: allLessons(c).filter((l) => !l.archivedAt).length,
        ...summary,
      };
      return { card, at: Math.max(o.since.getTime(), summary.lastViewedAt ? Date.parse(summary.lastViewedAt) : 0) };
    });
    // Сүүлд үзсэн (эсвэл шинээр авсан) нь эхэндээ
    return cards.sort((a, b) => b.at - a.at).map((x) => x.card);
  }

  async myCourse(userId: string, courseId: string): Promise<MyCourseDetail> {
    const o = (await ownedCourses(this.prisma, userId, courseId)).get(courseId);
    if (!o) throw E.courseNotFound();
    const [course, progress] = await Promise.all([
      this.prisma.course.findFirst({ where: { id: courseId, status: 'PUBLISHED' }, include: courseInclude }),
      this.prisma.lessonProgress.findMany({ where: { userId, courseId } }),
    ]);
    if (!course) throw E.courseNotFound();
    const byLesson = progressByLesson(progress);
    return {
      ...this.head(course),
      ownsCourse: o.ownsCourse,
      ...summarize(course, o, byLesson),
      sections: course.sections
        .map((s) => ({
          id: s.id,
          title: s.title,
          // Архивласан lesson зөвхөн эзэмшигчид (ticket 09-ийн үлдэгдэл)
          lessons: s.lessons
            .filter((l) => !l.archivedAt || ownsFrom(o, l.id))
            .map((l): MyCourseLesson => ({
              id: l.id,
              title: l.title,
              type: l.type,
              priceCredits: l.priceCredits,
              isFreePreview: l.isFreePreview,
              archived: !!l.archivedAt,
              owned: ownsFrom(o, l.id),
              progress: byLesson.has(l.id) ? progressView(byLesson.get(l.id)!) : null,
            })),
        }))
        .filter((s) => s.lessons.length > 0),
    };
  }

  // ---- lesson-ы явц ----------------------------------------------------------

  async lessonState(viewer: LessonViewer, lessonId: string): Promise<LessonLearningState> {
    const { lesson, access } = await this.access.open(lessonId, viewer);
    const row = await this.prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: viewer.id, lessonId } },
    });
    return {
      progress: row ? progressView(row) : emptyProgress(lessonId),
      quiz: lesson.type === 'QUIZ' ? await this.quizState(this.prisma, viewer.id, lesson, row) : null,
      assignment: lesson.type === 'ASSIGNMENT' ? await this.assignments.state(viewer.id, lesson, access) : null,
    };
  }

  /**
   * Lesson нээсэн (сүүлд үзсэн цаг) + VIDEO бол үзсэн хувь; ≥ 90% → дууссан.
   * Ticket 10-ын player энэ endpoint руу явцаа үе үе илгээнэ.
   */
  async recordProgress(viewer: LessonViewer, lessonId: string, watchedPercent?: number): Promise<LessonProgressView> {
    const { lesson } = await this.access.open(lessonId, viewer);
    const patch: ProgressPatch = {};
    if (lesson.type === 'VIDEO' && watchedPercent !== undefined) {
      patch.watchedPercent = Math.floor(watchedPercent);
      if (patch.watchedPercent >= VIDEO_COMPLETE_PERCENT) patch.complete = true;
    }
    return progressView(await bumpProgress(this.prisma, viewer.id, lesson, patch));
  }

  /** Текст / PDF: "Дууслаа" товч. */
  async complete(viewer: LessonViewer, lessonId: string): Promise<LessonProgressView> {
    const { lesson } = await this.access.open(lessonId, viewer);
    if (!MANUAL_COMPLETION.has(lesson.type)) throw E.completionNotManual();
    return progressView(await bumpProgress(this.prisma, viewer.id, lesson, { complete: true }));
  }

  // ---- quiz -------------------------------------------------------------------

  /** Оролдлого бүр хадгалагдана; хамгийн өндөр оноо явцад; тэнцвэл lesson дууссан. Зөв хариулт буцаахгүй. */
  async submitQuiz(viewer: LessonViewer, lessonId: string, answers: QuizAnswerInput[]): Promise<QuizAttemptResult> {
    const { lesson } = await this.access.open(lessonId, viewer);
    if (lesson.type !== 'QUIZ') throw E.notAQuiz();
    const quiz = lesson.content as unknown as StoredQuiz;
    const score = scoreQuiz(quiz, answers);

    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.quizAttempt.create({
        data: {
          userId: viewer.id,
          lessonId: lesson.id,
          courseId: lesson.courseId,
          answers: score.answers as unknown as Prisma.InputJsonValue,
          correctCount: score.correctCount,
          questionCount: score.questionCount,
          scorePercent: score.scorePercent,
          passPercent: quiz.passPercent,
          passed: score.passed,
        },
      });
      const progress = await bumpProgress(tx, viewer.id, lesson, {
        bestScorePercent: score.scorePercent,
        complete: score.passed,
      });
      return {
        attempt: attemptView(attempt),
        progress: progressView(progress),
        quiz: await this.quizState(tx, viewer.id, lesson, progress),
      };
    });
  }

  // ---- дотоод ----------------------------------------------------------------

  private head(c: CourseRow) {
    const t = teacherRef(c.teacher);
    return {
      id: c.id,
      title: c.title,
      coverUrl: c.coverKey ? this.storage.publicUrl(c.coverKey) : null,
      teacher: { id: t.id, name: t.name },
    };
  }

  private async quizState(db: Db, userId: string, lesson: OpenedLesson, row: LessonProgress | null): Promise<QuizState> {
    const quiz = lesson.content as unknown as StoredQuiz;
    const attempts = await db.quizAttempt.findMany({
      where: { userId, lessonId: lesson.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ATTEMPTS_SHOWN,
    });
    const best = row?.bestScorePercent ?? null;
    return {
      passPercent: quiz.passPercent,
      questionCount: quiz.questions.length,
      bestScorePercent: best,
      passed: best !== null && best >= quiz.passPercent,
      attempts: attempts.map(attemptView),
    };
  }
}

function allLessons(c: CourseRow): LessonRow[] {
  return c.sections.flatMap((s) => s.lessons);
}

function progressByLesson(rows: LessonProgress[]): Map<string, LessonProgress> {
  return new Map(rows.map((r) => [r.lessonId, r]));
}

/** Курсийн явц — эзэмшиж буй, архивлаагүй lesson-ууд (дараалал хадгалагдана). */
function summarize(c: CourseRow, o: OwnedCourse, progress: Map<string, LessonProgress>): CourseProgressSummary {
  const owned = allLessons(c).filter((l) => !l.archivedAt && ownsFrom(o, l.id));
  const done = (id: string) => !!progress.get(id)?.completedAt;
  const completed = owned.filter((l) => done(l.id)).length;

  let last: LessonProgress | null = null;
  for (const l of owned) {
    const p = progress.get(l.id);
    if (p && (!last || p.lastViewedAt > last.lastViewedAt)) last = p;
  }
  const continueLessonId =
    last && !last.completedAt ? last.lessonId : (owned.find((l) => !done(l.id))?.id ?? null);

  return {
    ownedLessonCount: owned.length,
    completedLessonCount: completed,
    progressPercent: owned.length === 0 ? 0 : Math.floor((completed * 100) / owned.length),
    continueLessonId,
    lastViewedAt: last?.lastViewedAt.toISOString() ?? null,
  };
}

function emptyProgress(lessonId: string): LessonProgressView {
  return { lessonId, completed: false, completedAt: null, watchedPercent: 0, bestScorePercent: null, lastViewedAt: null };
}

function attemptView(a: {
  id: string;
  correctCount: number;
  questionCount: number;
  scorePercent: number;
  passed: boolean;
  createdAt: Date;
}): QuizAttemptView {
  return {
    id: a.id,
    correctCount: a.correctCount,
    questionCount: a.questionCount,
    scorePercent: a.scorePercent,
    passed: a.passed,
    createdAt: a.createdAt.toISOString(),
  };
}
