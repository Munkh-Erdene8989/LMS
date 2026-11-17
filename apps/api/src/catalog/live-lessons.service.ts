import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Lesson } from '@lms/db';
import { formatUbDateTime, liveEndsAt, LIVE_REMINDERS, type LiveReminderKind } from '@lms/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { lessonOwnerIds } from '../purchases/entitlements';
import { JOB_QUEUE, type JobQueue } from '../queue/job-queue';
import type { LiveContent } from './lesson-types';

export const LIVE_REMINDER_JOB = 'live.reminder';
/** 3 оролдлого (1м, 2м) — claim-ийн өмнөх алдаанд (DB) л дахин оролдоно. */
export const LIVE_REMINDER_RETRY = { attempts: 3, backoffMs: 60_000 };

export interface LiveReminderJob {
  lessonId: string;
  kind: LiveReminderKind;
  /** Ажлыг товлох үеийн эхлэх цаг (ISO). Одоогийнхоос өөр бол ажил хуучирсан — юу ч хийхгүй. */
  startsAt: string;
}

const NOTIFICATION_TYPE: Record<LiveReminderKind, 'LIVE_REMINDER_H24' | 'LIVE_REMINDER_M15'> = {
  H24: 'LIVE_REMINDER_H24',
  M15: 'LIVE_REMINDER_M15',
};

/**
 * Ticket 14: live хичээлийн сануулга.
 *
 * - Товлолт: эхлэх цаг тогтоогдох/өөрчлөгдөх бүрт 24 цаг, 15 минутын өмнөх delayed ажил нэмнэ.
 *   `jobId` = lesson + төрөл + эхлэх цаг → ижил цагаар давтан товлоход давхардахгүй. Өнгөрсөн
 *   сануулгыг (жишээ нь 3 цагийн дараах live-д 24 цагийнх) товлохгүй.
 * - Дахин товлолт: дарааллаас ажил устгадаггүй; хуучин ажил ажиллахдаа `startsAt` нь одоогийнхтой
 *   таарахгүй тул юу ч хийхгүй (BullMQ, in-memory аль алинд ажиллана).
 * - Илгээлт: ажиллах мөчид lesson LIVE, APPROVED, архивлаагүй, курс PUBLISHED, live дуусаагүй байх
 *   ёстой. `live_reminders` (lesson, төрөл, эхлэх цаг) мөрийг "claim" хийсний дараа л илгээнэ →
 *   дээд тал нь нэг удаа. Хүлээн авагч: эзэмшигчид (lesson эсвэл бүтэн курс) + курсийн багш.
 */
@Injectable()
export class LiveLessonsService implements OnModuleInit {
  private readonly log = new Logger(LiveLessonsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
  ) {}

  onModuleInit(): void {
    this.queue.register<LiveReminderJob>(LIVE_REMINDER_JOB, (data) => this.sendReminder(data), LIVE_REMINDER_RETRY);
  }

  /**
   * Live-ийн хуваарь өөрчлөгдсөний дараа (`CourseAuthoringService.updateLesson`) дуудна:
   * сануулгуудыг шинэ цагаар товлож, нийтлэгдсэн lesson-ы цаг өөрчлөгдсөн бол эзэмшигчдэд мэдэгдэнэ.
   */
  async scheduleChanged(lesson: Pick<Lesson, 'id'>, before: LiveContent | null, after: LiveContent, now = new Date()): Promise<void> {
    if (!after.startsAt || after.startsAt === before?.startsAt) return;
    await this.scheduleReminders(lesson.id, after.startsAt, now);
    if (before?.startsAt) await this.notifyRescheduled(lesson.id, after);
  }

  async scheduleReminders(lessonId: string, startsAt: string, now = new Date()): Promise<void> {
    const start = new Date(startsAt).getTime();
    for (const r of LIVE_REMINDERS) {
      const delayMs = start - r.beforeMs - now.getTime();
      if (delayMs <= 0) continue;
      await this.queue.add<LiveReminderJob>(
        LIVE_REMINDER_JOB,
        { lessonId, kind: r.kind, startsAt },
        { jobId: `live-reminder-${lessonId}-${r.kind}-${start}`, delayMs },
      );
    }
  }

  /** Дарааллын ажил. */
  async sendReminder(job: LiveReminderJob, now = new Date()): Promise<void> {
    const lesson = await this.liveLesson(job.lessonId);
    if (!lesson) return;
    const c = lesson.content as unknown as LiveContent;
    if (!c.startsAt || c.startsAt !== job.startsAt || !c.durationMinutes) return; // хуучирсан ажил
    if (now.getTime() >= new Date(liveEndsAt(c.startsAt, c.durationMinutes)).getTime()) return;

    const claimed = await this.prisma.liveReminder.createMany({
      data: [{ lessonId: lesson.id, kind: job.kind, startsAt: new Date(c.startsAt) }],
      skipDuplicates: true,
    });
    if (claimed.count === 0) return;

    const recipients = [...new Set([...(await lessonOwnerIds(this.prisma, lesson)), lesson.course.teacherId])];
    await this.notifyAll(recipients, {
      type: NOTIFICATION_TYPE[job.kind],
      params: this.params(lesson, c),
      link: lessonLink(lesson),
    });
  }

  private async notifyRescheduled(lessonId: string, after: LiveContent): Promise<void> {
    const lesson = await this.liveLesson(lessonId);
    if (!lesson) return;
    const owners = await lessonOwnerIds(this.prisma, lesson);
    await this.notifyAll(owners, { type: 'LIVE_RESCHEDULED', params: this.params(lesson, after), link: lessonLink(lesson) });
  }

  /** Нийтэд харагдах, идэвхтэй live lesson (үгүй бол null — сануулга, мэдэгдэл илгээхгүй). */
  private async liveLesson(id: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: { course: { select: { id: true, title: true, teacherId: true, status: true } } },
    });
    if (!lesson || lesson.type !== 'LIVE' || lesson.archivedAt || lesson.reviewStatus !== 'APPROVED') return null;
    if (lesson.course.status !== 'PUBLISHED') return null;
    return lesson;
  }

  private params(lesson: { title: string; course: { title: string } }, c: LiveContent) {
    return {
      title: lesson.title,
      course: lesson.course.title,
      startsAt: c.startsAt ? formatUbDateTime(c.startsAt) : '',
      duration: c.durationMinutes ?? 0,
    };
  }

  /** Нэг хэрэглэгчийн алдаа бусдыг зогсоохгүй (claim хийсний дараа дахин оролдохгүй). */
  private async notifyAll(
    userIds: string[],
    n: { type: 'LIVE_REMINDER_H24' | 'LIVE_REMINDER_M15' | 'LIVE_RESCHEDULED'; params: Record<string, string | number>; link: string },
  ): Promise<void> {
    for (const userId of userIds) {
      try {
        await this.notifications.notify({ userId, ...n });
      } catch (err) {
        this.log.error(`Live мэдэгдэл (${n.type}) ${userId}-д илгээгдсэнгүй: ${(err as Error).message}`);
      }
    }
  }
}

function lessonLink(lesson: { id: string; course: { id: string } }): string {
  return `/courses/${lesson.course.id}/lessons/${lesson.id}`;
}
