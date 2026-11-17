import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { JOB_QUEUE, QUEUE_TIMEZONE, type JobQueue } from '../queue/job-queue';
import { CreditsService } from './credits.service';

export const CREDIT_EXPIRY_JOB = 'credits.expiry';
/** Өдөр бүр 00:10 (Улаанбаатар) — шөнө дунд дууссан lot-ууд өглөө гэхэд хасагдсан байна. */
export const CREDIT_EXPIRY_CRON = '10 0 * * *';
/** Хугацаа дуусахаас өмнөх сануулгууд (хоног). Бага нь эхэлж боловсруулагдана. */
export const CREDIT_REMINDER_DAYS = [7, 30] as const;

const DAY = 24 * 60 * 60_000;
const BATCH = 500;

type ReminderDays = (typeof CREDIT_REMINDER_DAYS)[number];

export interface CreditExpiryRunResult {
  /** Энэ ажил дуусгасан lot-ын тоо */
  expiredLots: number;
  /** Сануулга тэмдэглэсэн lot-ын тоо (босго тус бүрээр) */
  remindedLots: Record<ReminderDays, number>;
  /** Илгээсэн мэдэгдлийн тоо (хэрэглэгч бүрт нэг ажилд дээд тал нь нэг сануулга + нэг дуусгаврын) */
  notifications: number;
}

interface ClaimedLot {
  userId: string;
  remaining: number;
  expiresAt: Date;
}

/**
 * Ticket 16: кредитийн хугацаа дуусалт.
 *
 * 1. Дуусгавар — `CreditsService.expireDueLots()`-ийг batch-аар хоосортол дуудна (idempotent:
 *    `expiredAt`, хэрэглэгчийн түгжээ). Энэ ажил дуусгасан lot-уудаар хэрэглэгч бүрт нэг мэдэгдэл.
 * 2. Сануулга — дуусахаас 30 / 7 хоногийн өмнө. Lot бүрийн босго бүр `remind{30,7}SentAt`-аар
 *    нэг л удаа "claim" хийгдэнэ (нөхцөлт `updateMany`, мөр бүр тусдаа → зэрэг ажилд нэг л
 *    ажил авна, `spend()`-ийн түгжээтэй deadlock үүсэхгүй). Нэг ажилд хэрэглэгч бүрт нэг
 *    мэдэгдэл: нийт кредит + хамгийн эрт дуусах огноо.
 *
 * Мэдэгдэл claim/дуусгаврын дараа илгээгдэнэ → дээд тал нь нэг удаа (process унавал алдагдаж
 * болох ч давхардахгүй).
 */
@Injectable()
export class CreditExpiryService implements OnModuleInit {
  private readonly log = new Logger(CreditExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly notifications: NotificationsService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
  ) {}

  async onModuleInit(): Promise<void> {
    this.queue.register(CREDIT_EXPIRY_JOB, async () => {
      await this.run();
    });
    await this.queue.schedule(CREDIT_EXPIRY_JOB, CREDIT_EXPIRY_CRON);
  }

  async run(now = new Date()): Promise<CreditExpiryRunResult> {
    const expired = await this.expire(now);
    const reminded = await this.remind(now);
    const notifications = expired.notified + reminded.notified;
    this.log.log(
      `Кредит дуусгавар: ${expired.lots} lot дууссан, сануулга 7х=${reminded.lots[7]} 30х=${reminded.lots[30]}, мэдэгдэл ${notifications}`,
    );
    return { expiredLots: expired.lots, remindedLots: reminded.lots, notifications };
  }

  private async expire(now: Date): Promise<{ lots: number; notified: number }> {
    const byUser = new Map<string, number>();
    let lots = 0;
    // Batch бүр хоосон болтол. Зэрэг ажил lot-ыг түрүүлж дуусгавал энэ ажилд 0 буцаж зогсоно.
    for (;;) {
      const batch = await this.credits.expireDueLots(now, BATCH);
      if (batch.length === 0) break;
      lots += batch.length;
      for (const l of batch) byUser.set(l.userId, (byUser.get(l.userId) ?? 0) + l.credits);
    }
    let notified = 0;
    for (const [userId, credits] of byUser) {
      if (await this.safeNotify(userId, 'CREDITS_EXPIRED', { credits })) notified++;
    }
    return { lots, notified };
  }

