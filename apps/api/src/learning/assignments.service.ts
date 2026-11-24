import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type AssignmentSubmission } from '@lms/db';
import {
  ASSIGNMENT_FILE_MAX_BYTES,
  type AssignmentInboxItem,
  type AssignmentInboxPage,
  type AssignmentInboxStatus,
  type AssignmentState,
  type LessonAccessReason,
  type SubmissionFileUrl,
  type SubmissionReviewView,
  type SubmissionView,
  type UploadTicket,
} from '@lms/shared';
import { STORAGE, type StorageAdapter } from '../adapters/storage';
import { LessonAccessPolicy, staffRole, type LessonViewer, type OpenedLesson } from '../catalog/lesson-access';
import type { AssignmentContent } from '../catalog/lesson-types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ownsLesson } from '../purchases/entitlements';
import { LearningErrors as E } from './errors';
import { bumpProgress } from './progress';

/** Файлын signed URL хэр удаан хүчинтэй. */
export const SUBMISSION_FILE_URL_TTL = 10 * 60;
const SUBMISSIONS_SHOWN = 20;
const INBOX_PAGE_MAX = 50;

export interface SubmitInput {
  text?: string;
  file?: { key: string; name: string };
}

export interface ReviewInput {
  score: number;
  comment?: string;
}

const inboxInclude = {
  user: { select: { id: true, name: true } },
  lesson: { select: { id: true, title: true, content: true } },
  course: { select: { id: true, title: true } },
} as const satisfies Prisma.AssignmentSubmissionInclude;

type InboxRow = Prisma.AssignmentSubmissionGetPayload<{ include: typeof inboxInclude }>;

/**
 * Даалгавар (ticket 13): илгээх, дахин илгээх, багшийн шалгах inbox, үнэлгээ, файлын хандалт.
 *
 * - Илгээх: зөвхөн lesson-ыг ЭЗЭМШИГЧ (`ownsLesson`) — free preview, багш, админ үзэж болох ч илгээхгүй.
 *   Lesson нээгдэх эсэх `LessonAccessPolicy.open`-оор (APPROVED + нийтлэгдсэн курс, архивласан нь эзэмшигчид).
 * - Илгээлт бүр шинэ мөр (`attempt` 1, 2, …; unique — зэрэг илгээлт 409). `is_latest` = одоогийн илгээлт.
 * - Анхны илгээлтээр lesson ДУУССАН (`lesson_progress.completed_at`) — курсийн явцын хувьд тооцогдоно.
 *   Оноо `best_score_percent`-д ХЭЗЭЭ Ч бичигдэхгүй (quiz-ийн дундаж, сертификатаас тусдаа).
 * - Файл: signed URL-аар шууд storage (`private` bucket) руу, дараа нь `info()`-оор хэмжээг (≤ 50MB) шалгана.
 *   Татах URL зөвхөн илгээгч, курсийн багш, админд (бусдад 404).
 */
