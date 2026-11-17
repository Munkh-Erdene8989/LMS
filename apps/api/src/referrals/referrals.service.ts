import { randomInt } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, type PurchaseAttribution } from '@lms/db';
import type { ReferralLinkView } from '@lms/shared';
import { SettingsService } from '../admin/settings.service';
import { ENV, type Env } from '../env';
import { PrismaService } from '../prisma/prisma.service';
import type { Db } from '../purchases/entitlements';
import { decodeReferralCookie } from './cookie';
import { ReferralErrors as E } from './errors';

type Tx = Prisma.TransactionClient;

const DAY_MS = 86_400_000;
/** Андуурагдах тэмдэгтгүй (0/o, 1/l/i) */
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 8;

/** Худалдан авалтын attribution (шимтгэлийн хувийг тодорхойлно). */
export interface Attribution {
  source: PurchaseAttribution;
  /** REFERRAL үед урьсан багш (= курсийн багш) */
  referrerId: string | null;
}

/**
 * Referral (ticket 11). Багш бүрт нэг тогтмол код (`/r/<code>`). Линкээр орсныг:
 * - нэвтэрсэн бол шууд `referral_attributions`-д (хэрэглэгч, багш) хосоор;
 * - зочин бол гарын үсэгтэй cookie-д (`lms_ref`) — нэвтрэх, худалдан авах үед DB-д шилжүүлнэ.
 * Худалдан авалтын мөчид курсийн багштай хосын `lastSeenAt` нь `referralWindowDays` дотор бол REFERRAL.
 * Өөр багшийн линкээр орсон нь хамаарахгүй — attribution зөвхөн тухайн багшийн курст.
 */
@Injectable()
export class ReferralsService {
  private readonly log = new Logger(ReferralsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Багшийн линк (анх дуудахад код үүснэ) + тохиргоо + товч статистик. */
  async myLink(teacherId: string, now = new Date()): Promise<ReferralLinkView> {
    const code = await this.ensureCode(teacherId);
    const [windowDays, commissionReferralPercent, commissionPlatformPercent] = await Promise.all([
      this.settings.get('referralWindowDays'),
      this.settings.get('commissionReferralPercent'),
      this.settings.get('commissionPlatformPercent'),
    ]);
    const since = new Date(now.getTime() - windowDays * DAY_MS);
    const [learners, activeLearners, sales] = await Promise.all([
      this.prisma.referralAttribution.count({ where: { teacherId } }),
      this.prisma.referralAttribution.count({ where: { teacherId, lastSeenAt: { gte: since } } }),
      this.prisma.purchase.groupBy({
        by: ['attribution'],
        where: { teacherId, isTest: false },
        _count: { _all: true },
      }),
    ]);
    const salesOf = (a: PurchaseAttribution) => sales.find((s) => s.attribution === a)?._count._all ?? 0;
    return {
      code,
      path: `/r/${code}`,
      windowDays,
      commissionReferralPercent,
      commissionPlatformPercent,
      stats: { learners, activeLearners, referralSales: salesOf('REFERRAL'), platformSales: salesOf('PLATFORM') },
    };
  }

  /**
   * Линкээр орсон. Код хүчинтэй (эзэн нь TEACHER эрхтэй) бол багшийн id; нэвтэрсэн хэрэглэгч бол DB-д
   * бичнэ (өөрийн линк бол бичихгүй). Cookie-г controller тавина.
   */
  async visit(
    code: string,
    viewerId: string | null,
    now = new Date(),
  ): Promise<{ teacherId: string; windowDays: number }> {
    const row = await this.prisma.referralCode.findUnique({
      where: { code: code.toLowerCase() },
      select: { teacherId: true, teacher: { select: { roles: true } } },
    });
    if (!row || !row.teacher.roles.includes('TEACHER')) throw E.notFound();
    if (viewerId) await this.record(this.prisma, viewerId, row.teacherId, now);
    return { teacherId: row.teacherId, windowDays: await this.settings.get('referralWindowDays') };
  }

  /** Зочин байхдаа авсан cookie-г нэвтэрсэн хэрэглэгчид шилжүүлнэ. Хуурамч/хоосон cookie-г үл тооно. */
  async claimCookie(db: Db, userId: string, cookie: string | undefined, now = new Date()): Promise<void> {
    const decoded = decodeReferralCookie(this.env.JWT_SECRET, cookie, now);
    if (!decoded) return;
    const code = await db.referralCode.findUnique({
      where: { teacherId: decoded.teacherId },
      select: { teacherId: true },
    });
    if (!code) return;
    await this.record(db, userId, decoded.teacherId, decoded.visitedAt);
  }

  /** Нэвтрэлтийн дараа — алдаа гарвал нэвтрэлтэд нөлөөлөхгүй (log). */
  async claimCookieSafe(userId: string, cookie: string | undefined): Promise<void> {
    if (!cookie) return;
    try {
      await this.claimCookie(this.prisma, userId, cookie);
    } catch (err) {
      this.log.error(`Referral cookie шилжүүлэлт бүтэлгүйтэв (${userId}): ${String(err)}`);
    }
  }

  /** Худалдан авалтын transaction дотор: курсийн багштай хосын attribution хугацаандаа эсэх. */
  async attribution(tx: Tx, userId: string, teacherId: string, now: Date): Promise<Attribution> {
    const windowDays = await this.settings.get('referralWindowDays', tx);
    const hit = await tx.referralAttribution.findFirst({
      where: { userId, teacherId, lastSeenAt: { gte: new Date(now.getTime() - windowDays * DAY_MS) } },
      select: { id: true },
    });
    return hit ? { source: 'REFERRAL', referrerId: teacherId } : { source: 'PLATFORM', referrerId: null };
  }

  // ---------------------------------------------------------------------------

  /**
   * (хэрэглэгч, багш) мөрийг үүсгэх/шинэчлэх: `firstSeenAt` = хамгийн эрт, `lastSeenAt` = хамгийн сүүлд.
   * `skipDuplicates` (ON CONFLICT DO NOTHING) — зэрэг бичилт transaction-ийг (P2002-оор) унагахгүй.
   */
  private async record(db: Db, userId: string, teacherId: string, seenAt: Date): Promise<void> {
    if (userId === teacherId) return;
    const pair = { userId, teacherId };
    await db.referralAttribution.createMany({
      data: [{ ...pair, firstSeenAt: seenAt, lastSeenAt: seenAt }],
      skipDuplicates: true,
    });
    await db.referralAttribution.updateMany({
      where: { ...pair, lastSeenAt: { lt: seenAt } },
      data: { lastSeenAt: seenAt },
    });
    await db.referralAttribution.updateMany({
      where: { ...pair, firstSeenAt: { gt: seenAt } },
      data: { firstSeenAt: seenAt },
    });
  }

  private async ensureCode(teacherId: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await this.prisma.referralCode.findUnique({ where: { teacherId } });
      if (existing) return existing.code;
      try {
        return (await this.prisma.referralCode.create({ data: { teacherId, code: randomCode() } })).code;
      } catch (err) {
        // Код давхцсан эсвэл зэрэг хүсэлт аль хэдийн үүсгэсэн — дахин уншина.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      }
    }
    throw new Error('Referral код үүсгэж чадсангүй');
  }
}

function randomCode(): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}
