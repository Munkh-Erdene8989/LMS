import { Inject, Injectable, Logger, Module, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JOB_QUEUE, type JobQueue } from '../queue/job-queue';

export const CLEANUP_JOB = 'maintenance.cleanup';
/** Өдөр бүр 03:30 (Улаанбаатар) */
export const CLEANUP_CRON = '30 3 * * *';
const DAY = 24 * 60 * 60_000;

/** Cron ажлын жишээ: хуучирсан OTP болон session-уудыг цэвэрлэнэ. */
@Injectable()
export class MaintenanceService implements OnModuleInit {
  private readonly log = new Logger(MaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
  ) {}

  async onModuleInit(): Promise<void> {
    this.queue.register(CLEANUP_JOB, () => this.cleanup());
    await this.queue.schedule(CLEANUP_JOB, CLEANUP_CRON);
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    // OTP: 1 хоногоос хуучин (rate limit 1 цагийн цонхтой тул хангалттай).
    const otp = await this.prisma.otpChallenge.deleteMany({ where: { createdAt: { lt: new Date(now - DAY) } } });
    // Session: хугацаа нь дууссан, эсвэл 30+ хоногийн өмнө хүчингүй болсон.
    const sessions = await this.prisma.session.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date(now) } }, { revokedAt: { lt: new Date(now - 30 * DAY) } }],
      },
    });
    this.log.log(`Цэвэрлэгээ: OTP ${otp.count}, session ${sessions.count}`);
  }
}

@Module({ providers: [MaintenanceService] })
export class MaintenanceModule {}
