import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type Payout, type PayoutStatus } from '@lms/db';
import type {
  AdminPayoutPage,
  AdminPayoutView,
  BankCode,
  EarningsAdjustResult,
  PayoutBlockReason,
  PayoutHoldView,
  PayoutView,
  TeacherPayoutsView,
} from '@lms/shared';
import { AuditService } from '../admin/audit.service';
import { SettingsService } from '../admin/settings.service';
import { ADMIN_ADJUST_REF, CREDIT_TX_OPTIONS } from '../credits/credits.service';
import { NotificationsService, type NotifyInput } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeacherEarningsService } from '../purchases/earnings.service';
import { PayoutErrors as E } from './errors';
import { toCsv } from './csv';

type Tx = Prisma.TransactionClient;

/** Багшийн мөрийн түгжээ хүлээх тул анхдагчаас урт (CreditsService-тэй ижил). */
const TX = CREDIT_TX_OPTIONS;
const EXPORT_LIMIT = 5000;

const userContact = {
  select: {
    id: true,
    name: true,
    identifiers: { select: { type: true, value: true } },
    teacherApplication: { select: { displayName: true } },
  },
} as const;

type ContactRow = Prisma.UserGetPayload<typeof userContact>;

/**
 * Багшийн payout (SPEC: хүсэлт ≥ босго, hold, export, mark paid).
 *
 * - Хүсэлт = тухайн үеийн бүтэн үлдэгдэл; нээлттэй (REQUESTED) байх хугацаанд түгжигдэнэ
 *   (`available = balance − locked`). Ledger-т юу ч бичихгүй.
 * - "Төлсөн" → ledger-т `PAYOUT` (−дүн) бичилт + хүсэлт PAID — нэг transaction-д. Татгалзвал ledger-т
 *   бичилтгүй, дүн дахин боломжтой болно (буцаалтын бичилт шаардлагагүй).
 * - Багшийн payout төлөвийг өөрчлөх бүх үйлдэл багшийн `users` мөрийг `FOR NO KEY UPDATE`-ээр түгжинэ →
 *   нэг багшийн хүсэлт/төлөлт/татгалзал дараалж явна. Сүүлчийн хамгаалалт DB-д: нэг нээлттэй хүсэлт
 *   (partial unique), нэг хүсэлтэд нэг PAYOUT бичилт (partial unique `ref_id`), төлөвийн CHECK.
 * - "Төлсөн"/"татгалзах"-ыг давтвал (давхар товшилт, зэрэг 2 админ) — ижил үр дүн бол idempotent
 *   (одоогийн төлөвийг буцаана), эсрэг төлөв бол 409.
 */
@Injectable()
export class PayoutsService {
  private readonly log = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly earnings: TeacherEarningsService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- багш -----------------------------------------------------------------

  async teacherView(teacherId: string, opts: { limit: number; before?: string }): Promise<TeacherPayoutsView> {
    const [balanceMnt, minimumMnt, hold, bank, open, rows] = await Promise.all([
      this.earnings.balance(teacherId),
      this.settings.get('payoutMinimumMnt'),
      this.prisma.payoutHold.findUnique({ where: { teacherId } }),
      this.prisma.bankAccount.findUnique({ where: { userId: teacherId }, select: { id: true } }),
      this.prisma.payout.findFirst({ where: { teacherId, status: 'REQUESTED' } }),
      this.prisma.payout.findMany({
        where: { teacherId },
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        take: opts.limit + 1,
        ...(opts.before ? { cursor: { id: opts.before }, skip: 1 } : {}),
      }),
    ]);
    const lockedMnt = open?.amountMnt ?? 0;
    const availableMnt = balanceMnt - lockedMnt;
    const page = rows.slice(0, opts.limit);
    return {
      balanceMnt,
      lockedMnt,
      availableMnt,
      minimumMnt,
      onHold: hold !== null,
      hasBankAccount: bank !== null,
      blockReason: blockReason({ onHold: hold !== null, open: open !== null, bank: bank !== null, availableMnt, minimumMnt }),
      openPayout: open ? toView(open) : null,
      items: page.map(toView),
      nextCursor: rows.length > opts.limit ? page[page.length - 1]!.id : null,
    };
  }

