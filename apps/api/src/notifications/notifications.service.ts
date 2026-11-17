import { Inject, Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import type { Notification } from '@lms/db';
import { NOTIFICATION_CATEGORIES, type NotificationCategory, type NotificationItem, type NotificationPage, type NotificationPreferenceView } from '@lms/shared';
import { EMAIL_SENDER, type EmailSender } from '../adapters/email';
import { ENV, type Env } from '../env';
import { PrismaService } from '../prisma/prisma.service';
import { JOB_QUEUE, type JobQueue } from '../queue/job-queue';
import { categoryOf } from './categories';
import { renderEmail, renderNotification, type NotificationType } from './render';

export const NOTIFICATION_EMAIL_JOB = 'notification.email';
/** Нийт 5 оролдлого: 30с, 1м, 2м, 4м-ийн зайтай. */
export const NOTIFICATION_EMAIL_RETRY = { attempts: 5, backoffMs: 30_000 };

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  params?: Record<string, string | number>;
  /** Web доторх зам, жишээ нь `/me` */
  link?: string;
}

/**
 * Мэдэгдлийн цорын ганц нэвтрэх цэг: in-app бичлэг үүсгэж, хэрэглэгч баталгаажсан
 * имэйлтэй бол имэйлийн ажлыг дараалалд нэмнэ. Утсаар л бүртгэлтэй бол зөвхөн in-app.
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly log = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.queue.register<{ notificationId: string }>(
      NOTIFICATION_EMAIL_JOB,
      (data, ctx) => this.sendEmail(data.notificationId, ctx.attempt, ctx.maxAttempts),
      NOTIFICATION_EMAIL_RETRY,
    );
  }

  async notify(input: NotifyInput): Promise<Notification> {
    // Имэйл: баталгаажсан имэйлтэй БӨГӨӨД хэрэглэгч энэ ангиллын имэйлийг унтраагаагүй. In-app үргэлж үүснэ.
    const category = categoryOf(input.type);
    const [emailCount, muted] = await Promise.all([
      this.prisma.identifier.count({ where: { userId: input.userId, type: 'EMAIL' } }),
      category
        ? this.prisma.notificationPreference.count({ where: { userId: input.userId, category, emailEnabled: false } })
        : Promise.resolve(0),
    ]);
    const hasEmail = emailCount > 0 && muted === 0;
    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        params: input.params ?? {},
        link: input.link ?? null,
        emailStatus: hasEmail ? 'QUEUED' : 'NONE',
      },
    });
    if (hasEmail) {
      await this.queue.add(
        NOTIFICATION_EMAIL_JOB,
        { notificationId: notification.id },
        { jobId: `notification-email-${notification.id}` },
      );
    }
    return notification;
  }

  async list(userId: string, opts: { limit: number; before?: string }): Promise<NotificationPage> {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
      ...(opts.before ? { cursor: { id: opts.before }, skip: 1 } : {}),
    });
    const page = rows.slice(0, opts.limit);
    return {
      items: page.map(toItem),
      nextCursor: rows.length > opts.limit ? page[page.length - 1]!.id : null,
    };
  }

  /** Бүх ангилал, мөр байхгүй бол идэвхтэй. */
  async preferences(userId: string): Promise<NotificationPreferenceView[]> {
    const rows = await this.prisma.notificationPreference.findMany({ where: { userId } });
    const byCategory = new Map(rows.map((r) => [r.category, r.emailEnabled]));
    return NOTIFICATION_CATEGORIES.map((category) => ({ category, emailEnabled: byCategory.get(category) ?? true }));
  }

  async setPreference(userId: string, category: NotificationCategory, emailEnabled: boolean): Promise<NotificationPreferenceView> {
    await this.prisma.notificationPreference.upsert({
      where: { userId_category: { userId, category } },
      create: { userId, category, emailEnabled },
      update: { emailEnabled },
    });
    return { category, emailEnabled };
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    if (count === 0) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Мэдэгдэл олдсонгүй.' });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  }

  /** Дарааллын ажил. Алдаа шидвэл дараалал дахин оролдоно. */
  private async sendEmail(notificationId: string, attempt: number, maxAttempts: number): Promise<void> {
    const n = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!n || n.emailStatus === 'SENT') return;

    const email = await this.prisma.identifier.findFirst({ where: { userId: n.userId, type: 'EMAIL' } });
    if (!email) {
      await this.prisma.notification.update({ where: { id: n.id }, data: { emailStatus: 'NONE' } });
      return;
    }

    const linkUrl = n.link ? new URL(n.link, this.env.PUBLIC_WEB_URL).toString() : null;
    const message = renderEmail(renderNotification(n.type, n.params), linkUrl);
    try {
      await this.email.send({ to: email.value, ...message });
    } catch (err) {
      if (attempt >= maxAttempts) {
        await this.prisma.notification.update({ where: { id: n.id }, data: { emailStatus: 'FAILED' } });
        this.log.error(`Имэйл бүрмөсөн амжилтгүй (${n.id}): ${(err as Error).message}`);
      }
      throw err;
    }
    await this.prisma.notification.update({
      where: { id: n.id },
      data: { emailStatus: 'SENT', emailSentAt: new Date() },
    });
  }
}

function toItem(n: Notification): NotificationItem {
  const r = renderNotification(n.type, n.params);
  return {
    id: n.id,
    type: n.type,
    title: r.title,
    body: r.body,
    link: n.link,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}
