/** Видео хичээл (ticket 10, Mux): upload, тоглуулах эрх, зэрэг тоглуулалтын хязгаар, watermark. */

import type { LessonReviewStatus } from './catalog';

export type VideoStatus = 'UPLOADING' | 'PROCESSING' | 'READY' | 'ERRORED';

/**
 * VIDEO lesson-ы контент. Тоглуулах token энд БАЙХГҮЙ — `POST /media/lessons/:id/playback`-ээр
 * (эрх + төхөөрөмжийн хязгаар шалгаад) тусад нь авна.
 */
export interface VideoLessonContent {
  type: 'VIDEO';
  /** null = видео оруулаагүй */
  status: VideoStatus | null;
  durationSeconds: number | null;
  /** ERRORED үед Mux-ийн алдааны тайлбар */
  error: string | null;
  /** Дууссан live-ийг бичлэг болгосон бол (ticket 14) */
  fromLive: { startsAt: string; durationMinutes: number } | null;
}

/**
 * Багш видео оруулж (солих) болох эсэх. Нийтлэгдсэн (APPROVED) хичээлийн агуулга түгжигддэг —
 * үл хамаарах нь бичлэг болгосон live (`fromLive`): бичлэг бэлэн (READY) болтол оруулж/дахин оруулж болно.
 */
export function videoUploadAllowed(
  reviewStatus: LessonReviewStatus,
  content: Pick<VideoLessonContent, 'status' | 'fromLive'>,
): boolean {
  if (reviewStatus === 'IN_REVIEW') return false;
  if (reviewStatus !== 'APPROVED') return true;
  return !!content.fromLive && content.status !== 'READY';
}

/** `POST /teacher/lessons/:id/video-upload` — файлыг browser-оос шууд Mux руу `PUT` хийнэ. */
export interface VideoUploadTicket {
  videoId: string;
  url: string;
}

/** Нэг аккаунт зэрэг тоглуулах төхөөрөмжийн дээд тоо */
export const PLAYBACK_MAX_DEVICES = 2;
/** Player heartbeat-ийн давтамж */
export const PLAYBACK_HEARTBEAT_SECONDS = 30;
/** Heartbeat ирэхгүй бол төхөөрөмжийн slot чөлөөлөгдөх хугацаа */
export const PLAYBACK_SESSION_TTL_SECONDS = 90;
/** Mux signed playback token-ы хугацаа */
export const PLAYBACK_TOKEN_TTL_SECONDS = 15 * 60;

/** `POST /media/lessons/:id/playback { deviceId }` */
export interface PlaybackGrant {
  playbackId: string;
  /** Mux signed JWT-ууд (mux-player-ийн `tokens`) */
  tokens: { playback: string; thumbnail: string; storyboard: string };
  expiresAt: string;
  /** Хөдөлгөөнт watermark (жишээ `9911****`); зочин (free preview) бол null */
  watermark: string | null;
  /** Нэвтэрсэн үед heartbeat илгээнэ (секунд); зочинд null */
  heartbeatSeconds: number | null;
  /** Mux Data (Analytics) */
  muxData: { envKey: string | null; metadata: Record<string, string | number> };
}

/**
 * Утас/имэйлийн хэсэгчилсэн хэлбэр (watermark): `+97699112233` → `9911****`, `bold@gmail.com` → `bo***@gmail.com`.
 */
export function maskIdentifier(type: 'PHONE' | 'EMAIL', value: string): string {
  if (type === 'PHONE') {
    const digits = value.replace(/\D/g, '');
    const local = digits.length > 8 && digits.startsWith('976') ? digits.slice(3) : digits;
    return `${local.slice(0, 4)}${'*'.repeat(Math.max(local.length - 4, 4))}`;
  }
  const [name = '', domain = ''] = value.split('@');
  return `${name.slice(0, 2)}***@${domain}`;
}