@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LessonAccessPolicy,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- суралцагч --------------------------------------------------------------

  /** `GET /learning/lessons/:id`-ийн `assignment` хэсэг (эрхийг дуудагч `open()`-оор шалгасан). */
  async state(userId: string, lesson: OpenedLesson, access: LessonAccessReason): Promise<AssignmentState> {
    const rows = await this.prisma.assignmentSubmission.findMany({
      where: { userId, lessonId: lesson.id },
      orderBy: { attempt: 'desc' },
      take: SUBMISSIONS_SHOWN,
    });
    // `access` нь эзэмшлээс өмнө ADMIN/TEACHER-ийг, дараа нь PREVIEW-г буцаадаг: PREVIEW = эзэмшээгүй.
    const canSubmit = access === 'OWNED' || (access !== 'PREVIEW' && (await ownsLesson(this.prisma, userId, lesson)));
    return { maxScore: maxScoreOf(lesson), canSubmit, submissions: rows.map(submissionView) };
  }

  /** Файл upload хийх signed URL. Мэдэгдсэн хэмжээ 50MB-аас их бол шууд татгалзана (эцсийн шалгалт `submit`-д). */
  async uploadTicket(viewer: LessonViewer, lessonId: string, input: { fileName: string; size: number }): Promise<UploadTicket> {
    const lesson = await this.openForSubmit(viewer, lessonId);
    if (input.size > ASSIGNMENT_FILE_MAX_BYTES) throw E.fileTooLarge();
    const key = `${keyPrefix(lesson.id, viewer.id)}${randomUUID()}${extension(input.fileName)}`;
    const target = await this.storage.createUploadUrl('private', key);
    return { key, ...target };
  }

  async submit(viewer: LessonViewer, lessonId: string, input: SubmitInput): Promise<AssignmentState> {
    const lesson = await this.openForSubmit(viewer, lessonId);
    const text = input.text?.trim() || null;
    if (!text && !input.file) throw E.emptySubmission();

    let file: { fileKey: string; fileName: string; fileSize: number; fileContentType: string } | null = null;
    if (input.file) {
      const { key, name } = input.file;
      if (!key.startsWith(keyPrefix(lesson.id, viewer.id))) throw E.invalidUpload('Файлын зам буруу.');
      const info = await this.storage.info('private', key);
      if (!info) throw E.invalidUpload('Файл upload хийгдээгүй байна.');
      if (info.size > ASSIGNMENT_FILE_MAX_BYTES) {
        await this.storage.remove('private', key);
        throw E.fileTooLarge();
      }
      file = { fileKey: key, fileName: name, fileSize: info.size, fileContentType: info.contentType };
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const last = await tx.assignmentSubmission.findFirst({
          where: { userId: viewer.id, lessonId: lesson.id },
          orderBy: { attempt: 'desc' },
          select: { attempt: true },
        });
        await tx.assignmentSubmission.updateMany({
          where: { userId: viewer.id, lessonId: lesson.id, isLatest: true },
          data: { isLatest: false },
        });
        // (user, lesson, attempt) unique — зэрэг илгээлтийн нэг нь P2002 → 409
        await tx.assignmentSubmission.create({
          data: {
            userId: viewer.id,
            lessonId: lesson.id,
            courseId: lesson.courseId,
            attempt: (last?.attempt ?? 0) + 1,
            text,
            ...file,
          },
        });
        await bumpProgress(tx, viewer.id, lesson, { complete: true });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw E.submissionConflict();
      throw err;
    }
    return this.state(viewer.id, lesson, 'OWNED');
  }

  /** Илгээсэн файлыг татах богино хугацаатай URL — зөвхөн илгээгч, курсийн багш, админ. */
  async fileUrl(viewer: LessonViewer, submissionId: string): Promise<SubmissionFileUrl> {
    const sub = await this.prisma.assignmentSubmission.findUnique({
      where: { id: submissionId },
      include: { course: { select: { teacherId: true } } },
    });
    const allowed = !!sub && (sub.userId === viewer.id || staffRole(viewer, sub.course.teacherId) !== null);
    if (!sub || !allowed || !sub.fileKey) throw E.submissionNotFound();
    return {
      url: await this.storage.signedDownloadUrl('private', sub.fileKey, SUBMISSION_FILE_URL_TTL),
      expiresInSeconds: SUBMISSION_FILE_URL_TTL,
    };
  }

  // ---- багш -------------------------------------------------------------------

  /**
   * Багшийн шалгах inbox: өөрийн курсуудын (суралцагч × даалгавар) бүрийн ХАМГИЙН СҮҮЛИЙН илгээлт.
   * Шалгаагүй — хуучин нь эхэндээ (дарааллаар шалгана); шалгасан — сүүлд шалгасан нь эхэндээ.
   * Дахин илгээсэн бол шинэ илгээлт дахин "шалгаагүй"-д орно.
   */
  async inbox(
    teacherId: string,
    opts: { status: AssignmentInboxStatus; courseId?: string; before?: string; limit?: number },
  ): Promise<AssignmentInboxPage> {
    const limit = Math.min(opts.limit ?? INBOX_PAGE_MAX, INBOX_PAGE_MAX);
    const base: Prisma.AssignmentSubmissionWhereInput = {
      isLatest: true,
      course: { teacherId },
      ...(opts.courseId ? { courseId: opts.courseId } : {}),
    };
    const unreviewed = opts.status === 'UNREVIEWED';
    const [rows, unreviewedCount] = await Promise.all([
      this.prisma.assignmentSubmission.findMany({
        where: { ...base, reviewedAt: unreviewed ? null : { not: null } },
        orderBy: unreviewed ? [{ createdAt: 'asc' }, { id: 'asc' }] : [{ reviewedAt: 'desc' }, { id: 'desc' }],
        include: inboxInclude,
        take: limit + 1,
        ...(opts.before ? { cursor: { id: opts.before }, skip: 1 } : {}),
      }),
      this.prisma.assignmentSubmission.count({ where: { ...base, reviewedAt: null } }),
    ]);
    const page = rows.slice(0, limit);
    const previous = await this.previousReviews(page);
    return {
      items: page.map((r) => inboxItem(r, previous.get(r.id) ?? null)),
      nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
      unreviewedCount,
    };
  }

  /**
   * Оноо + сэтгэгдэл. Зөвхөн курсийн багш (бусдад 404). Дахин үнэлж болно (засвар); суралцагч бүрт мэдэгдэл.
   * `max_score`-ийг үнэлэх үеийнхээр хадгална.
   */
  async review(teacherId: string, submissionId: string, input: ReviewInput): Promise<AssignmentInboxItem> {
    const sub = await this.prisma.assignmentSubmission.findFirst({
      where: { id: submissionId, course: { teacherId } },
      include: inboxInclude,
    });
    if (!sub) throw E.submissionNotFound();
    const maxScore = maxScoreOf(sub.lesson);
    if (input.score < 0 || input.score > maxScore) throw E.invalidScore(maxScore);

    const updated = await this.prisma.assignmentSubmission.update({
      where: { id: sub.id },
      data: {
        score: input.score,
        maxScore,
        comment: input.comment?.trim() || null,
        reviewedAt: new Date(),
        reviewedById: teacherId,
      },
      include: inboxInclude,
    });
    await this.notifications.notify({
      userId: sub.userId,
      type: 'ASSIGNMENT_REVIEWED',
      params: { title: sub.lesson.title, course: sub.course.title, score: input.score, maxScore },
      link: `/courses/${sub.course.id}/lessons/${sub.lesson.id}`,
    });
    const previous = await this.previousReviews([updated]);
    return inboxItem(updated, previous.get(updated.id) ?? null);
  }

  // ---- дотоод ----------------------------------------------------------------

  private async openForSubmit(viewer: LessonViewer, lessonId: string): Promise<OpenedLesson> {
    const { lesson } = await this.access.open(lessonId, viewer);
    if (lesson.type !== 'ASSIGNMENT') throw E.notAnAssignment();
    if (!(await ownsLesson(this.prisma, viewer.id, lesson))) throw E.assignmentOwnersOnly();
    return lesson;
  }

  /** Дахин илгээсэн илгээлтүүдийн өмнөх илгээлтийн үнэлгээ (багшид харьцуулахад). */
  private async previousReviews(rows: AssignmentSubmission[]): Promise<Map<string, SubmissionReviewView>> {
    const resubmitted = rows.filter((r) => r.attempt > 1);
    if (resubmitted.length === 0) return new Map();
    const prev = await this.prisma.assignmentSubmission.findMany({
      where: { OR: resubmitted.map((r) => ({ userId: r.userId, lessonId: r.lessonId, attempt: r.attempt - 1 })) },
    });
    const result = new Map<string, SubmissionReviewView>();
    for (const r of resubmitted) {
      const p = prev.find((x) => x.userId === r.userId && x.lessonId === r.lessonId);
      const review = p ? reviewView(p) : null;
      if (review) result.set(r.id, review);
    }
    return result;
  }
}

