import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type PurchaseAttribution, type PurchaseKind } from '@lms/db';
import type { PurchasePage, PurchaseResult, PurchaseView } from '@lms/shared';
import { SettingsService } from '../admin/settings.service';
import type { CurrentUserInfo } from '../auth/auth.guard';
import { CREDIT_TX_OPTIONS, CreditsService } from '../credits/credits.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeacherEarningsService } from './earnings.service';
import { courseOwnership, ownsFrom } from './entitlements';
import { PurchaseErrors as E } from './errors';

type Tx = Prisma.TransactionClient;

export interface PurchaseConfirmation {
  /** Хэрэглэгчийн харсан үнэ — одоогийнхтой таарахгүй бол `PRICE_CHANGED` */
  expectedCredits: number;
}

/** Худалдан авалтын attribution (шимтгэлийн хувийг тодорхойлно). */
export interface Attribution {
  source: PurchaseAttribution;
  /** REFERRAL үед урьсан багш */
  referrerId: string | null;
}

interface Item {
  kind: PurchaseKind;
  courseId: string;
  courseTitle: string;
  teacherId: string;
  lessonId: string | null;
  title: string;
  listCredits: number;
  /** Төлөх кредит (COURSE: өмнө төлсөн lesson-ы кредит хасагдсан) */
  credits: number;
  /** Шинээр нээгдэх lesson-ууд */
  lessonIds: string[];
}

const purchaseInclude = {
  course: { select: { id: true, title: true } },
  lesson: { select: { id: true, title: true } },
  _count: { select: { entitlements: true } },
} as const satisfies Prisma.PurchaseInclude;

type PurchaseRow = Prisma.PurchaseGetPayload<{ include: typeof purchaseInclude }>;

/**
 * Lesson / курсийн худалдан авалт. SPEC "Мөнгөний дүрэм":
 * - НЭГ transaction (`CREDIT_TX_OPTIONS`): FIFO кредит хасалт + purchase (үнэ, шимтгэл, attribution) +
 *   entitlement + багшийн орлого. Аль нэг нь бүтэлгүйтвэл юу ч бичигдэхгүй.
 * - Эхлээд хэрэглэгчийн мөрийг түгжинэ (CreditsService-тэй ижил `FOR NO KEY UPDATE`) → нэг хэрэглэгчийн
 *   зэрэг худалдан авалтууд дараалж, эзэмшил/үнийг түгжээний дараа уншина. Давхар эзэмшлийн эсрэг
 *   DB-д unique (userId, lessonId) ба (userId, courseId) — P2002 → 409 `ALREADY_OWNED`.
 * - Курсийн үнэ = max(0, курсийн үнэ − энэ курсийн lesson-д ширхэгээр зарцуулсан кредит).
 * - Бүтэн курс: одоогийн зөвшөөрөгдсөн, архивлаагүй, эзэмшээгүй lesson бүрт `Entitlement` + `CourseEntitlement`
 *   (дараа зөвшөөрөгдөх шинэ lesson-ууд ч нээгдэнэ). Үнэ 0 бол кредит хасалт, орлогогүйгээр эрх үүснэ.
 */
@Injectable()
export class PurchasesService {
  private readonly log = new Logger(PurchasesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly settings: SettingsService,
    private readonly earnings: TeacherEarningsService,
    private readonly notifications: NotificationsService,
  ) {}

  buyLesson(user: CurrentUserInfo, lessonId: string, confirm: PurchaseConfirmation): Promise<PurchaseResult> {
    return this.buy(user, confirm, (tx) => this.lessonItem(tx, user.id, lessonId));
  }

  buyCourse(user: CurrentUserInfo, courseId: string, confirm: PurchaseConfirmation): Promise<PurchaseResult> {
    return this.buy(user, confirm, (tx) => this.courseItem(tx, user.id, courseId));
  }

