'use client';

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import type { MuxPlayerRefAttributes } from '@mux/mux-player-react';
// Lazy: player-ийн JS (~300 KB) зөвхөн видео харагдах үед ачаалагдана.
import MuxPlayer from '@mux/mux-player-react/lazy';
import type { LessonProgressView, PlaybackGrant } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { t } from '@/lib/i18n';

const DEVICE_KEY = 'lms.deviceId';
/** Үзсэн хувийг API руу илгээх давтамж (тоглуулж байх үед) */
const PROGRESS_EVERY_MS = 15_000;
/** Watermark байрлал солих давтамж */
const WATERMARK_MOVE_MS = 6_000;

/** Browser бүрийн тогтмол санамсаргүй id (зэрэг тоглуулалтын хязгаарт). localStorage-гүй бол tab-ын id. */
let fallbackDeviceId: string | null = null;
function deviceId(): string {
  try {
    const saved = window.localStorage.getItem(DEVICE_KEY);
    if (saved && /^[\w-]{8,64}$/.test(saved)) return saved;
    const id = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    fallbackDeviceId ??= crypto.randomUUID();
    return fallbackDeviceId;
  }
}

function randomSpot() {
  return { top: 5 + Math.random() * 80, left: 5 + Math.random() * 65 };
}

/**
 * Видео тоглуулагч (ticket 10). API-аас signed token авна (`POST /media/lessons/:id/playback` — эрх,
 * төхөөрөмжийн хязгаар шалгана), Mux Player-ээр тоглуулж:
 * - хөдөлгөөнт watermark (утас/имэйлийн хэсэг) — бүтэн дэлгэцэнд ч харагдана (`fullscreenElement`);
 * - тоглуулж байх үед heartbeat; зогсоох/хуудас хаахад slot чөлөөлнө; 3 дахь төхөөрөмж бол зогсооно;
 * - үзсэн хувийг `POST /learning/lessons/:id/progress` руу (90%+ бол дууссан);
 * - Mux Data metadata (viewer, lesson id) API-аас.
 */
