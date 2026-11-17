import { Injectable } from '@nestjs/common';
import type { Prisma } from '@lms/db';
import type { AdminUserDetail, AdminUserPage, AdminUserRow } from '@lms/shared';
import { AuditService } from '../admin/audit.service';
import { CreditsService } from '../credits/credits.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeacherEarningsService } from '../purchases/earnings.service';
import { contactSelect, toContact, toPaymentRow } from './contact';
import { AdminOpsErrors as E } from './errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECENT = 20;

const rowSelect = {
  ...contactSelect,
  roles: true,
  blockedAt: true,
  blockedReason: true,
  createdAt: true,
} as const;

type Row = Prisma.UserGetPayload<{ select: typeof rowSelect }>;

/**
 * Админы хэрэглэгчийн удирдлага (ticket 22): хайх, дэлгэрэнгүй, хаах/нээх.
 * Кредитийн засвар → `CreditsService.adjust`, орлогын засвар → `PayoutsService.adjustEarnings`
 * (тэдгээрийн түгжээ, ledger-ийн дүрмийг давхардуулахгүй).
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly earnings: TeacherEarningsService,
    private readonly audit: AuditService,
  ) {}

  /** Утас, имэйл (хэсэгчлэн), нэр, эсвэл id-аар. Хоосон бол хамгийн сүүлд бүртгүүлсэн. */
  async search(opts: { q?: string; limit: number; before?: string }): Promise<AdminUserPage> {
    const rows = await this.prisma.user.findMany({
      where: searchWhere(opts.q),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
      ...(opts.before ? { cursor: { id: opts.before }, skip: 1 } : {}),
      select: rowSelect,
    });
    const page = rows.slice(0, opts.limit);
    const balances = await this.balances(page.map((r) => r.id));
    return {
      items: page.map((r) => toRow(r, balances.get(r.id) ?? 0)),
      nextCursor: rows.length > opts.limit ? page[page.length - 1]!.id : null,
    };
  }

  async detail(id: string): Promise<AdminUserDetail> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: rowSelect });
    if (!user) throw E.userNotFound();
    const [credits, ledger, purchases, payments, subscription, earningSums, earningRecent, open, hold] =
      await Promise.all([
        this.credits.view(id),
        this.prisma.creditLedgerEntry.findMany({
          where: { userId: id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: RECENT,
        }),
        this.prisma.purchase.findMany({
          where: { userId: id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: RECENT,
          include: { course: { select: { title: true } }, lesson: { select: { title: true } } },
        }),
        this.prisma.payment.findMany({ where: { userId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: RECENT }),
        this.prisma.subscription.findUnique({ where: { userId: id }, include: { plan: { select: { name: true } } } }),
        this.prisma.teacherEarningEntry.groupBy({ by: ['isTest'], where: { teacherId: id }, _sum: { amountMnt: true } }),
        this.prisma.teacherEarningEntry.findMany({
          where: { teacherId: id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: RECENT,
        }),
        this.prisma.payout.findFirst({ where: { teacherId: id, status: 'REQUESTED' }, select: { amountMnt: true } }),
        this.prisma.payoutHold.findUnique({ where: { teacherId: id }, select: { teacherId: true } }),
      ]);

    const actorIds = [...new Set(ledger.map((l) => l.actorId).filter((a): a is string => a !== null))];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      : [];
    const actorById = new Map(actors.map((a) => [a.id, a]));
    const sum = (isTest: boolean) => earningSums.find((s) => s.isTest === isTest)?._sum.amountMnt ?? 0;
    const isEarner = user.roles.includes('TEACHER') || earningRecent.length > 0;

    return {
      ...toRow(user, credits.balance),
      blockedReason: user.blockedReason,
      credits,
      ledger: ledger.map((l) => ({
        id: l.id,
        type: l.type,
        amount: l.amount,
        reason: l.reason,
        refType: l.refType,
        refId: l.refId,
        isTest: l.isTest,
        actor: l.actorId ? (actorById.get(l.actorId) ?? { id: l.actorId, name: null }) : null,
        createdAt: l.createdAt.toISOString(),
      })),
      purchases: purchases.map((p) => ({
        id: p.id,
        kind: p.kind,
        courseTitle: p.course.title,
        lessonTitle: p.lesson?.title ?? null,
        credits: p.credits,
        isTest: p.isTest,
        createdAt: p.createdAt.toISOString(),
      })),
      payments: payments.map(toPaymentRow),
      subscription: subscription
        ? {
            status: subscription.status,
            planName: subscription.plan.name,
            currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
          }
        : null,
      earnings: isEarner
        ? {
            balanceMnt: sum(false),
            lockedMnt: open?.amountMnt ?? 0,
            testBalanceMnt: sum(true),
            onHold: hold !== null,
            recent: earningRecent.map((e) => ({
              id: e.id,
              type: e.type,
              amountMnt: e.amountMnt,
              reason: e.reason,
              isTest: e.isTest,
              createdAt: e.createdAt.toISOString(),
            })),
          }
        : null,
    };
  }

  /**
   * Хаах: `blockedAt` + бүх refresh session хүчингүй + `tokenVersion` нэмэх (одоо байгаа access token
   * шууд 401) — нэг transaction-д, audit-тай. Дараа нь AuthGuard 403 `ACCOUNT_BLOCKED`, OTP нэвтрэлт,
   * refresh татгалзана. Аль хэдийн хаагдсан бол шалтгааныг л шинэчилнэ (idempotent).
   */
  async block(id: string, reason: string, adminId: string, ip?: string): Promise<AdminUserDetail> {
    if (id === adminId) throw E.cannotBlockSelf();
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id }, select: { blockedAt: true, blockedReason: true } });
      if (!before) throw E.userNotFound();
      if (before.blockedAt && before.blockedReason === reason) return;
      const now = new Date();
      await tx.user.update({
        where: { id },
        data: {
          blockedAt: before.blockedAt ?? now,
          blockedReason: reason,
          ...(before.blockedAt ? {} : { tokenVersion: { increment: 1 } }),
        },
      });
      if (!before.blockedAt) {
        await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now } });
      }
      await this.audit.record(tx, {
        actorId: adminId,
        action: 'user.block',
        targetType: 'user',
        targetId: id,
        before: { blockedAt: before.blockedAt?.toISOString() ?? null, reason: before.blockedReason },
        after: { blockedAt: (before.blockedAt ?? now).toISOString(), reason },
        ip,
      });
    });
    return this.detail(id);
  }

  /** Нээх. Хэрэглэгч дахин OTP-оор нэвтэрнэ (хуучин session-ууд сэргэхгүй). Idempotent. */
  async unblock(id: string, reason: string, adminId: string, ip?: string): Promise<AdminUserDetail> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id }, select: { blockedAt: true, blockedReason: true } });
      if (!before) throw E.userNotFound();
      if (!before.blockedAt) return;
      await tx.user.update({ where: { id }, data: { blockedAt: null, blockedReason: null } });
      await this.audit.record(tx, {
        actorId: adminId,
        action: 'user.unblock',
        targetType: 'user',
        targetId: id,
        before: { blockedAt: before.blockedAt.toISOString(), reason: before.blockedReason },
        after: { blockedAt: null, reason },
        ip,
      });
    });
    return this.detail(id);
  }

  private async balances(userIds: string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const sums = await this.prisma.creditLot.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, remaining: { gt: 0 }, expiresAt: { gt: new Date() } },
      _sum: { remaining: true },
    });
    return new Map(sums.map((s) => [s.userId, s._sum.remaining ?? 0]));
  }
}

function searchWhere(raw: string | undefined): Prisma.UserWhereInput {
  const q = raw?.trim();
  if (!q) return {};
  const or: Prisma.UserWhereInput[] = [
    { name: { contains: q, mode: 'insensitive' } },
    { identifiers: { some: { value: { contains: q.toLowerCase() } } } },
  ];
  // Утасны хэсэг: зай, зураас, +976-гүй бичсэн ч олно.
  const digits = q.replace(/\D/g, '');
  if (digits.length >= 4 && digits !== q) or.push({ identifiers: { some: { type: 'PHONE', value: { contains: digits } } } });
  if (UUID_RE.test(q)) or.push({ id: q.toLowerCase() });
  return { OR: or };
}

function toRow(u: Row, creditBalance: number): AdminUserRow {
  return {
    ...toContact(u),
    roles: u.roles,
    creditBalance,
    blockedAt: u.blockedAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}