  /** Бүтэн үлдэгдлээр хүсэлт гаргана. */
  async request(teacherId: string, ip?: string): Promise<PayoutView> {
    let payout: Payout;
    try {
      payout = await this.prisma.$transaction(async (tx) => {
        await lockUser(tx, teacherId);
        if (await tx.payoutHold.findUnique({ where: { teacherId } })) throw E.onHold();
        if (await tx.payout.findFirst({ where: { teacherId, status: 'REQUESTED' }, select: { id: true } })) {
          throw E.alreadyOpen();
        }
        const bank = await tx.bankAccount.findUnique({ where: { userId: teacherId } });
        if (!bank) throw E.bankAccountRequired();
        const minimumMnt = await this.settings.get('payoutMinimumMnt', tx);
        // Нээлттэй хүсэлтгүй тул түгжигдсэн дүн 0 → боломжтой = ledger-ийн үлдэгдэл.
        const balanceMnt = await this.earnings.balance(teacherId, tx);
        if (balanceMnt <= 0 || balanceMnt < minimumMnt) throw E.belowMinimum(minimumMnt);

        const created = await tx.payout.create({
          data: {
            teacherId,
            amountMnt: balanceMnt,
            bank: bank.bank,
            accountNumber: bank.accountNumber,
            holderName: bank.holderName,
          },
        });
        await this.audit.record(tx, {
          actorId: teacherId,
          action: 'payout.request',
          targetType: 'payout',
          targetId: created.id,
          after: { status: 'REQUESTED', amountMnt: created.amountMnt, minimumMnt },
          ip,
        });
        return created;
      }, TX);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw E.alreadyOpen();
      throw err;
    }
    await this.notifySafe({
      userId: teacherId,
      type: 'PAYOUT_REQUESTED',
      params: { amount: fmt(payout.amountMnt) },
      link: '/teacher/earnings',
    });
    return toView(payout);
  }

  // ---- админ ----------------------------------------------------------------

  async adminList(opts: { status: PayoutStatus; limit: number; before?: string }): Promise<AdminPayoutPage> {
    // Дараалал (REQUESTED): хамгийн удаан хүлээсэн нь эхэнд; түүх: шинэ нь эхэнд.
    const dir = opts.status === 'REQUESTED' ? 'asc' : 'desc';
    const rows = await this.prisma.payout.findMany({
      where: { status: opts.status },
      orderBy: [{ requestedAt: dir }, { id: dir }],
      take: opts.limit + 1,
      ...(opts.before ? { cursor: { id: opts.before }, skip: 1 } : {}),
      include: adminInclude,
    });
    const page = rows.slice(0, opts.limit);
    return { items: await this.toAdminViews(page), nextCursor: rows.length > opts.limit ? page[page.length - 1]!.id : null };
  }

  /** Нээлттэй хүсэлтүүдийн банкны мэдээлэл (CSV, Excel-д нээгдэхээр UTF-8 BOM). Export бүр audit-д. */
  async exportCsv(adminId: string, ip?: string): Promise<string> {
    const rows = await this.prisma.payout.findMany({
      where: { status: 'REQUESTED' },
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
      take: EXPORT_LIMIT,
      include: adminInclude,
    });
    const views = await this.toAdminViews(rows);
    await this.audit.record(this.prisma, {
      actorId: adminId,
      action: 'payout.export',
      targetType: 'payout',
      targetId: 'REQUESTED',
      after: { count: views.length, totalMnt: views.reduce((s, v) => s + v.amountMnt, 0), ids: views.map((v) => v.id) },
      ip,
    });
    return toCsv(
      ['Payout ID', 'Багш', 'Утас', 'Имэйл', 'Банк', 'Дансны дугаар', 'Данс эзэмшигч', 'Дүн (₮)', 'Хүсэлтийн огноо', 'Hold'],
      views.map((v) => [
        v.id,
        v.teacher.name ?? '',
        v.teacher.phone ?? '',
        v.teacher.email ?? '',
        v.bank,
        v.accountNumber,
        v.holderName,
        v.amountMnt,
        v.requestedAt,
        v.onHold ? 'HOLD' : '',
      ]),
    );
  }