  async list(userId: string, opts: { limit: number; before?: string }): Promise<PurchasePage> {
    const rows = await this.prisma.purchase.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
      ...(opts.before ? { cursor: { id: opts.before }, skip: 1 } : {}),
      include: purchaseInclude,
    });
    const page = rows.slice(0, opts.limit);
    return { items: page.map(toView), nextCursor: rows.length > opts.limit ? page[page.length - 1]!.id : null };
  }

  /**
   * Attribution — ticket 11 (referral) энд referral cookie/record-ыг шалгаж `REFERRAL` + `referrerId` буцаана.
   * Одоогоор бүх худалдан авалт platform-sourced.
   */
  protected async attribution(_tx: Tx, _userId: string, _teacherId: string): Promise<Attribution> {
    return { source: 'PLATFORM', referrerId: null };
  }

  // ---------------------------------------------------------------------------

  private async buy(
    user: CurrentUserInfo,
    confirm: PurchaseConfirmation,
    resolve: (tx: Tx) => Promise<Item>,
  ): Promise<PurchaseResult> {
    const verified = await this.prisma.identifier.count({ where: { userId: user.id } });
    if (verified === 0) throw E.identifierRequired();

    let result: { row: PurchaseRow; balance: number; item: Item };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        await lockUser(tx, user.id);
        const item = await resolve(tx);
        if (item.credits !== confirm.expectedCredits) throw E.priceChanged(item.credits);

        const now = new Date();
        const purchaseId = randomUUID();
        const attribution = await this.attribution(tx, user.id, item.teacherId);
        const creditPriceMnt = await this.settings.get('creditPriceMnt', tx);
        const commissionPercent = await this.settings.get(
          attribution.source === 'REFERRAL' ? 'commissionReferralPercent' : 'commissionPlatformPercent',
          tx,
        );

        const spend =
          item.credits > 0
            ? await this.credits.spend(tx, {
                userId: user.id,
                credits: item.credits,
                refType: item.kind === 'LESSON' ? 'lesson_purchase' : 'course_purchase',
                refId: purchaseId,
                now,
              })
            : null;
        const isTest = spend?.isTest ?? false;

        await tx.purchase.create({
          data: {
            id: purchaseId,
            userId: user.id,
            courseId: item.courseId,
            lessonId: item.lessonId,
            teacherId: item.teacherId,
            kind: item.kind,
            listCredits: item.listCredits,
            credits: item.credits,
            creditPriceMnt,
            commissionPercent,
            attribution: attribution.source,
            referrerId: attribution.referrerId,
            creditEntryId: spend?.entryId ?? null,
            isTest,
            createdAt: now,
          },
        });
        if (item.lessonIds.length > 0) {
          await tx.entitlement.createMany({
            data: item.lessonIds.map((lessonId) => ({
              userId: user.id,
              lessonId,
              courseId: item.courseId,
              purchaseId,
              createdAt: now,
            })),
          });
        }
        if (item.kind === 'COURSE') {
          await tx.courseEntitlement.create({
            data: { userId: user.id, courseId: item.courseId, purchaseId, createdAt: now },
          });
        }
        if (item.credits > 0) {
          await this.earnings.recordSale(tx, {
            teacherId: item.teacherId,
            purchaseId,
            credits: item.credits,
            creditPriceMnt,
            commissionPercent,
            attribution: attribution.source,
            isTest,
            now,
          });
        }

        const row = await tx.purchase.findUniqueOrThrow({ where: { id: purchaseId }, include: purchaseInclude });
        return { row, balance: await this.credits.balance(user.id, tx, now), item };
      }, CREDIT_TX_OPTIONS);
    } catch (err) {
      // Түгжээний ачаар хэвийн үед энд хүрэхгүй; unique constraint нь сүүлчийн хамгаалалт.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw E.alreadyOwned();
      throw err;
    }

    await this.receipt(user.id, result.row, result.item, result.balance);
    return { purchase: toView(result.row), balance: result.balance };
  }

  /** Lesson: зөвшөөрөгдсөн, архивлаагүй, нийтлэгдсэн курсийнх; өөрийн курс биш; эзэмшээгүй. */
  private async lessonItem(tx: Tx, userId: string, lessonId: string): Promise<Item> {
    const lesson = await tx.lesson.findFirst({
      where: { id: lessonId, reviewStatus: 'APPROVED', archivedAt: null, course: { status: 'PUBLISHED' } },
      include: { course: { select: { id: true, title: true, teacherId: true } } },
    });
    if (!lesson) throw E.lessonNotFound();
    if (lesson.course.teacherId === userId) throw E.ownCourse();
    const owned = await courseOwnership(tx, userId, lesson.courseId);
    if (ownsFrom(owned, lesson.id)) throw E.alreadyOwned();
    return {
      kind: 'LESSON',
      courseId: lesson.courseId,
      courseTitle: lesson.course.title,
      teacherId: lesson.course.teacherId,
      lessonId: lesson.id,
      title: lesson.title,
      listCredits: lesson.priceCredits,
      credits: lesson.priceCredits,
      lessonIds: [lesson.id],
    };
  }

  /** Бүтэн курс: нийтлэгдсэн, үнэтэй; өөрийнх биш; бүтнээр аваагүй. */
  private async courseItem(tx: Tx, userId: string, courseId: string): Promise<Item> {
    const course = await tx.course.findFirst({
      where: { id: courseId, status: 'PUBLISHED' },
      include: { lessons: { where: { reviewStatus: 'APPROVED', archivedAt: null }, select: { id: true } } },
    });
    if (!course) throw E.courseNotFound();
    if (course.teacherId === userId) throw E.ownCourse();
    if (course.priceCredits === null) throw E.notForSale();
    const owned = await courseOwnership(tx, userId, courseId);
    if (owned.ownsCourse) throw E.alreadyOwned();
    return {
      kind: 'COURSE',
      courseId,
      courseTitle: course.title,
      teacherId: course.teacherId,
      lessonId: null,
      title: course.title,
      listCredits: course.priceCredits,
      credits: Math.max(0, course.priceCredits - owned.spentOnLessons),
      lessonIds: course.lessons.map((l) => l.id).filter((id) => !owned.lessonIds.has(id)),
    };
  }

  /** Баримтын мэдэгдэл (in-app + имэйл). Худалдан авалт commit болсон — мэдэгдлийн алдаа түүнийг буцаахгүй. */
  private async receipt(userId: string, row: PurchaseRow, item: Item, balance: number): Promise<void> {
    try {
      await this.notifications.notify({
        userId,
        type: item.kind === 'LESSON' ? 'PURCHASE_LESSON' : 'PURCHASE_COURSE',
        params: {
          title: item.title,
          course: item.courseTitle,
          credits: row.credits,
          lessons: item.lessonIds.length,
          balance,
          purchaseId: row.id.slice(0, 8).toUpperCase(),
        },
        link: item.lessonId ? `/courses/${item.courseId}/lessons/${item.lessonId}` : `/courses/${item.courseId}`,
      });
    } catch (err) {
      this.log.error(`Purchase receipt ${row.id} илгээгдсэнгүй: ${String(err)}`);
    }
  }
}

/** CreditsService-тэй ижил түгжээ (нэг transaction дотор давтан авахад саадгүй). */
async function lockUser(tx: Tx, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR NO KEY UPDATE`;
}

function toView(r: PurchaseRow): PurchaseView {
  return {
    id: r.id,
    kind: r.kind,
    course: r.course,
    lesson: r.lesson,
    listCredits: r.listCredits,
    credits: r.credits,
    lessonCount: r._count.entitlements,
    isTest: r.isTest,
    createdAt: r.createdAt.toISOString(),
  };
}