export function VideoPlayer({ lessonId, onProgress }: { lessonId: string; onProgress?: (p: LessonProgressView) => void }) {
  const containerId = `video-${useId().replace(/[^\w-]/g, '')}`;
  const playerRef = useRef<MuxPlayerRefAttributes | null>(null);
  const [grant, setGrant] = useState<PlaybackGrant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spot, setSpot] = useState(randomSpot);
  const device = useRef<string>('');
  const maxPercent = useRef(0);
  const sentPercent = useRef(0);
  const lastSentAt = useRef(0);
  const heartbeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeAt = useRef<number | null>(null);

  const load = useCallback(async () => {
    device.current ||= deviceId();
    setError(null);
    try {
      setGrant((await api<PlaybackGrant>(`/media/lessons/${lessonId}/playback`, { method: 'POST', body: { deviceId: device.current } })).data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
    }
  }, [lessonId]);

  useEffect(() => {
    void load();
  }, [load]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeat.current) clearInterval(heartbeat.current);
    heartbeat.current = null;
  }, []);

  const sendProgress = useCallback(
    (force = false) => {
      if (!grant?.heartbeatSeconds) return; // зочин — явц бичигдэхгүй
      const percent = Math.floor(maxPercent.current);
      if (percent <= sentPercent.current) return;
      if (!force && Date.now() - lastSentAt.current < PROGRESS_EVERY_MS) return;
      sentPercent.current = percent;
      lastSentAt.current = Date.now();
      api<LessonProgressView>(`/learning/lessons/${lessonId}/progress`, { method: 'POST', body: { watchedPercent: percent } })
        .then((r) => onProgress?.(r.data))
        .catch(() => {
          sentPercent.current = 0; // дараагийн удаа дахин илгээнэ
        });
    },
    [grant, lessonId, onProgress],
  );

  /** Slot-оо алдсан (өөр 2 төхөөрөмж тоглуулж байна) — зогсоож тайлбар харуулна. */
  const limitReached = useCallback(
    (err: unknown) => {
      if (!(err instanceof ApiRequestError) || err.code !== 'PLAYBACK_LIMIT') return;
      stopHeartbeat();
      playerRef.current?.pause();
      setError(err.message);
    },
    [stopHeartbeat],
  );

  const ping = useCallback(() => {
    api(`/media/playback/heartbeat`, { method: 'POST', body: { deviceId: device.current } }).catch(limitReached);
  }, [limitReached]);

  const onPlay = useCallback(() => {
    if (!grant?.heartbeatSeconds) return;
    setError(null);
    ping();
    stopHeartbeat();
    heartbeat.current = setInterval(ping, grant.heartbeatSeconds * 1000);
  }, [grant, ping, stopHeartbeat]);

  const release = useCallback(() => {
    stopHeartbeat();
    if (!grant?.heartbeatSeconds || !device.current) return;
    const body = JSON.stringify({ deviceId: device.current });
    if (!navigator.sendBeacon?.('/api/media/playback/stop', new Blob([body], { type: 'application/json' }))) {
      void fetch('/api/media/playback/stop', { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body }).catch(() => {});
    }
  }, [grant, stopHeartbeat]);

  const onPause = useCallback(() => {
    sendProgress(true);
    release();
  }, [release, sendProgress]);

  // Хуудас хаах / өөр хуудас руу шилжих — явц + slot.
  useEffect(() => {
    const onHide = () => {
      sendProgress(true);
      release();
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      onHide();
    };
  }, [release, sendProgress]);

  // Хөдөлгөөнт watermark.
  useEffect(() => {
    if (!grant?.watermark) return;
    const timer = setInterval(() => setSpot(randomSpot()), WATERMARK_MOVE_MS);
    return () => clearInterval(timer);
  }, [grant?.watermark]);

  // Token хугацаа дуусахад (урт хичээл, удаан зогсоосон) шинэ token аваад тухайн байрлалаас үргэлжлүүлнэ.
  const onError = useCallback(() => {
    if (!grant || Date.parse(grant.expiresAt) > Date.now() + 30_000) return;
    resumeAt.current = playerRef.current?.currentTime ?? null;
    void load();
  }, [grant, load]);

  const onLoadedMetadata = useCallback(() => {
    // `fullscreenElement` attribute player DOM-д орохоос өмнө (lazy) уншигдвал үл тоогдоно — энд баталгаажуулна,
    // ингэснээр бүтэн дэлгэцэнд watermark-тай container томорно.
    const container = document.getElementById(containerId);
    const controller = playerRef.current?.mediaController;
    if (container && controller && controller.fullscreenElement !== container) controller.fullscreenElement = container;
    if (resumeAt.current !== null && playerRef.current) {
      playerRef.current.currentTime = resumeAt.current;
      resumeAt.current = null;
    }
  }, [containerId]);

  const onTimeUpdate = useCallback(() => {
    const p = playerRef.current;
    if (!p || !p.duration || !Number.isFinite(p.duration)) return;
    maxPercent.current = Math.max(maxPercent.current, Math.min(100, (p.currentTime / p.duration) * 100));
    sendProgress();
  }, [sendProgress]);

  const onEnded = useCallback(() => {
    maxPercent.current = 100;
    sendProgress(true);
    release();
  }, [release, sendProgress]);

  if (!grant) {
    return error ? (
      <div className="card" style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
        <p role="alert" style={{ color: 'var(--err)', margin: 0 }}>
          {error}
        </p>
        <button type="button" className="btn btn-ghost" onClick={() => void load()}>
          {t('video.retry')}
        </button>
      </div>
    ) : (
      <div className="video-frame video-loading">{t('video.loading')}</div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div id={containerId} className="video-frame" onContextMenu={(e) => e.preventDefault()}>
        <MuxPlayer
          ref={playerRef}
          playbackId={grant.playbackId}
          tokens={grant.tokens}
          envKey={grant.muxData.envKey ?? undefined}
          metadata={grant.muxData.metadata}
          fullscreenElement={containerId}
          streamType="on-demand"
          accentColor="#0071e3"
          style={{ width: '100%', height: '100%' }}
          onPlay={onPlay}
          onPause={onPause}
          onEnded={onEnded}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={onLoadedMetadata}
          onError={onError}
        />
        {grant.watermark && (
          <span
            className="video-watermark"
            aria-hidden
            style={{ '--wm-x': `${spot.left}%`, '--wm-y': `${spot.top}%` } as CSSProperties}
          >
            <span>{grant.watermark}</span>
          </span>
        )}
      </div>
      {error && (
        <p role="alert" style={{ color: 'var(--err)', margin: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}
