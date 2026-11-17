import { Injectable } from '@nestjs/common';
import { Prisma } from '@lms/db';
import type {
  AdminReportSummary,
  CreditTotals,
  ExpiredCreditsReport,
  ReportRange,
  ReportSection,
  ReportTopCourse,
  ReportTopTeacher,
  RevenueTotals,
  AdminSalesTotals,
} from '@lms/shared';
import { PrismaService } from '../prisma/prisma.service';
import { contactSelect, toContact } from './contact';
import { AdminOpsErrors as E } from './errors';

/** Монгол (Улаанбаатар) UTC+8, DST-гүй — өдрийн хил тайланд. */
const UB_OFFSET_MS = 8 * 60 * 60_000;
const DAY = 24 * 60 * 60_000;
const TOP = 10;
const EXPIRED_ITEMS = 100;

export interface Bounds {
  range: ReportRange;
  /** [gte, lt) */
  gte: Date;
  lt: Date;
}

/** `YYYY-MM-DD` (Улаанбаатар) муж → UTC хил. Өгөхгүй бол сүүлийн 30 хоног (өнөөдрийг оролцуулан). */
export function reportBounds(from: string | undefined, to: string | undefined, now = new Date()): Bounds {
  const today = ubDate(now);
  const toDay = to ?? today;
  const fromDay = from ?? ubDate(new Date(dayStart(toDay).getTime() - 29 * DAY));
  const gte = dayStart(fromDay);
  const lt = new Date(dayStart(toDay).getTime() + DAY);
  if (Number.isNaN(gte.getTime()) || Number.isNaN(lt.getTime()) || gte >= lt || lt.getTime() - gte.getTime() > 366 * DAY) {
    throw E.invalidRange();
  }
  return { range: { from: fromDay, to: toDay }, gte, lt };
}

function dayStart(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) - UB_OFFSET_MS);
}

