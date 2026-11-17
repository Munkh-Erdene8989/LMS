import { Body, Controller, Headers, HttpCode, Param, ParseUUIDPipe, Post, Req, type RawBodyRequest } from '@nestjs/common';
import type { CourseDetail, PlaybackGrant, VideoUploadTicket } from '@lms/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { Auth, CurrentUser, OptionalAuth, Viewer, type CurrentUserInfo } from '../auth/auth.guard';
import { ZodPipe } from '../zod-pipe';
import { SkipRateLimit } from '../rate-limit/rate-limit';
import { PlaybackService } from './playback.service';
import { VideoService } from './video.service';

const Uuid = new ParseUUIDPipe();
/** Browser-ийн localStorage-д хадгалсан төхөөрөмжийн санамсаргүй id */
const DeviceBody = z.object({ deviceId: z.string().regex(/^[\w-]{8,64}$/) }).strict();
type DeviceBody = z.infer<typeof DeviceBody>;

/** Багш: видео upload (Mux direct upload), боловсруулалтын төлөв. */
@Controller('teacher/lessons')
@Auth('TEACHER')
export class TeacherVideoController {
  constructor(private readonly videos: VideoService) {}

  @Post(':id/video-upload')
  upload(@CurrentUser() u: CurrentUserInfo, @Param('id', Uuid) id: string): Promise<VideoUploadTicket> {
    return this.videos.createUpload(u.id, id);
  }

  /** Mux-аас төлөвийг шалгаж шинэчилнэ (webhook хоцорсон/ирээгүй үед). */
  @Post(':id/video-sync')
  @HttpCode(200)
  sync(@CurrentUser() u: CurrentUserInfo, @Param('id', Uuid) id: string): Promise<CourseDetail> {
    return this.videos.sync(u.id, id);
  }
}

/** Видео тоглуулах: signed token, төхөөрөмжийн heartbeat. */
@Controller('media')
export class PlaybackController {
  constructor(private readonly playback: PlaybackService) {}

  /** Free preview-д зочин ч авна (optional auth); эрхгүй бол 403 `LESSON_LOCKED`. */
  @Post('lessons/:id/playback')
  @HttpCode(200)
  @OptionalAuth()
  grant(
    @Param('id', Uuid) id: string,
    @Viewer() viewer: CurrentUserInfo | null,
    @Body(new ZodPipe(DeviceBody)) b: DeviceBody,
  ): Promise<PlaybackGrant> {
    return this.playback.grant(id, viewer, b.deviceId);
  }

  @Post('playback/heartbeat')
  @HttpCode(204)
  @Auth()
  async heartbeat(@CurrentUser() u: CurrentUserInfo, @Body(new ZodPipe(DeviceBody)) b: DeviceBody): Promise<void> {
    await this.playback.heartbeat(u.id, b.deviceId);
  }

  /** `navigator.sendBeacon`-оор ч дуудагдана (хуудас хаах). */
  @Post('playback/stop')
  @HttpCode(204)
  @Auth()
  async stop(@CurrentUser() u: CurrentUserInfo, @Body(new ZodPipe(DeviceBody)) b: DeviceBody): Promise<void> {
    await this.playback.stop(u.id, b.deviceId);
  }
}

/** Mux webhook — нийтэд нээлттэй, `mux-signature`-аар (raw body) баталгаажуулна. */
@Controller('webhooks')
export class MuxWebhookController {
  constructor(private readonly videos: VideoService) {}

  @Post('mux')
  @SkipRateLimit()
  @HttpCode(200)
  async mux(@Req() req: RawBodyRequest<Request>, @Headers('mux-signature') signature?: string): Promise<{ ok: true }> {
    await this.videos.receiveWebhook(req.rawBody, signature);
    return { ok: true };
  }
}
