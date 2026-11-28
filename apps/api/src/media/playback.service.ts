import { Inject, Injectable } from '@nestjs/common';
import {
  maskIdentifier,
  PLAYBACK_HEARTBEAT_SECONDS,
  PLAYBACK_MAX_DEVICES,
  PLAYBACK_SESSION_TTL_SECONDS,
  PLAYBACK_TOKEN_TTL_SECONDS,
  type PlaybackGrant,
} from '@lms/shared';
import { MUX, type MuxAdapter } from '../adapters/mux';
import { LessonAccessPolicy, staffRole, type LessonViewer, type OpenedLesson } from '../catalog/lesson-access';
import { CatalogErrors } from '../catalog/errors';
import type { VideoContent } from '../catalog/lesson-types';
import { ENV, type Env } from '../env';
import { PrismaService } from '../prisma/prisma.service';
import { MediaErrors as E } from './errors';
import { PLAYBACK_SESSIONS, type PlaybackSessionStore } from './playback-sessions';

const SLOT = { limit: PLAYBACK_MAX_DEVICES, ttlMs: PLAYBACK_SESSION_TTL_SECONDS * 1000 };

/**
 * Видео тоглуулах эрх (SPEC: "Mux token зөвхөн entitlement эсвэл free preview байгаа үед";
 * "богино хугацаатай; зэрэг тоглуулалт ≤ 2").
 *
 * - Эрх: `LessonAccessPolicy.open` (эзэмшигч, free preview, багш, админ). Багш өөрийн, админ бүх
 *   хичээлийг шалгагдаагүй байхад ч үзнэ (засварлах, шалгах).
 * - Төхөөрөмж: нэвтэрсэн хэрэглэгч бүрт `deviceId` (browser-ийн localStorage) тус бүр нэг slot,
 *   heartbeat-ээр сунгана; 3 дахь төхөөрөмж 409 `PLAYBACK_LIMIT`. Зочин (free preview) хязгааргүй.
 * - Watermark: хэрэглэгчийн утас (эсвэл имэйл)-ийн хэсэгчилсэн хэлбэр.
 */
@Injectable()
export class PlaybackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LessonAccessPolicy,
    @Inject(MUX) private readonly mux: MuxAdapter,
    @Inject(PLAYBACK_SESSIONS) private readonly sessions: PlaybackSessionStore,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async grant(lessonId: string, viewer: LessonViewer | null, deviceId: string, now = new Date()): Promise<PlaybackGrant> {
    const lesson = await this.open(lessonId, viewer);
    if (lesson.type !== 'VIDEO') throw E.notVideo();
    const videoId = (lesson.content as unknown as VideoContent).videoId;
    const video = videoId ? await this.prisma.lessonVideo.findUnique({ where: { id: videoId } }) : null;
    if (!video || video.status !== 'READY' || !video.playbackId) throw E.videoNotReady();
    if (!this.mux.enabled) throw E.unavailable();

    if (viewer && !(await this.sessions.claim(viewer.id, deviceId, SLOT))) throw E.playbackLimit(PLAYBACK_MAX_DEVICES);

    const sign = (aud: 'v' | 't' | 's') => this.mux.signPlaybackToken(video.playbackId!, aud, PLAYBACK_TOKEN_TTL_SECONDS, now);
    const metadata: Record<string, string | number> = {
      video_id: lesson.id,
      video_title: lesson.title,
      video_series: lesson.course.title,
      sub_property_id: lesson.course.id,
    };
    if (video.durationSeconds) metadata.video_duration = Math.round(video.durationSeconds * 1000);
    if (viewer) metadata.viewer_user_id = viewer.id;

    return {
      playbackId: video.playbackId,
      tokens: { playback: sign('v'), thumbnail: sign('t'), storyboard: sign('s') },
      expiresAt: new Date(now.getTime() + PLAYBACK_TOKEN_TTL_SECONDS * 1000).toISOString(),
      watermark: viewer ? await this.watermark(viewer.id) : null,
      heartbeatSeconds: viewer ? PLAYBACK_HEARTBEAT_SECONDS : null,
      muxData: { envKey: this.env.MUX_DATA_ENV_KEY || null, metadata },
    };
  }

  /** Тоглуулж байх үед `PLAYBACK_HEARTBEAT_SECONDS` тутам. Slot алдагдаад өөр төхөөрөмж авсан бол 409. */
  async heartbeat(userId: string, deviceId: string): Promise<void> {
    if (!(await this.sessions.claim(userId, deviceId, SLOT))) throw E.playbackLimit(PLAYBACK_MAX_DEVICES);
  }

  /** Pause / хуудас хаах — slot-ыг шууд чөлөөлнө. */
  async stop(userId: string, deviceId: string): Promise<void> {
    await this.sessions.release(userId, deviceId);
  }

  private async open(lessonId: string, viewer: LessonViewer | null): Promise<OpenedLesson> {
    if (viewer) {
      const lesson = await this.prisma.lesson.findUnique({
        where: { id: lessonId },
        include: { course: { select: { id: true, title: true, teacherId: true, visibility: true } } },
      });
      if (!lesson) throw CatalogErrors.lessonNotFound();
      if (staffRole(viewer, lesson.course.teacherId)) return lesson;
    }
    return (await this.access.open(lessonId, viewer)).lesson;
  }

  private async watermark(userId: string): Promise<string | null> {
    const ids = await this.prisma.identifier.findMany({ where: { userId }, select: { type: true, value: true } });
    const pick = ids.find((i) => i.type === 'PHONE') ?? ids.find((i) => i.type === 'EMAIL');
    return pick ? maskIdentifier(pick.type, pick.value) : null;
  }
}
