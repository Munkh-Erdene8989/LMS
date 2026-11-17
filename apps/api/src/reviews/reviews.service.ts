import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@lms/db';
import type {
  AdminReviewPage,
  AdminReviewView,
  CourseReviewPage,
  ReviewAuthorRef,
  ReviewInput,
  ReviewReplyView,
  ReviewView,
  ReviewViewerState,
} from '@lms/shared';
import { AuditService } from '../admin/audit.service';
import { SettingsService } from '../admin/settings.service';
import { loadRatings, NO_RATING } from '../catalog/ratings';
import { publicLessonWhere, teacherRef, teacherSelect } from '../catalog/public-catalog.service';
import { NotificationsService, type NotifyInput } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { courseOwnership, ownsFrom } from '../purchases/entitlements';
import { ReviewErrors as E } from './errors';

const LEARNER_FALLBACK_NAME = 'Суралцагч';

const replyInclude = { author: { select: teacherSelect } } as const satisfies Prisma.ReviewReplyInclude;

function reviewInclude(withHiddenReplies: boolean) {
  return {
    user: { select: teacherSelect },
    course: { select: { id: true, title: true, teacherId: true } },
    replies: {
      where: withHiddenReplies ? {} : { hiddenAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: replyInclude,
    },
  } as const satisfies Prisma.ReviewInclude;
}

type ReviewRow = Prisma.ReviewGetPayload<{ include: ReturnType<typeof reviewInclude> }>;
type AdminReviewRow = Prisma.ReviewGetPayload<{
  include: ReturnType<typeof reviewInclude> & { hiddenBy: { select: { id: true; name: true } } };
}>;

export interface Viewer {
  id: string;
  roles: string[];
}

interface PublishedCourse {
  id: string;
  title: string;
  teacherId: string;
}

/**
 * Үнэлгээ ба сэтгэгдэл (SPEC 57–59). Дүрэм:
 * - Бичих эрх: курсийн нийтлэгдсэн (APPROVED, архивлаагүй) lesson-уудын ≥ `reviewMinOwnedPercent`%-ийг
 *   эзэмшсэн (бүтэн курс = 100%), ядаж нэг lesson; курсийн багш өөрийгөө үнэлэхгүй. Эзэмшлийг зөвхөн
 *   `purchases/entitlements`-ээр шалгана.
 * - Курс бүрт нэг үнэлгээ (DB unique). Дахин илгээвэл засна; засахад босгыг дахин шалгахгүй (дараа нь
 *   шинэ lesson нэмэгдэж хувь буурсан ч өөрийн үнэлгээгээ засаж чадна).
 * - Thread: курсийн багш болон үнэлгээний зохиогч хязгааргүй хариулна; нөгөө талдаа мэдэгдэл очно.
 * - Админ үнэлгээ/хариултыг нууна (шалтгаантай, audit). Нуусан үнэлгээ нийтэд болон дундажид орохгүй;
 *   зохиогч өөрийнхөө нуугдсан үнэлгээг (шалтгаантай нь) хардаг. Засахад нуугдсан хэвээр.
 */
@Injectable()
export class ReviewsService {
  private readonly log = new Logger(ReviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- нийтийн -------------------------------------------------------------

  async list(courseId: string, viewer: Viewer | null, opts: { limit: number; before?: string }): Promise<CourseReviewPage> {
    const course = await this.publishedCourse(courseId);
    const [rows, ratings, viewerState, requiredPercent] = await Promise.all([
      this.prisma.review.findMany({
        where: { courseId, hiddenAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: opts.limit + 1,
        ...(opts.before ? { cursor: { id: opts.before }, skip: 1 } : {}),
        include: reviewInclude(false),
      }),
      loadRatings(this.prisma, [courseId]),
      viewer ? this.viewerState(course, viewer.id) : Promise.resolve(null),
      this.settings.get('reviewMinOwnedPercent'),
    ]);
    const page = rows.slice(0, opts.limit);
    return {
      rating: ratings.get(courseId) ?? NO_RATING,
      requiredPercent,
      items: page.map(toView),
      nextCursor: rows.length > opts.limit ? page[page.length - 1]!.id : null,
      viewer: viewerState,
    };
  }

  /** Үнэлгээ бичих (анх удаа — эрх шалгана) эсвэл засах. */
  async upsert(courseId: string, userId: string, input: ReviewInput): Promise<ReviewView> {
    const course = await this.publishedCourse(courseId);
    if (course.teacherId === userId) throw E.ownCourse();
    const body = input.body ?? '';

    const existing = await this.prisma.review.findUnique({ where: { userId_courseId: { userId, courseId } }, select: { id: true } });
    if (existing) return this.edit(existing.id, input.rating, body);

    const elig = await this.eligibility(course, userId);
    if (!elig.eligible) throw E.notEligible(elig.requiredPercent);

    let created: { id: string };
    try {
      created = await this.prisma.review.create({ data: { courseId, userId, rating: input.rating, body }, select: { id: true } });
    } catch (err) {
      // Зэрэг 2 хүсэлт: нөгөө нь аль хэдийн үүсгэсэн → засвар болгоно.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const row = await this.prisma.review.findUniqueOrThrow({ where: { userId_courseId: { userId, courseId } }, select: { id: true } });
        return this.edit(row.id, input.rating, body);
      }
      throw err;
    }
    const view = await this.one(created.id);
    await this.notifySafe({
      userId: course.teacherId,
      type: 'REVIEW_NEW',
      params: { course: course.title, rating: input.rating, name: view.author.name },
      link: reviewLink(course.id, created.id),
    });
    return view;
  }

  /** Thread хариулт — курсийн багш эсвэл үнэлгээний зохиогч. */
  async reply(reviewId: string, userId: string, body: string): Promise<ReviewView> {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, userId: true, hiddenAt: true, course: { select: { id: true, title: true, teacherId: true, status: true } } },
    });
    if (!review || review.hiddenAt || review.course.status !== 'PUBLISHED') throw E.notFound();
    const isTeacher = review.course.teacherId === userId;
    const isAuthor = review.userId === userId;
    if (!isTeacher && !isAuthor) throw E.replyForbidden();

    const reply = await this.prisma.reviewReply.create({ data: { reviewId, authorId: userId, body }, include: replyInclude });
    const recipient = isTeacher ? review.userId : review.course.teacherId;
    if (recipient !== userId) {
      await this.notifySafe({
        userId: recipient,
        type: 'REVIEW_REPLY',
        params: { course: review.course.title, name: authorRef(reply.author, isTeacher).name },
        link: reviewLink(review.course.id, review.id),
      });
    }
    return this.one(reviewId);
  }

  // ---- админ ---------------------------------------------------------------

  async adminList(opts: { status: 'ALL' | 'VISIBLE' | 'HIDDEN'; limit: number; before?: string }): Promise<AdminReviewPage> {
    const where: Prisma.ReviewWhereInput =
      opts.status === 'VISIBLE'
        ? { hiddenAt: null }
        : opts.status === 'HIDDEN'
          ? { hiddenAt: { not: null } }
          : {};
    const rows = await this.prisma.review.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
      ...(opts.before ? { cursor: { id: opts.before }, skip: 1 } : {}),
      include: { ...reviewInclude(true), hiddenBy: { select: { id: true, name: true } } },
    });
    const page = rows.slice(0, opts.limit);
    return { items: page.map(toAdminView), nextCursor: rows.length > opts.limit ? page[page.length - 1]!.id : null };
  }

  /** Нуух (давтвал idempotent — шалтгааныг өөрчлөхгүй). Зохиогчид шалтгаантай мэдэгдэнэ. */
  async hide(id: string, adminId: string, reason: string, ip?: string): Promise<AdminReviewView> {
    const changed = await this.prisma.$transaction(async (tx) => {
      const r = await tx.review.findUnique({ where: { id }, include: { course: { select: { id: true, title: true } } } });
      if (!r) throw E.notFound();
      const { count } = await tx.review.updateMany({
        where: { id, hiddenAt: null },
        data: { hiddenAt: new Date(), hiddenById: adminId, hiddenReason: reason },
      });
      if (count === 0) return null;
      await this.audit.record(tx, {
        actorId: adminId,
        action: 'review.hide',
        targetType: 'review',
        targetId: id,
        before: { hidden: false },
        after: { hidden: true, reason, courseId: r.courseId, authorId: r.userId, rating: r.rating, body: r.body },
        ip,
      });
      return r;
    });
    if (changed) {
      await this.notifySafe({
        userId: changed.userId,
        type: 'REVIEW_HIDDEN',
        params: { course: changed.course.title, reason },
        link: `/courses/${changed.course.id}`,
      });
    }
    return this.adminOne(id);
  }

  async unhide(id: string, adminId: string, ip?: string): Promise<AdminReviewView> {
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.review.findUnique({ where: { id } });
      if (!r) throw E.notFound();
      if (!r.hiddenAt) return;
      await tx.review.update({ where: { id }, data: { hiddenAt: null, hiddenById: null, hiddenReason: null } });
      await this.audit.record(tx, {
        actorId: adminId,
        action: 'review.unhide',
        targetType: 'review',
        targetId: id,
        before: { hidden: true, reason: r.hiddenReason },
        after: { hidden: false },
        ip,
      });
    });
    return this.adminOne(id);
  }

  async hideReply(id: string, adminId: string, reason: string, ip?: string): Promise<AdminReviewView> {
    const reviewId = await this.prisma.$transaction(async (tx) => {
      const r = await tx.reviewReply.findUnique({ where: { id } });
      if (!r) throw E.replyNotFound();
      const { count } = await tx.reviewReply.updateMany({
        where: { id, hiddenAt: null },
        data: { hiddenAt: new Date(), hiddenById: adminId, hiddenReason: reason },
      });
      if (count > 0) {
        await this.audit.record(tx, {
          actorId: adminId,
          action: 'review.reply.hide',
          targetType: 'review_reply',
          targetId: id,
          before: { hidden: false },
          after: { hidden: true, reason, reviewId: r.reviewId, authorId: r.authorId, body: r.body },
          ip,
        });
      }
      return r.reviewId;
    });
    return this.adminOne(reviewId);
  }

  async unhideReply(id: string, adminId: string, ip?: string): Promise<AdminReviewView> {
    const reviewId = await this.prisma.$transaction(async (tx) => {
      const r = await tx.reviewReply.findUnique({ where: { id } });
      if (!r) throw E.replyNotFound();
      if (r.hiddenAt) {
        await tx.reviewReply.update({ where: { id }, data: { hiddenAt: null, hiddenById: null, hiddenReason: null } });
        await this.audit.record(tx, {
          actorId: adminId,
          action: 'review.reply.unhide',
          targetType: 'review_reply',
          targetId: id,
          before: { hidden: true, reason: r.hiddenReason },
          after: { hidden: false },
          ip,
        });
      }
      return r.reviewId;
    });
    return this.adminOne(reviewId);
  }

  // ---- дотоод --------------------------------------------------------------

  private async publishedCourse(id: string): Promise<PublishedCourse> {
    const course = await this.prisma.course.findFirst({
      where: { id, status: 'PUBLISHED' },
      select: { id: true, title: true, teacherId: true },
    });
    if (!course) throw E.courseNotFound();
    return course;
  }

  /** Эзэмшсэн нийтлэгдсэн lesson-ы хувь ба босго. */
  private async eligibility(course: PublishedCourse, userId: string) {
    const [requiredPercent, lessons, ownership] = await Promise.all([
      this.settings.get('reviewMinOwnedPercent'),
      this.prisma.lesson.findMany({ where: { courseId: course.id, ...publicLessonWhere }, select: { id: true } }),
      courseOwnership(this.prisma, userId, course.id),
    ]);
    const total = lessons.length;
    const owned = lessons.filter((l) => ownsFrom(ownership, l.id)).length;
    const isTeacher = course.teacherId === userId;
    return {
      isTeacher,
      requiredPercent,
      ownedPercent: total === 0 ? 0 : Math.floor((owned * 100) / total),
      // Бүхэл тоогоор харьцуулна (хувийг бүхэлчилснээс болж 29.9% → 30% болохгүй).
      eligible: !isTeacher && owned > 0 && owned * 100 >= requiredPercent * total,
    };
  }

  private async viewerState(course: PublishedCourse, userId: string): Promise<ReviewViewerState> {
    const [elig, own] = await Promise.all([
      this.eligibility(course, userId),
      this.prisma.review.findUnique({ where: { userId_courseId: { userId, courseId: course.id } }, include: reviewInclude(false) }),
    ]);
    return {
      eligible: elig.eligible,
      ownedPercent: elig.ownedPercent,
      requiredPercent: elig.requiredPercent,
      isTeacher: elig.isTeacher,
      review: own ? toView(own) : null,
    };
  }

  private async edit(id: string, rating: number, body: string): Promise<ReviewView> {
    await this.prisma.review.update({ where: { id }, data: { rating, body, editedAt: new Date() } });
    return this.one(id);
  }

  private async one(id: string): Promise<ReviewView> {
    return toView(await this.prisma.review.findUniqueOrThrow({ where: { id }, include: reviewInclude(false) }));
  }

  private async adminOne(id: string): Promise<AdminReviewView> {
    return toAdminView(
      await this.prisma.review.findUniqueOrThrow({
        where: { id },
        include: { ...reviewInclude(true), hiddenBy: { select: { id: true, name: true } } },
      }),
    );
  }

  /** Мэдэгдэл үйлдлийн дараа; алдаа гарвал үйлдэл хэвээр (log). */
  private async notifySafe(input: NotifyInput): Promise<void> {
    try {
      await this.notifications.notify(input);
    } catch (err) {
      this.log.error(`Үнэлгээний мэдэгдэл илгээгдсэнгүй (${input.type}, ${input.userId}): ${(err as Error).message}`);
    }
  }
}

