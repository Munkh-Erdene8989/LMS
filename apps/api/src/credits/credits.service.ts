import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type CreditEntryType } from '@lms/db';
import type { CreditBalanceView, CreditHistoryPage } from '@lms/shared';
import { AuditService } from '../admin/audit.service';
import { SettingsService } from '../admin/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreditErrors as E } from './errors';

export type Tx = Prisma.TransactionClient;

/**
 * Кредит өөрчлөх transaction-д өгөх сонголт. Хэрэглэгчийн мөрийн түгжээг хүлээх тул
 * Prisma-гийн анхдагч (2с/5с)-аас урт. Ticket 09 гэх мэт: `prisma.$transaction(fn, CREDIT_TX_OPTIONS)`.
 */
export const CREDIT_TX_OPTIONS = { maxWait: 15_000, timeout: 30_000 } as const;

export type GrantSource = Extract<CreditEntryType, 'TOPUP' | 'SUBSCRIPTION_GRANT' | 'ADMIN_ADJUST'>;

export interface GrantInput {
  userId: string;
  credits: number;
  source: GrantSource;
  /** TOPUP / SUBSCRIPTION_GRANT-ийн төлбөр (lot-д unique — нэг төлбөр нэг л lot) */
  paymentId?: string;
  isTest?: boolean;
  reason?: string;
  actorId?: string;
  refType?: string;
  refId?: string;
  /** Өгөхгүй бол `creditValidityMonths` тохиргоо */
  validityMonths?: number;
  now?: Date;
}

export interface GrantResult {
  lotId: string;
  entryId: string;
  expiresAt: Date;
}

export interface SpendInput {
  userId: string;
  credits: number;
  /** Анхдагч `SPEND`; админ хасалт `ADMIN_ADJUST` */
  type?: Extract<CreditEntryType, 'SPEND' | 'ADMIN_ADJUST'>;
  /** Юунд зарцуулсан (жишээ нь `lesson`, lessonId) */
  refType?: string;
  refId?: string;
  reason?: string;
  actorId?: string;
  now?: Date;
}

export interface SpendResult {
  entryId: string;
  /** Аль нэг lot нь тест төлбөрөөс бол true — тайланд тусад нь */
  isTest: boolean;
  allocations: { lotId: string; credits: number; isTest: boolean }[];
}

export interface ExpiredLot {
  lotId: string;
  userId: string;
  /** Дуусгавраар хассан үлдэгдэл */
  credits: number;
  expiresAt: Date;
  isTest: boolean;
  entryId: string;
}

/**
 * Кредитийн балансыг өөрчлөх **цорын ганц** нэвтрэх цэг (SPEC: мөнгөний дүрэм).
 *
 * - Ledger append-only: `credit_ledger_entries` (+ `credit_allocations` нь аль lot-оос).
 * - Баланс = хугацаа дуусаагүй lot-уудын `remaining` нийлбэр.
 * - Өөрчлөлт бүр хэрэглэгчийн мөрийг `FOR NO KEY UPDATE`-ээр түгжинэ → нэг хэрэглэгчийн
 *   зэрэг зарцуулалт дараалж, баланс сөрөг болохгүй (DB-д мөн CHECK constraint).
 * - `grant`/`spend` нь дуудагчийн transaction (`tx`) дотор ажиллана — худалдан авалт
 *   (кредит хасах + эрх + багшийн орлого) нэг transaction-д атомар байна.
 */
