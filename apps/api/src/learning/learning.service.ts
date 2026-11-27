import { Inject, Injectable } from '@nestjs/common';
import type { LessonProgress, Prisma } from '@lms/db';
import {
  QUIZ_ATTEMPTS_PER_DAY,
  quizNextAttemptAt,
  VIDEO_COMPLETE_PERCENT,
  type LessonAccessReason,
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
import { orgCourseGrants } from '../organizations/org-access';
import { PrismaService } from '../prisma/prisma.service';
import { ownedCourses, ownsFrom, type Db, type OwnedCourse } from '../purchases/entitlements';
import { CertificatesService } from './certificates.service';
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
    private readonly certificates: CertificatesService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
    private readonly assignments: AssignmentsService,
  ) {}

  // ---- "Миний сургалт" -------------------------------------------------------

  async myCourses(userId: string): Promise<MyCourseCard[]> {
    const access = await this.learnerAccess(userId);
    if (access.size === 0) return [];
    const ids = [...access.keys()];
    const [courses, progress] = await Promise.all([
      this.prisma.course.findMany({ where: { id: { in: ids }, status: 'PUBLISHED' }, include: courseInclude }),
      this.prisma.lessonProgress.findMany({ where: { userId, courseId: { in: ids } } }),
    ]);
    const cards = courses.map((c) => {
      const a = access.get(c.id)!;
      const summary = summarizeFor(c, a, progressByLesson(progress.filter((p) => p.courseId === c.id)));
      const card: MyCourseCard = {
        ...this.head(c),
        ownsCourse: a.owned?.ownsCourse ?? false,
        ...orgFields(c, a),
        lessonCount: allLessons(c).filter((l) => !l.archivedAt).length,
        ...summary,
      };
      return { card, at: Math.max(a.since.getTime(), summary.lastViewedAt ? Date.parse(summary.lastViewedAt) : 0) };
    });
    // Сүүлд үзсэн (эсвэл шинээр авсан) нь эхэндээ
    return cards.sort((a, b) => b.at - a.at).map((x) => x.card);
  }

  async myCourse(userId: string, courseId: string): Promise<MyCourseDetail> {
    const a = (await this.learnerAccess(userId, courseId)).get(courseId);
    if (!a) throw E.courseNotFound();
    const [course, progress] = await Promise.all([
      this.prisma.course.findFirst({ where: { id: courseId, status: 'PUBLISHED' }, include: courseInclude }),
      this.prisma.lessonProgress.findMany({ where: { userId, courseId } }),
    ]);
    if (!course) throw E.courseNotFound();
    const byLesson = progressByLesson(progress);
    return {
      ...this.head(course),
      ownsCourse: a.owned?.ownsCourse ?? false,
      ...orgFields(course, a),
      ...summarizeFor(course, a, byLesson),
      sections: course.sections
        .map((s) => ({
          id: s.id,
          title: s.title,
          // Архивласан lesson зөвхөн эзэмшигчид (ticket 09-ийн үлдэгдэл)
          lessons: s.lessons
            .filter((l) => !l.archivedAt || (a.owned && ownsFrom(a.owned, l.id)))
            .map((l): MyCourseLesson => ({
              id: l.id,
              title: l.title,
              type: l.type,
              priceCredits: l.priceCredits,
              isFreePreview: l.isFreePreview,
              archived: !!l.archivedAt,
              // Байгууллагын эрх архивласан lesson-д хүрэхгүй (LessonAccessPolicy-тэй ижил)
              owned: !a.locked && ((a.owned !== null && ownsFrom(a.owned, l.id)) || (a.orgs.length > 0 && !l.archivedAt)),
              progress: byLesson.has(l.id) ? progressView(byLesson.get(l.id)!) : null,
            })),
        }))
        .filter((s) => s.lessons.length > 0),
    };
  }

  /**
   * Суралцагчийн курсүүд: эзэмшсэн (худалдан авсан) ∪ идэвхтэй байгууллагын эрхтэй ∪ эрх нь дууссан (locked).
   * Нэг курс нэг л мөр (эзэмшсэн + grant хоёулаа бол нэгдэнэ).
   * Locked = PRIVATE курст явцын мөр байгаа, одоо эрх байхгүй, ямар нэг байгууллагад гишүүн байсан. Түүхийг
   * явцын мөрөөр хязгаарласан — grant цуцлагдахад мөр устдаг тул курс "аль байгууллагаас" гэдэг нь заримдаа үл мэдэгдэнэ.
   */
  private async learnerAccess(userId: string, courseId?: string): Promise<Map<string, LearnerAccess>> {
    const [owned, orgs] = await Promise.all([ownedCourses(this.prisma, userId, courseId), orgCourseGrants(this.prisma, userId, courseId)]);
    const map = new Map<string, LearnerAccess>();
    for (const [id, o] of owned) map.set(id, { owned: o, orgs: [], locked: false, since: o.since });
    for (const [id, g] of orgs) {
      const e = map.get(id) ?? { owned: null, orgs: [], locked: false, since: new Date(0) };
      e.orgs = g.organizations;
      map.set(id, e);
    }
    if (await this.prisma.organizationMember.findFirst({ where: { userId }, select: { id: true } })) {
      const rows = await this.prisma.lessonProgress.findMany({
        where: { userId, courseId, course: { visibility: 'PRIVATE', teacherId: { not: userId } } },
        distinct: ['courseId'],
        select: { courseId: true },
      });
      const lockedIds = rows.map((r) => r.courseId).filter((id) => !map.has(id));
      if (lockedIds.length > 0) {
        const grants = await this.prisma.organizationCourseGrant.findMany({
          where: { courseId: { in: lockedIds }, organization: { members: { some: { userId } } } },
          select: { courseId: true, organization: { select: { id: true, name: true } } },
        });
        for (const id of lockedIds) {
          map.set(id, {
            owned: null,
            orgs: grants.filter((g) => g.courseId === id).map((g) => g.organization),
            locked: true,
            since: new Date(0),
          });
        }
      }
    }
    return map;
  }

  // ---- lesson-ы явц ----------------------------------------------------------

  async lessonState(viewer: LessonViewer, lessonId: string): Promise<LessonLearningState> {
    const { lesson, access } = await this.access.open(lessonId, viewer);
    const row = await this.prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: viewer.id, lessonId } },
    });
    return {
      progress: row ? progressView(row) : emptyProgress(lessonId),
      quiz: lesson.type === 'QUIZ' ? await this.quizState(this.prisma, viewer.id, lesson, row, rateLimited(access)) : null,
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
    const row = await bumpProgress(this.prisma, viewer.id, lesson, patch);
    if (patch.complete) await this.afterCompletion(row);
    return progressView(row);
  }

  /** Текст / PDF: "Дууслаа" товч. */
  async complete(viewer: LessonViewer, lessonId: string): Promise<LessonProgressView> {
    const { lesson } = await this.access.open(lessonId, viewer);
    if (!MANUAL_COMPLETION.has(lesson.type)) throw E.completionNotManual();
    const row = await bumpProgress(this.prisma, viewer.id, lesson, { complete: true });
    await this.afterCompletion(row);
    return progressView(row);
  }

  // ---- quiz -------------------------------------------------------------------

  /**
   * Оролдлого бүр хадгалагдана; хамгийн өндөр оноо явцад; тэнцвэл lesson дууссан. Зөв хариулт буцаахгүй.
   * Хурдны хязгаар (суралцагчид): `QUIZ_ATTEMPT_COOLDOWN_SECONDS` ба 24 цагт `QUIZ_ATTEMPTS_PER_DAY` — хэтэрвэл 429
   * `QUIZ_RATE_LIMITED`. Хэрэглэгч × lesson-ы advisory lock-оор шалгах + бичих нь атомар (зэрэг хүсэлтээр давахгүй).
   */
  async submitQuiz(viewer: LessonViewer, lessonId: string, answers: QuizAnswerInput[]): Promise<QuizAttemptResult> {
    const { lesson, access } = await this.access.open(lessonId, viewer);
    if (lesson.type !== 'QUIZ') throw E.notAQuiz();
    const quiz = lesson.content as unknown as StoredQuiz;
    const score = scoreQuiz(quiz, answers);
    const limited = rateLimited(access);

    const result = await this.prisma.$transaction(async (tx) => {
      if (limited) {
        const lockKey = `quiz:${viewer.id}:${lesson.id}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
        const next = quizNextAttemptAt(await recentAttemptTimes(tx, viewer.id, lesson.id));
        if (next) throw E.quizRateLimited(next);
      }
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
        quiz: await this.quizState(tx, viewer.id, lesson, progress, limited),
      };
    });
    // Тэнцсэн оролдлого lesson-ыг дуусгаж / хамгийн өндөр оноог өсгөж болно → дундаж өөрчлөгдөнө.
    // Тэнцээгүй оролдлого (оноо < тэнцэх оноо) lesson-ыг дуусгахгүй тул нөхцөлд нөлөөлөхгүй.
    if (score.passed) await this.certificates.issueIfEligible(viewer.id, lesson.courseId);
    return result;
  }

  // ---- дотоод ----------------------------------------------------------------

  /** Lesson дууссан → курсийн сертификатын нөхцөл хангагдвал автоматаар олгоно (ticket 15). */
  private async afterCompletion(row: LessonProgress): Promise<void> {
    if (row.completedAt) await this.certificates.issueIfEligible(row.userId, row.courseId);
  }

  private head(c: CourseRow) {
    const t = teacherRef(c.teacher);
    return {
      id: c.id,
      title: c.title,
      coverUrl: c.coverKey ? this.storage.publicUrl(c.coverKey) : null,
      teacher: { id: t.id, name: t.name },
    };
  }

  private async quizState(
    db: Db,
    userId: string,
    lesson: OpenedLesson,
    row: LessonProgress | null,
    limited: boolean,
  ): Promise<QuizState> {
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
      // `ATTEMPTS_SHOWN` ≥ `QUIZ_ATTEMPTS_PER_DAY` тул эдгээр мөр хязгаарыг тооцоход хангалттай.
      nextAttemptAt: limited ? (quizNextAttemptAt(attempts.map((a) => a.createdAt))?.toISOString() ?? null) : null,
    };
  }
}

/** Багш (өөрийн quiz-ийг шалгах), админд хурдны хязгаар үгүй — зөв хариултыг аль хэдийн мэднэ. */
function rateLimited(access: LessonAccessReason): boolean {
  return access === 'OWNED' || access === 'ORG' || access === 'PREVIEW';
}

async function recentAttemptTimes(db: Db, userId: string, lessonId: string): Promise<Date[]> {
  const rows = await db.quizAttempt.findMany({
    where: { userId, lessonId },
    orderBy: { createdAt: 'desc' },
    take: QUIZ_ATTEMPTS_PER_DAY,
    select: { createdAt: true },
  });
  return rows.map((r) => r.createdAt);
}

interface LearnerAccess {
  /** Худалдан авсан эзэмшил (байгууллагын эрхээр л байгаа бол null) */
  owned: OwnedCourse | null;
  /** Идэвхтэй эрх өгч буй байгууллагууд; locked үед — өмнө гишүүн байсан байгууллагууд (мэдэгдэж байвал) */
  orgs: { id: string; name: string }[];
  locked: boolean;
  since: Date;
}

function orgFields(c: CourseRow, a: LearnerAccess) {
  return { organizations: a.orgs, isPrivate: c.visibility === 'PRIVATE', locked: a.locked };
}

/** Байгууллагын эрх (идэвхтэй эсвэл дууссан) бүх архивлаагүй lesson-ыг эзэмшсэнтэй адил тооцно; locked үед үргэлжлүүлэх lesson үгүй. */
function summarizeFor(c: CourseRow, a: LearnerAccess, progress: Map<string, LessonProgress>): CourseProgressSummary {
  const viaOrg = a.orgs.length > 0 || a.locked;
  const o: OwnedCourse = { ownsCourse: viaOrg || (a.owned?.ownsCourse ?? false), lessonIds: a.owned?.lessonIds ?? new Set(), since: a.since };
  const summary = summarize(c, o, progress);
  return a.locked ? { ...summary, continueLessonId: null } : summary;
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
