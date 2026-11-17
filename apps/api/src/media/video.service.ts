import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Prisma, type LessonVideo } from '@lms/db';
import { videoUploadAllowed, type CourseDetail, type VideoUploadTicket } from '@lms/shared';
import {
  assetStateFrom,
  MUX,
  MuxNotConfiguredError,
  MuxSignatureError,
  uploadStateFrom,
  type MuxAdapter,
  type MuxAssetState,
  type MuxUploadState,
} from '../adapters/mux';
import { CourseAuthoringService } from '../catalog/course-authoring.service';
import { CatalogErrors } from '../catalog/errors';
import type { VideoContent } from '../catalog/lesson-types';
import { ENV, type Env } from '../env';
import { PrismaService } from '../prisma/prisma.service';
import { JOB_QUEUE, type JobQueue } from '../queue/job-queue';
import { MediaErrors as E } from './errors';

export const MUX_WEBHOOK_JOB = 'mux.webhook';
export const MUX_DELETE_ASSET_JOB = 'mux.delete-asset';
/** DB/Mux түр алдаанд: 5 оролдлого (10с, 20с, 40с, 80с) */
const MUX_JOB_RETRY = { attempts: 5, backoffMs: 10_000 };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ticket 10: багшийн видео upload ба Mux-ийн боловсруулалтын төлөв.
 *
 * - Upload: `lesson_videos` мөр (id = Mux `passthrough`) + Mux direct upload URL. Lesson-ы
 *   `content.videoId` шинэ мөр рүү заана; өмнөх видеоны Mux asset-ийг арын ажлаар устгана.
 * - Төлөв: webhook (`mux.webhook` ажил) эсвэл багш "шалгах" (`sync`, Mux API-аас) — хоёулаа
 *   `applyUpload` / `applyAsset`-оор. Төлөв зөвхөн урагшилна (READY-аас буцахгүй).
 * - Webhook: гарын үсэг шалгаад `mux_webhook_events`-д (Mux event id-аар давхардалгүй) хадгалж,
 *   дараалалд өгнө — Mux-д шууд 200.
 */
@Injectable()
export class VideoService implements OnModuleInit {
  private readonly log = new Logger(VideoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authoring: CourseAuthoringService,
    @Inject(MUX) private readonly mux: MuxAdapter,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.queue.register<{ eventId: string }>(MUX_WEBHOOK_JOB, (d) => this.processEvent(d.eventId), MUX_JOB_RETRY);
    this.queue.register<{ assetId: string }>(MUX_DELETE_ASSET_JOB, (d) => this.mux.deleteAsset(d.assetId), MUX_JOB_RETRY);
  }

  // ---- багш ------------------------------------------------------------------

  async createUpload(teacherId: string, lessonId: string): Promise<VideoUploadTicket> {
    const lesson = await this.authoring.editableLesson(teacherId, lessonId);
    if (lesson.type !== 'VIDEO') throw E.notVideo();
    const content = lesson.content as unknown as VideoContent;
    if (!videoUploadAllowed(lesson.reviewStatus, { status: content.status ?? null, fromLive: content.fromLive ?? null })) {
      throw CatalogErrors.contentLocked();
    }
    if (!this.mux.enabled) throw E.unavailable();

    const videoId = randomUUID();
    const upload = await this.call(() => this.mux.createDirectUpload({ passthrough: videoId, corsOrigin: this.env.WEB_ORIGIN }));
    const previous = content.videoId
      ? await this.prisma.lessonVideo.findUnique({ where: { id: content.videoId } })
      : null;
    const next: VideoContent = { ...content, videoId, status: 'UPLOADING', durationSeconds: null, error: null };
    await this.prisma.$transaction([
      this.prisma.lessonVideo.create({ data: { id: videoId, lessonId: lesson.id, muxUploadId: upload.uploadId } }),
      this.prisma.lesson.update({ where: { id: lesson.id }, data: { content: next as Prisma.InputJsonValue } }),
    ]);
    // Солигдсон видео хэнд ч харагдахгүй (APPROVED хичээлд READY-г солих боломжгүй) — Mux-аас устгана.
    if (previous?.muxAssetId) {
      await this.queue.add(MUX_DELETE_ASSET_JOB, { assetId: previous.muxAssetId }, { jobId: `mux-delete:${previous.muxAssetId}` });
    }
    return { videoId, url: upload.url };
  }

  /** Webhook ирээгүй (local dev, саатал) үед Mux API-аас төлөвийг татаж шинэчилнэ. */
  async sync(teacherId: string, lessonId: string): Promise<CourseDetail> {
    const lesson = await this.authoring.editableLesson(teacherId, lessonId);
    const videoId = (lesson.content as unknown as VideoContent).videoId;
    const video = videoId ? await this.prisma.lessonVideo.findUnique({ where: { id: videoId } }) : null;
    if (video && (video.status === 'UPLOADING' || video.status === 'PROCESSING')) {
      if (!this.mux.enabled) throw E.unavailable();
      if (!video.muxAssetId) {
        const upload = await this.call(() => this.mux.getUpload(video.muxUploadId));
        await this.applyUpload(video, upload);
      }
      const fresh = await this.prisma.lessonVideo.findUniqueOrThrow({ where: { id: video.id } });
      if (fresh.muxAssetId && fresh.status === 'PROCESSING') {
        await this.applyAsset(fresh, await this.call(() => this.mux.getAsset(fresh.muxAssetId!)));
      }
    }
    return this.authoring.detail(teacherId, lesson.courseId);
  }

  // ---- webhook ---------------------------------------------------------------