@Injectable()
export class CreditsService {
  private readonly log = new Logger(CreditsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /** Шинэ lot + орлогын бичилт. `credits` > 0. */
  async grant(tx: Tx, input: GrantInput): Promise<GrantResult> {
    assertPositiveInt(input.credits);
    await this.lockUser(tx, input.userId);
    const now = input.now ?? new Date();
    const months = input.validityMonths ?? (await this.settings.get('creditValidityMonths', tx));
    const expiresAt = addMonths(now, months);
    const isTest = input.isTest ?? false;

    const lot = await tx.creditLot.create({
      data: {
        userId: input.userId,
        source: input.source,
        initial: input.credits,
        remaining: input.credits,
        expiresAt,
        paymentId: input.paymentId ?? null,
        isTest,
        createdAt: now,
      },
    });
    const entry = await tx.creditLedgerEntry.create({
      data: {
        userId: input.userId,
        type: input.source,
        amount: input.credits,
        isTest,
        reason: input.reason ?? null,
        actorId: input.actorId ?? null,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        paymentId: input.paymentId ?? null,
        createdAt: now,
        allocations: { create: [{ lotId: lot.id, amount: input.credits }] },
      },
    });
    return { lotId: lot.id, entryId: entry.id, expiresAt };
  }

  /**
   * FIFO: хамгийн эрт дуусах lot-оос эхэлж хасна. Хүрэлцэхгүй бол `INSUFFICIENT_CREDITS`
   * (transaction rollback хийгдэнэ — дуудагч юу ч бичихгүй).
   */
  async spend(tx: Tx, input: SpendInput): Promise<SpendResult> {
    assertPositiveInt(input.credits);
    await this.lockUser(tx, input.userId);
    const now = input.now ?? new Date();

    const lots = await tx.creditLot.findMany({
      where: { userId: input.userId, remaining: { gt: 0 }, expiresAt: { gt: now } },
      orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    const balance = lots.reduce((s, l) => s + l.remaining, 0);
    if (balance < input.credits) throw E.insufficient(balance, input.credits);

    const allocations: SpendResult['allocations'] = [];
    let left = input.credits;
    for (const lot of lots) {
      if (left === 0) break;
      const take = Math.min(lot.remaining, left);
      // Түгжээ дор ажиллаж байгаа ч давхар хамгаалалт: үлдэгдэл хангалттай үед л хасна.
      const { count } = await tx.creditLot.updateMany({
        where: { id: lot.id, remaining: { gte: take } },
        data: { remaining: { decrement: take } },
      });
      if (count !== 1) throw new Error(`Credit lot ${lot.id} зэрэг өөрчлөгдсөн`);
      allocations.push({ lotId: lot.id, credits: take, isTest: lot.isTest });
      left -= take;
    }

    const isTest = allocations.some((a) => a.isTest);
    const entry = await tx.creditLedgerEntry.create({
      data: {
        userId: input.userId,
        type: input.type ?? 'SPEND',
        amount: -input.credits,
        isTest,
        reason: input.reason ?? null,
        actorId: input.actorId ?? null,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        createdAt: now,
        allocations: { create: allocations.map((a) => ({ lotId: a.lotId, amount: -a.credits })) },
      },
    });
    return { entryId: entry.id, isTest, allocations };
  }

  /** Хүчинтэй баланс (`tx` өгвөл тэр transaction дотроос). */
  async balance(userId: string, db: Tx | PrismaService = this.prisma, now = new Date()): Promise<number> {
    const agg = await db.creditLot.aggregate({
      where: { userId, remaining: { gt: 0 }, expiresAt: { gt: now } },
      _sum: { remaining: true },
    });
    return agg._sum.remaining ?? 0;
  }

  /**
   * Хугацаа нь дууссан lot-ын үлдэгдлийг `EXPIRE` бичилтээр хасна. Idempotent: `expiredAt`
   * тэмдэглэгдсэн lot дахин хасагдахгүй. Ticket 16-ийн өдөр тутмын cron үүнийг дуудна.
   * Буцаах: дуусгасан lot-ын тоо.
   */
  async expireDue(now = new Date(), batchSize = 500): Promise<number> {
    return (await this.expireDueLots(now, batchSize)).length;
  }

  /**
   * `expireDue`-тэй ижил (нэг batch), харин **энэ дуудлага** дуусгасан lot-уудыг буцаана —
   * зэрэг ажилласан өөр дуудлагын дуусгасныг оруулахгүй (мэдэгдэл давхардуулахгүйн тулд).
   * Lot бүр хэрэглэгчийн түгжээ дор дахин уншигдана → `spend()`-тэй зэрэг ажиллахад аль нэг
   * нь дараалж, үлдэгдэл давхар тоологдохгүй.
   */
  async expireDueLots(now = new Date(), batchSize = 500): Promise<ExpiredLot[]> {
    const due = await this.prisma.creditLot.findMany({
      where: { expiresAt: { lte: now }, remaining: { gt: 0 }, expiredAt: null },
      orderBy: { expiresAt: 'asc' },
      take: batchSize,
      select: { id: true, userId: true },
    });
    const expired: ExpiredLot[] = [];
    for (const { id, userId } of due) {
      const done = await this.prisma.$transaction(async (tx): Promise<ExpiredLot | null> => {
        await this.lockUser(tx, userId);
        const lot = await tx.creditLot.findUnique({ where: { id } });
        if (!lot || lot.expiredAt || lot.remaining === 0 || lot.expiresAt > now) return null;
        // Түгжээ дор ч давхар хамгаалалт: дуусгаагүй, уншсан үлдэгдэлтэй хэвээр бол л.
        const { count } = await tx.creditLot.updateMany({
          where: { id, expiredAt: null, remaining: lot.remaining },
          data: { remaining: 0, expiredAt: now },
        });
        if (count !== 1) return null;
        const entry = await tx.creditLedgerEntry.create({
          data: {
            userId,
            type: 'EXPIRE',
            amount: -lot.remaining,
            isTest: lot.isTest,
            createdAt: now,
            allocations: { create: [{ lotId: id, amount: -lot.remaining }] },
          },
        });
        return {
          lotId: id,
          userId,
          credits: lot.remaining,
          expiresAt: lot.expiresAt,
          isTest: lot.isTest,
          entryId: entry.id,
        };
      }, CREDIT_TX_OPTIONS);
      if (done) expired.push(done);
    }
    if (expired.length) this.log.log(`${expired.length} credit lot дууссан`);
    return expired;
  }

  /**
   * Админы гар засвар: `delta` > 0 бол шинэ lot, < 0 бол FIFO хасалт. Шалтгаан, audit заавал.
   */
  async adjust(input: { userId: string; delta: number; reason: string; actorId: string; ip?: string }): Promise<number> {
    if (!Number.isInteger(input.delta) || input.delta === 0) throw E.invalidAmount();
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: input.userId }, select: { id: true } });
      if (!user) throw E.userNotFound();
      await this.lockUser(tx, input.userId);
      const before = await this.balance(input.userId, tx);
      let entryId: string;
      if (input.delta > 0) {
        ({ entryId } = await this.grant(tx, {
          userId: input.userId,
          credits: input.delta,
          source: 'ADMIN_ADJUST',
          reason: input.reason,
          actorId: input.actorId,
        }));
      } else {
        ({ entryId } = await this.spend(tx, {
          userId: input.userId,
          credits: -input.delta,
          type: 'ADMIN_ADJUST',
          reason: input.reason,
          actorId: input.actorId,
        }));
      }
      const after = await this.balance(input.userId, tx);
      await this.audit.record(tx, {
        actorId: input.actorId,
        action: 'credit.adjust',
        targetType: 'user',
        targetId: input.userId,
        before: { balance: before },
        after: { balance: after, delta: input.delta, reason: input.reason, entryId },
        ip: input.ip,
      });
      return after;
    }, CREDIT_TX_OPTIONS);
  }

  async view(userId: string): Promise<CreditBalanceView> {
    const now = new Date();
    const lots = await this.prisma.creditLot.findMany({
      where: { userId, remaining: { gt: 0 }, expiresAt: { gt: now } },
      orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
    });
    return {
      balance: lots.reduce((s, l) => s + l.remaining, 0),
      lots: lots.map((l) => ({
        id: l.id,
        source: l.source,
        initial: l.initial,
        remaining: l.remaining,
        expiresAt: l.expiresAt.toISOString(),
        createdAt: l.createdAt.toISOString(),
      })),
    };
  }

  async history(userId: string, opts: { limit: number; before?: string }): Promise<CreditHistoryPage> {
    const rows = await this.prisma.creditLedgerEntry.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
      ...(opts.before ? { cursor: { id: opts.before }, skip: 1 } : {}),
    });
    const page = rows.slice(0, opts.limit);
    return {
      items: page.map((r) => ({
        id: r.id,
        type: r.type,
        amount: r.amount,
        reason: r.reason,
        refType: r.refType,
        refId: r.refId,
        paymentId: r.paymentId,
        isTest: r.isTest,
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor: rows.length > opts.limit ? page[page.length - 1]!.id : null,
    };
  }

  /**
   * Нэг хэрэглэгчийн кредитийн бүх өөрчлөлтийг дараалуулна. `NO KEY UPDATE` нь FK insert-ийн
   * `KEY SHARE`-тэй зөрчилдөхгүй тул бусад хүснэгтэд (мэдэгдэл г.м) мөр нэмэхийг хаахгүй.
   */
  private async lockUser(tx: Tx, userId: string): Promise<void> {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM users WHERE id = ${userId}::uuid FOR NO KEY UPDATE`;
    if (rows.length === 0) throw E.userNotFound();
  }
}

function assertPositiveInt(n: number): void {
  if (!Number.isInteger(n) || n <= 0) throw E.invalidAmount();
}

/** Сар нэмэх (UTC). 1-р сарын 31 + 1 сар → 2-р сарын сүүлийн өдөр. */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}