function keyPrefix(lessonId: string, userId: string): string {
  return `submissions/${lessonId}/${userId}/`;
}

/** Файлын өргөтгөл (зөвхөн латин үсэг, тоо; ≤ 10 тэмдэгт), үгүй бол хоосон. */
function extension(fileName: string): string {
  const ext = /\.([A-Za-z0-9]{1,10})$/.exec(fileName.trim())?.[1];
  return ext ? `.${ext.toLowerCase()}` : '';
}

function maxScoreOf(lesson: { content: Prisma.JsonValue }): number {
  return (lesson.content as unknown as AssignmentContent).maxScore ?? 0;
}

function reviewView(s: AssignmentSubmission): SubmissionReviewView | null {
  if (!s.reviewedAt || s.score === null || s.maxScore === null) return null;
  return { score: s.score, maxScore: s.maxScore, comment: s.comment, reviewedAt: s.reviewedAt.toISOString() };
}

function submissionView(s: AssignmentSubmission): SubmissionView {
  return {
    id: s.id,
    text: s.text,
    file:
      s.fileKey && s.fileName
        ? { name: s.fileName, size: s.fileSize ?? 0, contentType: s.fileContentType ?? 'application/octet-stream' }
        : null,
    submittedAt: s.createdAt.toISOString(),
    review: reviewView(s),
  };
}

function inboxItem(r: InboxRow, previousReview: SubmissionReviewView | null): AssignmentInboxItem {
  return {
    ...submissionView(r),
    learner: { id: r.user.id, name: r.user.name },
    lesson: { id: r.lesson.id, title: r.lesson.title, maxScore: maxScoreOf(r.lesson) },
    course: { id: r.course.id, title: r.course.title },
    attempt: r.attempt,
    previousReview,
  };
}