  /** "Төлсөн": ledger-т PAYOUT (−дүн) + хүсэлт PAID. Давтвал idempotent. */
  async markPaid(id: string, adminId: string, input: { transferRef?: string }, ip?: string): Promise<AdminPayoutView> {
    const teacherId = await this.teacherOf(id);
    const changed = await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, teacherId);
      const p = await tx.payout.findUniqueOrThrow({ where: { id } });
      if (p.status === 'PAID') return null;
      if (p.status !== 'REQUESTED') throw E.notOpen();
      if (await tx.payoutHold.findUnique({ where: { teacherId } })) throw E.heldCannotPay();
      const balanceMnt = await this.earnings.balance(teacherId, tx);
      if (balanceMnt < p.amountMnt) throw E.exceedsBalance(balanceMnt);

      const entryId = await this.earnings.append(tx, {
        teacherId,
        type: 'PAYOUT',
        amountMnt: -p.amountMnt,
        actorId: adminId,
        refType: 'payout',
        refId: p.id,
        reason: input.transferRef ?? undefined,
      });
      const now = new Date();
      // Нөхцөлтэй шинэчлэлт — түгжээгээр аль хэдийн дараалсан ч хоёр дахь хамгаалалт.
      const { count } = await tx.payout.updateMany({
        where: { id, status: 'REQUESTED' },
        data: {
          status: 'PAID',
          processedAt: now,
          processedById: adminId,
          transferRef: input.transferRef ?? null,
          earningEntryId: entryId,
        },
      });
      if (count !== 1) throw E.notOpen();
      await this.audit.record(tx, {
        actorId: adminId,
        action: 'payout.paid',
        targetType: 'payout',
        targetId: id,
        before: { status: 'REQUESTED' },
        after: { status: 'PAID', amountMnt: p.amountMnt, earningEntryId: entryId, transferRef: input.transferRef ?? null },
        ip,
      });
      return p;
    }, TX);
    if (changed) {
      await this.notifySafe({
        userId: teacherId,
        type: 'PAYOUT_PAID',
        params: { amount: fmt(changed.amountMnt), account: maskTail(changed.accountNumber) },
        link: '/teacher/earnings',
      });
    }
    return this.adminOne(id);
  }

  /** Татгалзах: ledger-т бичилтгүй, түгжигдсэн дүн чөлөөлөгдөнө. Давтвал idempotent. */
  async reject(id: string, adminId: string, reason: string, ip?: string): Promise<AdminPayoutView> {
    const teacherId = await this.teacherOf(id);
    const changed = await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, teacherId);
      const p = await tx.payout.findUniqueOrThrow({ where: { id } });
      if (p.status === 'REJECTED') return null;
      if (p.status !== 'REQUESTED') throw E.notOpen();
      await tx.payout.update({
        where: { id },
        data: { status: 'REJECTED', processedAt: new Date(), processedById: adminId, rejectReason: reason },
      });
      await this.audit.record(tx, {
        actorId: adminId,
        action: 'payout.reject',
        targetType: 'payout',
        targetId: id,
        before: { status: 'REQUESTED' },
        after: { status: 'REJECTED', amountMnt: p.amountMnt, reason },
        ip,
      });
      return p;
    }, TX);
    if (changed) {
      await this.notifySafe({
        userId: teacherId,
        type: 'PAYOUT_REJECTED',
        params: { amount: fmt(changed.amountMnt), reason },
        link: '/teacher/earnings',
      });
    }
    return this.adminOne(id);
  }

  async holds(): Promise<PayoutHoldView[]> {
    const rows = await this.prisma.payoutHold.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { teacher: userContact, createdBy: { select: { id: true, name: true } } },
    });
    return rows.map((r) => ({
      teacher: contact(r.teacher),
      reason: r.reason,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Hold тавих (аль хэдийн байвал шалтгааныг шинэчилнэ). Багшид мэдэгдэхгүй — шалгалтын үед сэжиг төрүүлэхгүй. */
  async hold(teacherId: string, adminId: string, reason: string, ip?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, teacherId);
      if (!(await tx.user.findUnique({ where: { id: teacherId }, select: { id: true } }))) throw E.teacherNotFound();
      const before = await tx.payoutHold.findUnique({ where: { teacherId } });
      await tx.payoutHold.upsert({
        where: { teacherId },
        create: { teacherId, reason, createdById: adminId },
        update: { reason, createdById: adminId },
      });
      await this.audit.record(tx, {
        actorId: adminId,
        action: 'payout.hold',
        targetType: 'user',
        targetId: teacherId,
        before: before ? { reason: before.reason } : null,
        after: { reason },
        ip,
      });
    }, TX);
  }

  async release(teacherId: string, adminId: string, ip?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, teacherId);
      const before = await tx.payoutHold.findUnique({ where: { teacherId } });
      if (!before) return; // idempotent
      await tx.payoutHold.delete({ where: { teacherId } });
      await this.audit.record(tx, {
        actorId: adminId,
        action: 'payout.release',
        targetType: 'user',
        targetId: teacherId,
        before: { reason: before.reason },
        after: null,
        ip,
      });
    }, TX);
  }

  /**
   * Админы орлогын гар засвар (ticket 09/22): ledger-т `ADMIN_ADJUST` (тэмдэгтэй ₮), шалтгаан, audit.
   *
   * Payout-той уралдахгүйн тулд хүсэлт/төлөлттэй **ижил** багшийн мөрийн түгжээ дор ажиллана.
   * Хасалт нээлттэй хүсэлтийн түгжигдсэн дүнд хүрч болохгүй: `үлдэгдэл + дүн ≥ түгжигдсэн` (нээлттэй
   * хүсэлтгүй бол ≥ 0) — эс бөгөөс "төлсөн" үед үлдэгдэл хүрэлцэхгүй болно. Тийм хасалт хийх бол эхлээд
   * хүсэлтийг татгалзана. Idempotent: `ref_type = 'admin_adjust'`, `ref_id = idempotencyKey` (partial unique).
   */
  async adjustEarnings(input: {
    teacherId: string;
    amountMnt: number;
    reason: string;
    adminId: string;
    idempotencyKey?: string;
    ip?: string;
  }): Promise<EarningsAdjustResult> {
    if (!Number.isInteger(input.amountMnt) || input.amountMnt === 0) throw E.invalidAmount();
    const key = input.idempotencyKey ?? randomUUID();
    try {
      return await this.prisma.$transaction(async (tx): Promise<EarningsAdjustResult> => {
        await lockUser(tx, input.teacherId);
        if (!(await tx.user.findUnique({ where: { id: input.teacherId }, select: { id: true } }))) {
          throw E.teacherNotFound();
        }
        const open = await tx.payout.findFirst({ where: { teacherId: input.teacherId, status: 'REQUESTED' } });
        const lockedMnt = open?.amountMnt ?? 0;

        const prev = await tx.teacherEarningEntry.findFirst({ where: { refType: ADMIN_ADJUST_REF, refId: key } });
        if (prev) {
          if (prev.teacherId !== input.teacherId || prev.amountMnt !== input.amountMnt) throw E.idempotencyConflict();
          const balanceMnt = await this.earnings.balance(input.teacherId, tx);
          return { entryId: prev.id, balanceMnt, lockedMnt, replayed: true };
        }

        const before = await this.earnings.balance(input.teacherId, tx);
        const after = before + input.amountMnt;
        if (input.amountMnt < 0 && after < lockedMnt) throw E.adjustBelowLocked(before, lockedMnt);

        const entryId = await this.earnings.append(tx, {
          teacherId: input.teacherId,
          type: 'ADMIN_ADJUST',
          amountMnt: input.amountMnt,
          reason: input.reason,
          actorId: input.adminId,
          refType: ADMIN_ADJUST_REF,
          refId: key,
        });
        await this.audit.record(tx, {
          actorId: input.adminId,
          action: 'earnings.adjust',
          targetType: 'user',
          targetId: input.teacherId,
          before: { balanceMnt: before, lockedMnt },
          after: { balanceMnt: after, amountMnt: input.amountMnt, reason: input.reason, entryId, idempotencyKey: key },
          ip: input.ip,
        });
        return { entryId, balanceMnt: after, lockedMnt, replayed: false };
      }, TX);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw E.idempotencyConflict();
      throw err;
    }
  }

  // ---- дотоод ---------------------------------------------------------------

  private async teacherOf(id: string): Promise<string> {
    const p = await this.prisma.payout.findUnique({ where: { id }, select: { teacherId: true } });
    if (!p) throw E.notFound();
    return p.teacherId;
  }

  private async adminOne(id: string): Promise<AdminPayoutView> {
    const row = await this.prisma.payout.findUniqueOrThrow({ where: { id }, include: adminInclude });
    return (await this.toAdminViews([row]))[0]!;
  }

  private async toAdminViews(rows: AdminRow[]): Promise<AdminPayoutView[]> {
    const teacherIds = [...new Set(rows.map((r) => r.teacherId))];
    if (teacherIds.length === 0) return [];
    const [sums, holds] = await Promise.all([
      this.prisma.teacherEarningEntry.groupBy({
        by: ['teacherId'],
        where: { teacherId: { in: teacherIds }, isTest: false },
        _sum: { amountMnt: true },
      }),
      this.prisma.payoutHold.findMany({ where: { teacherId: { in: teacherIds } }, select: { teacherId: true } }),
    ]);
    const balance = new Map(sums.map((s) => [s.teacherId, s._sum.amountMnt ?? 0]));
    const held = new Set(holds.map((h) => h.teacherId));
    return rows.map((r) => ({
      ...toView(r),
      teacher: contact(r.teacher),
      teacherBalanceMnt: balance.get(r.teacherId) ?? 0,
      onHold: held.has(r.teacherId),
      processedBy: r.processedBy,
    }));
  }

  /** Мэдэгдэл commit-ийн дараа; алдаа гарвал үйлдэл хэвээр (log). */
  private async notifySafe(input: NotifyInput): Promise<void> {
    try {
      await this.notifications.notify(input);
    } catch (err) {
      this.log.error(`Payout мэдэгдэл илгээгдсэнгүй (${input.type}, ${input.userId}): ${(err as Error).message}`);
    }
  }
}