  private async remind(now: Date): Promise<{ lots: Record<ReminderDays, number>; notified: number }> {
    const claimed: ClaimedLot[] = [];
    const lots = { 7: 0, 30: 0 } as Record<ReminderDays, number>;
    for (const days of CREDIT_REMINDER_DAYS) {
      const mine = await this.claimReminders(days, now);
      lots[days] = mine.length;
      claimed.push(...mine);
    }

    const byUser = new Map<string, { credits: number; earliest: Date }>();
    for (const l of claimed) {
      const agg = byUser.get(l.userId);
      if (!agg) byUser.set(l.userId, { credits: l.remaining, earliest: l.expiresAt });
      else {
        agg.credits += l.remaining;
        if (l.expiresAt < agg.earliest) agg.earliest = l.expiresAt;
      }
    }
    let notified = 0;
    for (const [userId, { credits, earliest }] of byUser) {
      const params = {
        credits,
        expiresAt: earliest.toLocaleDateString('sv-SE', { timeZone: QUEUE_TIMEZONE }),
        days: Math.max(1, Math.ceil((earliest.getTime() - now.getTime()) / DAY)),
      };
      if (await this.safeNotify(userId, 'CREDITS_EXPIRING', params)) notified++;
    }
    return { lots, notified };
  }

  /**
   * `days` хоногийн дотор дуусах, үлдэгдэлтэй, сануулаагүй lot-уудыг энэ ажилд claim хийнэ.
   * 7 хоногийн сануулга авсан lot 30 хоногийнхыг дахин авахгүй (хоёуланг нь тэмдэглэнэ).
   */
  private async claimReminders(days: ReminderDays, now: Date): Promise<ClaimedLot[]> {
    // 7 хоногийнхыг авсан lot 30 хоногийнхыг хэзээ ч авахгүй (зэрэг ажилд ч).
    const notSent = days === 7 ? { remind7SentAt: null } : { remind30SentAt: null, remind7SentAt: null };
    const until = new Date(now.getTime() + days * DAY);
    const claimed: ClaimedLot[] = [];
    for (;;) {
      const candidates = await this.prisma.creditLot.findMany({
        where: { expiredAt: null, remaining: { gt: 0 }, expiresAt: { gt: now, lte: until }, ...notSent },
        orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
        take: BATCH,
        select: { id: true, userId: true, remaining: true, expiresAt: true, remind30SentAt: true },
      });
      for (const lot of candidates) {
        const { count } = await this.prisma.creditLot.updateMany({
          where: { id: lot.id, ...notSent },
          data: days === 7 ? { remind7SentAt: now } : { remind30SentAt: now },
        });
        if (count !== 1) continue;
        if (days === 7 && !lot.remind30SentAt) {
          // 30 хоногийнх хоцорч (жишээ нь богино хугацаатай lot) амжаагүй бол дахин илгээхгүй.
          await this.prisma.creditLot.updateMany({
            where: { id: lot.id, remind30SentAt: null },
            data: { remind30SentAt: now },
          });
        }
        claimed.push({ userId: lot.userId, remaining: lot.remaining, expiresAt: lot.expiresAt });
      }
      // Claim хийгдсэн (энэ эсвэл зэрэг ажилд) lot дахин сонгогдохгүй тул давталт дуусна.
      if (candidates.length < BATCH) break;
    }
    return claimed;
  }

  private async safeNotify(
    userId: string,
    type: 'CREDITS_EXPIRED' | 'CREDITS_EXPIRING',
    params: Record<string, string | number>,
  ): Promise<boolean> {
    try {
      await this.notifications.notify({ userId, type, params, link: '/credits' });
      return true;
    } catch (err) {
      // Нэг хэрэглэгчийн алдаа бусдын мэдэгдлийг зогсоохгүй.
      this.log.error(`Кредитийн мэдэгдэл (${type}, ${userId}) амжилтгүй: ${(err as Error).message}`);
      return false;
    }
  }
}
