import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma, PurchaseAttribution } from '@lms/db';
import type { TeacherEarningEntryView, TeacherEarningsView } from '@lms/shared';
import { ApiError } from '../auth/errors';
import { PrismaService } from '../prisma/prisma.service';
import type { Db } from './entitlements';

type Tx = Prisma.TransactionClient;

/**
 * Борлуулалтын орлого (₮). SPEC: зарцуулсан кредит × худалдах үеийн кредитийн ₮ үнэ × (1 − шимтгэл).
 * Бүхэл тоогоор: `gross = credits × creditPriceMnt`, `amount = floor(gross × (100 − commission%) / 100)`.
 * Бутархай үлдэгдэл (≤ 0.99₮) платформд үлдэнэ — багшид хэзээ ч илүү бичигдэхгүй.
 */
export function saleEarning(
  credits: number,
  creditPriceMnt: number,
  commissionPercent: number,
): { grossMnt: number; amountMnt: number } {
  const grossMnt = credits * creditPriceMnt;
  const amountMnt = Math.floor((grossMnt * (100 - commissionPercent)) / 100);
  if (!Number.isSafeInteger(grossMnt) || grossMnt > 2_147_483_647) throw new Error('Earning amount overflow');
  return { grossMnt, amountMnt };
}

export interface SaleEarningInput {
  teacherId: string;
  purchaseId: string;
  credits: number;
  creditPriceMnt: number;
  commissionPercent: number;
  attribution: PurchaseAttribution;
  isTest: boolean;
  now: Date;
}

export interface EarningAppendInput {
  teacherId: string;
  type: 'PAYOUT' | 'ADMIN_ADJUST';
  /** Тэмдэгтэй ₮ (payout −) */
  amountMnt: number;
  reason?: string;
  actorId?: string;
  refType?: string;
  refId?: string;
}

/**
 * Багшийн орлогын append-only ledger (`teacher_earning_entries`). Үлдэгдэл = тест бус бичилтийн нийлбэр.
 * Бичилт зөвхөн энэ service-ээр: `recordSale` (худалдан авалтын transaction дотор), `append` (payout,
 * админ засвар — ticket 20/22, дуудагчийн transaction дотор).
 */
@Injectable()
export class TeacherEarningsService {
  constructor(private readonly prisma: PrismaService) {}

  /** SALE_EARNING бичнэ (дүн 0 бол — 100% шимтгэл — бичилтгүй). Буцаах: бичилтийн id эсвэл null. */
  async recordSale(tx: Tx, input: SaleEarningInput): Promise<string | null> {
    const { grossMnt, amountMnt } = saleEarning(input.credits, input.creditPriceMnt, input.commissionPercent);
    if (amountMnt <= 0) return null;
    const entry = await tx.teacherEarningEntry.create({
      data: {
        teacherId: input.teacherId,
        type: 'SALE_EARNING',
        amountMnt,
        purchaseId: input.purchaseId,
        credits: input.credits,
        creditPriceMnt: input.creditPriceMnt,
        commissionPercent: input.commissionPercent,
        grossMnt,
        attribution: input.attribution,
        isTest: input.isTest,
        createdAt: input.now,
      },
    });
    return entry.id;
  }

  /** PAYOUT / ADMIN_ADJUST бичилт. Үлдэгдлийн шалгалт, түгжээг дуудагч (ticket 20) хариуцна. */
  async append(tx: Tx, input: EarningAppendInput): Promise<string> {
    if (!Number.isInteger(input.amountMnt) || input.amountMnt === 0) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_AMOUNT', 'Дүн тэгээс ялгаатай бүхэл тоо байх ёстой.');
    }
    const entry = await tx.teacherEarningEntry.create({
      data: {
        teacherId: input.teacherId,
        type: input.type,
        amountMnt: input.amountMnt,
        reason: input.reason ?? null,
        actorId: input.actorId ?? null,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
      },
    });
    return entry.id;
  }

  /** Payout хийх боломжтой үлдэгдэл (₮, тест бичилтгүй). */
  async balance(teacherId: string, db: Db = this.prisma): Promise<number> {
    const agg = await db.teacherEarningEntry.aggregate({
      where: { teacherId, isTest: false },
      _sum: { amountMnt: true },
    });
    return agg._sum.amountMnt ?? 0;
  }

  async view(teacherId: string, opts: { limit: number; before?: string }): Promise<TeacherEarningsView> {
    const [sums, rows] = await Promise.all([
      this.prisma.teacherEarningEntry.groupBy({
        by: ['isTest', 'type'],
        where: { teacherId },
        _sum: { amountMnt: true },
      }),
      this.prisma.teacherEarningEntry.findMany({
        where: { teacherId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: opts.limit + 1,
        ...(opts.before ? { cursor: { id: opts.before }, skip: 1 } : {}),
        include: {
          purchase: { select: { kind: true, course: { select: { title: true } }, lesson: { select: { title: true } } } },
        },
      }),
    ]);
    const sum = (pred: (s: (typeof sums)[number]) => boolean) =>
      sums.filter(pred).reduce((acc, s) => acc + (s._sum.amountMnt ?? 0), 0);
    const page = rows.slice(0, opts.limit);
    return {
      balanceMnt: sum((s) => !s.isTest),
      totalEarnedMnt: sum((s) => !s.isTest && s.type === 'SALE_EARNING'),
      testBalanceMnt: sum((s) => s.isTest),
      items: page.map(
        (r): TeacherEarningEntryView => ({
          id: r.id,
          type: r.type,
          amountMnt: r.amountMnt,
          credits: r.credits,
          creditPriceMnt: r.creditPriceMnt,
          commissionPercent: r.commissionPercent,
          grossMnt: r.grossMnt,
          attribution: r.attribution,
          sale: r.purchase
            ? { kind: r.purchase.kind, courseTitle: r.purchase.course.title, lessonTitle: r.purchase.lesson?.title ?? null }
            : null,
          reason: r.reason,
          isTest: r.isTest,
          createdAt: r.createdAt.toISOString(),
        }),
      ),
      nextCursor: rows.length > opts.limit ? page[page.length - 1]!.id : null,
    };
  }
}