function reviewLink(courseId: string, reviewId: string): string {
  return `/courses/${courseId}#review-${reviewId}`;
}

/** Курсийн багш бол нийтийн багшийн нэр; бусад нь profile-ийн нэр. Холбоо барих мэдээлэл хэзээ ч орохгүй. */
function authorRef(u: ReviewRow['user'], isCourseTeacher: boolean): ReviewAuthorRef {
  if (isCourseTeacher) return teacherRef(u);
  return { id: u.id, name: u.name?.trim() || LEARNER_FALLBACK_NAME, avatarUrl: u.avatarUrl };
}

function toReplyView(r: ReviewRow['replies'][number], teacherId: string): ReviewReplyView {
  const byTeacher = r.authorId === teacherId;
  return {
    id: r.id,
    author: authorRef(r.author, byTeacher),
    byTeacher,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    hidden: r.hiddenAt !== null,
    hiddenReason: r.hiddenReason,
  };
}

function toView(r: ReviewRow): ReviewView {
  return {
    id: r.id,
    courseId: r.courseId,
    rating: r.rating,
    body: r.body,
    author: authorRef(r.user, false),
    createdAt: r.createdAt.toISOString(),
    editedAt: r.editedAt?.toISOString() ?? null,
    hidden: r.hiddenAt !== null,
    hiddenReason: r.hiddenReason,
    replies: r.replies.map((x) => toReplyView(x, r.course.teacherId)),
  };
}

function toAdminView(r: AdminReviewRow): AdminReviewView {
  return {
    ...toView(r),
    course: { id: r.course.id, title: r.course.title },
    hiddenBy: r.hiddenBy,
    hiddenAt: r.hiddenAt?.toISOString() ?? null,
  };
}
