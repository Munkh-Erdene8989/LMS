import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { MuxOrphan } from '@lms/db';
import { MUX, type MuxAdapter } from '../adapters/mux';
import { PrismaService } from '../prisma/prisma.service';
import { JOB_QUEUE, type JobQueue } from '../queue/job-queue';

export const MUX_ORPHAN_CLEANUP_JOB = 'mux.orphan-cleanup';
/** Цаг бүрийн 20 минутад (Улаанбаатар) */
export const MUX_ORPHAN_CLEANUP_CRON = '20 * * * *';
/** Нэг ажиллагаанд боловсруулах дээд тоо */
const BATCH = 100;
/** Ийм олон удаа бүтэлгүйтвэл (цаг тутам → ~1 өдөр) орхиж, log-д үлдээнэ */
export const MUX_ORPHAN_MAX_ATTEMPTS = 24;

export interface MuxOrphanCleanupResult {
  cleaned: number;
  failed: number;
  dropped: number;
}

/**
 * Ticket 10 үлдэгдэл: устгагдсан видеоны Mux asset-ийг цэвэрлэнэ.
 *
 * DRAFT lesson (эсвэл курс) бүрмөсөн устахад `lesson_videos` cascade-аар устдаг. DB trigger
 * (migration `20261117910000_polish`) тухайн мөрийн upload/asset id-г `mux_orphans`-д бичнэ — catalog модуль
 * media-г мэдэхгүй хэвээр. Энэ cron мөр бүрийг:
 * - asset id байвал устгана (Mux-д байхгүй/аль хэдийн устсан = амжилт);
 * - asset id алга бол upload-ын төлөвийг Mux-аас асууна: asset үүссэн бол түүнийг устгана, хүлээгдэж буй
 *   upload-ыг цуцална (дараа нь asset үүсэхгүй), бусад (errored/cancelled/timed_out) — хийх зүйлгүй;
 * - амжилттай бол мөрийг устгана; алдаа гарвал `attempts`/`last_error`-ийг өсгөөд дараагийн ажиллагаанд.
 * Mux-ийн бүх үйлдэл давтагдахад аюулгүй тул зэрэг/давтан ажиллавал асуудалгүй.
 */
@Injectable()
export class MuxOrphanCleanupService implements OnModuleInit {
  private readonly log = new Logger(MuxOrphanCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MUX) private readonly mux: MuxAdapter,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
  ) {}

  async onModuleInit(): Promise<void> {
    this.queue.register(MUX_ORPHAN_CLEANUP_JOB, async () => {
      await this.run();
    });
    await this.queue.schedule(MUX_ORPHAN_CLEANUP_JOB, MUX_ORPHAN_CLEANUP_CRON);
  }

  async run(): Promise<MuxOrphanCleanupResult> {
    const result: MuxOrphanCleanupResult = { cleaned: 0, failed: 0, dropped: 0 };
    // Mux тохируулаагүй (dev) — мөрүүд хадгалагдана, тохируулсны дараа цэвэрлэгдэнэ.
    if (!this.mux.enabled) return result;
    const rows = await this.prisma.muxOrphan.findMany({ orderBy: { createdAt: 'asc' }, take: BATCH });
    for (const row of rows) {
      try {
        await this.release(row);
        await this.prisma.muxOrphan.deleteMany({ where: { videoId: row.videoId } });
        result.cleaned += 1;
      } catch (err) {
        const message = (err as Error).message.slice(0, 500);
        if (row.attempts + 1 >= MUX_ORPHAN_MAX_ATTEMPTS) {
          this.log.error(`Mux orphan ${row.videoId} (asset ${row.muxAssetId ?? '-'}, upload ${row.muxUploadId}) орхив: ${message}`);
          await this.prisma.muxOrphan.deleteMany({ where: { videoId: row.videoId } });
          result.dropped += 1;
        } else {
          await this.prisma.muxOrphan.updateMany({
            where: { videoId: row.videoId },
            data: { attempts: { increment: 1 }, lastError: message },
          });
          result.failed += 1;
        }
      }
    }
    if (rows.length > 0) {
      this.log.log(`Mux orphan цэвэрлэгээ: ${result.cleaned} цэвэрлэв, ${result.failed} дахин оролдоно, ${result.dropped} орхив`);
    }
    return result;
  }

  private async release(row: MuxOrphan): Promise<void> {
    let assetId = row.muxAssetId;
    if (!assetId) {
      const upload = await this.mux.getUpload(row.muxUploadId);
      if (upload.assetId) assetId = upload.assetId;
      // Цуцлах ба asset үүсэх зэрэг болбол cancel алдаа шиднэ → дараагийн ажиллагаанд asset-ийг устгана.
      else if (upload.status === 'waiting') await this.mux.cancelUpload(row.muxUploadId);
    }
    if (assetId) await this.mux.deleteAsset(assetId);
  }
}