const adminInclude = {
  teacher: userContact,
  processedBy: { select: { id: true, name: true } },
} as const;

type AdminRow = Prisma.PayoutGetPayload<{ include: typeof adminInclude }>;

async function lockUser(tx: Tx, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR NO KEY UPDATE`;
}

export function blockReason(s: {
  onHold: boolean;
  open: boolean;
  bank: boolean;
  availableMnt: number;
  minimumMnt: number;
}): PayoutBlockReason | null {
  if (s.onHold) return 'ON_HOLD';
  if (s.open) return 'OPEN_REQUEST';
  if (!s.bank) return 'NO_BANK_ACCOUNT';
  if (s.availableMnt <= 0 || s.availableMnt < s.minimumMnt) return 'BELOW_MINIMUM';
  return null;
}

function toView(p: Payout): PayoutView {
  return {
    id: p.id,
    status: p.status,
    amountMnt: p.amountMnt,
    bank: p.bank as BankCode,
    accountNumber: p.accountNumber,
    holderName: p.holderName,
    requestedAt: p.requestedAt.toISOString(),
    processedAt: p.processedAt?.toISOString() ?? null,
    transferRef: p.transferRef,
    rejectReason: p.rejectReason,
  };
}

function contact(u: ContactRow): AdminPayoutView['teacher'] {
  return {
    id: u.id,
    name: u.teacherApplication?.displayName ?? u.name,
    phone: u.identifiers.find((i) => i.type === 'PHONE')?.value ?? null,
    email: u.identifiers.find((i) => i.type === 'EMAIL')?.value ?? null,
  };
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function maskTail(account: string): string {
  return `****${account.slice(-4)}`;
}