function ubDate(d: Date): string {
  return new Date(d.getTime() + UB_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Админы тайлан (ticket 22). `is_test` гүйлгээ (100₮ тест багц, тест lot-оос зарцуулсан) үндсэн тоонд
 * **орохгүй** — `test` хэсэгт тусдаа. Бүх дүн бүхэл ₮ / кредит.
 */
@Injectable()
export class AdminReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(b: Bounds): Promise<AdminReportSummary> {
    const [live, test, payouts, topCourses, topTeachers] = await Promise.all([
      this.section(b, false),
      this.section(b, true),
      this.prisma.payout.aggregate({
        where: { status: 'PAID', processedAt: { gte: b.gte, lt: b.lt } },
        _sum: { amountMnt: true },
      }),
      this.topCourses(b),
      this.topTeachers(b),
    ]);
    return { range: b.range, live, test, payoutsPaidMnt: payouts._sum.amountMnt ?? 0, topCourses, topTeachers };
  }

  async expiredCredits(b: Bounds, now = new Date()): Promise<ExpiredCreditsReport> {
    const window = { gte: b.gte, lt: b.lt };
    const [sums, upcoming, entries] = await Promise.all([
      this.prisma.creditLedgerEntry.groupBy({
        by: ['isTest'],
        where: { type: 'EXPIRE', createdAt: window },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.creditLot.groupBy({
        by: ['isTest'],
        where: { remaining: { gt: 0 }, expiredAt: null, expiresAt: { gt: now, lte: new Date(now.getTime() + 30 * DAY) } },
        _sum: { remaining: true },
      }),
      this.prisma.creditLedgerEntry.findMany({
        where: { type: 'EXPIRE', createdAt: window },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: EXPIRED_ITEMS,
        include: {
          user: { select: contactSelect },
          allocations: { include: { lot: { select: { id: true, source: true, initial: true, expiresAt: true } } } },
        },
      }),
    ]);
    const totals = (isTest: boolean) => {
      const s = sums.find((x) => x.isTest === isTest);
      return { credits: -(s?._sum.amount ?? 0), lots: s?._count._all ?? 0 };
    };
    const soon = (isTest: boolean) => upcoming.find((x) => x.isTest === isTest)?._sum.remaining ?? 0;
    return {
      range: b.range,
      live: totals(false),
      test: totals(true),
      upcoming30d: { live: soon(false), test: soon(true) },
      items: entries.flatMap((e) =>
        e.allocations.map((a) => ({
          lotId: a.lot.id,
          user: toContact(e.user),
          source: a.lot.source,
          initial: a.lot.initial,
          expiredCredits: -a.amount,
          expiresAt: a.lot.expiresAt.toISOString(),
          isTest: e.isTest,
        })),
      ),
    };
  }

  // ---- дотоод ---------------------------------------------------------------

  private async section(b: Bounds, isTest: boolean): Promise<ReportSection> {
    const [revenue, credits, sales] = await Promise.all([this.revenue(b, isTest), this.credits(b, isTest), this.sales(b, isTest)]);
    return { revenue, credits, sales };
  }

  /** Бодит орсон мөнгө: PAID төлбөрийн QPay-ийн төлсөн дүн, төлөгдсөн огноогоор. */
  private async revenue(b: Bounds, isTest: boolean): Promise<RevenueTotals> {
    const rows = await this.prisma.payment.groupBy({
      by: ['purpose'],
      where: { status: 'PAID', isTest, paidAt: { gte: b.gte, lt: b.lt } },
      _sum: { paidAmountMnt: true },
      _count: { _all: true },
    });
    const of = (purpose: string) => rows.find((r) => r.purpose === purpose)?._sum.paidAmountMnt ?? 0;
    const topupMnt = of('CREDIT_TOPUP');
    const subscriptionMnt = of('SUBSCRIPTION');
    return {
      totalMnt: topupMnt + subscriptionMnt,
      topupMnt,
      subscriptionMnt,
      payments: rows.reduce((s, r) => s + r._count._all, 0),
    };
  }

  private async credits(b: Bounds, isTest: boolean): Promise<CreditTotals> {
    const where = { isTest, createdAt: { gte: b.gte, lt: b.lt } };
    const [byType, added, removed] = await Promise.all([
      this.prisma.creditLedgerEntry.groupBy({ by: ['type'], where, _sum: { amount: true } }),
      this.prisma.creditLedgerEntry.aggregate({ where: { ...where, type: 'ADMIN_ADJUST', amount: { gt: 0 } }, _sum: { amount: true } }),
      this.prisma.creditLedgerEntry.aggregate({ where: { ...where, type: 'ADMIN_ADJUST', amount: { lt: 0 } }, _sum: { amount: true } }),
    ]);
    const of = (type: string) => byType.find((r) => r.type === type)?._sum.amount ?? 0;
    return {
      topup: of('TOPUP'),
      subscriptionGrant: of('SUBSCRIPTION_GRANT'),
      spent: -of('SPEND'),
      expired: -of('EXPIRE'),
      adminAdded: added._sum.amount ?? 0,
      adminRemoved: -(removed._sum.amount ?? 0),
    };
  }

  private async sales(b: Bounds, isTest: boolean): Promise<AdminSalesTotals> {
    const [rows, earned] = await Promise.all([
      this.prisma.$queryRaw<{ purchases: bigint; credits: bigint | null; gross: bigint | null }[]>`
        SELECT count(*) AS purchases, sum(credits) AS credits, sum(credits::bigint * credit_price_mnt) AS gross
        FROM purchases
        WHERE is_test = ${isTest} AND created_at >= ${b.gte} AND created_at < ${b.lt}`,
      this.prisma.teacherEarningEntry.aggregate({
        where: { type: 'SALE_EARNING', isTest, createdAt: { gte: b.gte, lt: b.lt } },
        _sum: { amountMnt: true },
      }),
    ]);
    const r = rows[0];
    const grossMnt = Number(r?.gross ?? 0);
    const teacherEarningsMnt = earned._sum.amountMnt ?? 0;
    return {
      purchases: Number(r?.purchases ?? 0),
      credits: Number(r?.credits ?? 0),
      grossMnt,
      teacherEarningsMnt,
      platformMnt: grossMnt - teacherEarningsMnt,
    };
  }

  /** Тест бус худалдан авалтаар (₮ gross-оор) эрэмбэлсэн. */
  private async topCourses(b: Bounds): Promise<ReportTopCourse[]> {
    const rows = await this.prisma.$queryRaw<
      { course_id: string; purchases: bigint; credits: bigint; gross: bigint }[]
    >`
      SELECT course_id, count(*) AS purchases, sum(credits) AS credits, sum(credits::bigint * credit_price_mnt) AS gross
      FROM purchases
      WHERE is_test = false AND created_at >= ${b.gte} AND created_at < ${b.lt}
      GROUP BY course_id
      ORDER BY gross DESC, purchases DESC, course_id
      LIMIT ${TOP}`;
    if (rows.length === 0) return [];
    const courses = await this.prisma.course.findMany({
      where: { id: { in: rows.map((r) => r.course_id) } },
      select: { id: true, title: true, teacher: { select: teacherName } },
    });
    const byId = new Map(courses.map((c) => [c.id, c]));
    return rows.map((r) => {
      const c = byId.get(r.course_id);
      return {
        courseId: r.course_id,
        title: c?.title ?? '—',
        teacher: c ? displayTeacher(c.teacher) : { id: '', name: null },
        purchases: Number(r.purchases),
        credits: Number(r.credits),
        grossMnt: Number(r.gross),
      };
    });
  }

  /** Тест бус борлуулалтын орлогоор (SALE_EARNING) эрэмбэлсэн. */
  private async topTeachers(b: Bounds): Promise<ReportTopTeacher[]> {
    const rows = await this.prisma.teacherEarningEntry.groupBy({
      by: ['teacherId'],
      where: { type: 'SALE_EARNING', isTest: false, createdAt: { gte: b.gte, lt: b.lt } },
      _sum: { amountMnt: true, grossMnt: true },
      _count: { _all: true },
      orderBy: [{ _sum: { amountMnt: 'desc' } }, { teacherId: 'asc' }],
      take: TOP,
    });
    if (rows.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.teacherId) } },
      select: teacherName,
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => {
      const u = byId.get(r.teacherId);
      return {
        teacher: u ? displayTeacher(u) : { id: r.teacherId, name: null },
        sales: r._count._all,
        grossMnt: r._sum.grossMnt ?? 0,
        earningsMnt: r._sum.amountMnt ?? 0,
      };
    });
  }
}

const teacherName = {
  id: true,
  name: true,
  teacherApplication: { select: { displayName: true } },
} satisfies Prisma.UserSelect;

function displayTeacher(u: { id: string; name: string | null; teacherApplication: { displayName: string } | null }) {
  return { id: u.id, name: u.teacherApplication?.displayName ?? u.name };
}