  async receiveWebhook(rawBody: Buffer | undefined, signature: string | undefined): Promise<void> {
    let event;
    try {
      event = this.mux.parseWebhook(rawBody ?? Buffer.alloc(0), signature);
    } catch (err) {
      if (err instanceof MuxNotConfiguredError) throw E.unavailable();
      if (err instanceof MuxSignatureError) {
        this.log.warn(`Mux webhook татгалзав: ${err.message}`);
        throw E.invalidSignature();
      }
      throw err;
    }
    const { count } = await this.prisma.muxWebhookEvent.createMany({
      data: [{ id: event.id, type: event.type, payload: event.data as Prisma.InputJsonValue }],
      skipDuplicates: true,
    });
    // Давтан ирсэн (Mux retry) event-ийг дахин дараалалд өгөхгүй.
    if (count > 0) await this.queue.add(MUX_WEBHOOK_JOB, { eventId: event.id }, { jobId: `mux-webhook:${event.id}` });
  }

  async processEvent(eventId: string): Promise<void> {
    const event = await this.prisma.muxWebhookEvent.findUnique({ where: { id: eventId } });
    if (!event || event.processedAt) return;
    const data = event.payload as Record<string, unknown>;

    if (event.type.startsWith('video.upload.')) {
      const video = await this.prisma.lessonVideo.findUnique({ where: { muxUploadId: String(data.id ?? '') } });
      if (video) await this.applyUpload(video, uploadStateFrom(data));
    } else if (event.type === 'video.asset.ready' || event.type === 'video.asset.errored' || event.type === 'video.asset.created') {
      const state = assetStateFrom(data);
      const video = await this.findForAsset(state);
      if (video) await this.applyAsset(video, state);
      else this.log.warn(`Mux ${event.type}: asset ${state.assetId}-д харгалзах видео алга`);
    }
    // Бусад төрөл (asset.deleted, static rendition …) — хадгалаад л орхино.
    await this.prisma.muxWebhookEvent.update({ where: { id: eventId }, data: { processedAt: new Date() } });
  }

  // ---- төлөв ------------------------------------------------------------------

  private async findForAsset(state: MuxAssetState): Promise<LessonVideo | null> {
    if (state.passthrough && UUID_RE.test(state.passthrough)) {
      const byId = await this.prisma.lessonVideo.findUnique({ where: { id: state.passthrough } });
      if (byId) return byId;
    }
    if (state.assetId) {
      const byAsset = await this.prisma.lessonVideo.findUnique({ where: { muxAssetId: state.assetId } });
      if (byAsset) return byAsset;
    }
    return state.uploadId ? this.prisma.lessonVideo.findUnique({ where: { muxUploadId: state.uploadId } }) : null;
  }

  private async applyUpload(video: LessonVideo, upload: MuxUploadState): Promise<void> {
    if (video.status !== 'UPLOADING') {
      if (upload.assetId && !video.muxAssetId) await this.save(video, { muxAssetId: upload.assetId });
      return;
    }
    if (upload.status === 'asset_created' && upload.assetId) {
      await this.save(video, { muxAssetId: upload.assetId, status: 'PROCESSING' });
    } else if (upload.status === 'errored' || upload.status === 'cancelled' || upload.status === 'timed_out') {
      await this.save(video, { status: 'ERRORED', error: upload.error ?? `Upload ${upload.status}` });
    }
  }

  private async applyAsset(video: LessonVideo, asset: MuxAssetState): Promise<void> {
    if (video.status === 'READY') return;
    if (asset.status === 'ready' && asset.playbackId) {
      await this.save(video, {
        muxAssetId: asset.assetId,
        playbackId: asset.playbackId,
        durationSeconds: asset.durationSeconds,
        status: 'READY',
        error: null,
      });
    } else if (asset.status === 'ready' || asset.status === 'errored') {
      // `signed` playback id-гүй ready asset манай тохиргоогоор үүсэхгүй ёстой — алдаа гэж тооцно.
      await this.save(video, { muxAssetId: asset.assetId, status: 'ERRORED', error: asset.error ?? 'Signed playback id алга' });
    } else if (video.status === 'UPLOADING') {
      await this.save(video, { muxAssetId: asset.assetId, status: 'PROCESSING' });
    }
  }

  /** `lesson_videos` + (идэвхтэй видео бол) lesson-ы content-ийн хуулбарыг нэг transaction-д. */
  private async save(
    video: LessonVideo,
    patch: Partial<Pick<LessonVideo, 'muxAssetId' | 'playbackId' | 'durationSeconds' | 'status' | 'error'>>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.lessonVideo.update({ where: { id: video.id }, data: patch });
      const lesson = await tx.lesson.findUnique({ where: { id: video.lessonId } });
      const content = lesson?.content as unknown as VideoContent | undefined;
      if (!lesson || lesson.type !== 'VIDEO' || content?.videoId !== video.id) return;
      const next: VideoContent = {
        ...content,
        status: updated.status,
        durationSeconds: updated.durationSeconds,
        error: updated.error,
      };
      // Хооронд нь багш шинэ видео оруулсан бол (videoId солигдсон) хуучныг бичихгүй.
      await tx.lesson.updateMany({
        where: { id: lesson.id, content: { path: ['videoId'], equals: video.id } },
        data: { content: next as Prisma.InputJsonValue },
      });
    });
    Object.assign(video, patch);
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof MuxNotConfiguredError) throw E.unavailable();
      this.log.error(`Mux алдаа: ${(err as Error).message}`);
      throw E.provider();
    }
  }
}
