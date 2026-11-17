'use client';

import { formatUbDateTime, liveState, type LessonView, type LiveLessonContent, type VideoLessonContent } from '@lms/shared';
import { t, type MessageKey } from '@/lib/i18n';
import { Markdown } from './markdown';
import { VideoPlayer } from './video-player';

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge-status s-${status}`}>{t(`course.status${status}` as MessageKey)}</span>;
}

export function LessonStatusBadge({ status }: { status: string }) {
  return <span className={`badge-status s-${status}`}>{t(`course.lesson${status}` as MessageKey)}</span>;
}

/**
 * Live хичээлийн цаг (Улаанбаатар), төлөв, нэгдэх товч. Линк null бол тайлбар:
 * `owners-only` — free preview-ээр үзэж байгаа (линк зөвхөн худалдан авсан хүнд), үгүй бол оруулаагүй.
 */
export function LiveInfo({ content, linkHidden }: { content: LiveLessonContent; linkHidden?: 'owners-only' }) {
  if (!content.startsAt || !content.durationMinutes) return <span className="muted">{t('live.notScheduled')}</span>;
  const state = liveState(content.startsAt, content.durationMinutes);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className={`badge-status${state === 'ENDED' ? '' : ' s-APPROVED'}`}>{t(`live.state${state}` as MessageKey)}</span>
        <span>{t('live.when', { startsAt: formatUbDateTime(content.startsAt), duration: content.durationMinutes })}</span>
      </div>
      {content.meetingUrl
        ? state !== 'ENDED' && (
            <a className="btn" style={{ justifySelf: 'start' }} href={content.meetingUrl} target="_blank" rel="noreferrer">
              {t('live.join')}
            </a>
          )
        : state !== 'ENDED' && (
            <small className="muted">{linkHidden === 'owners-only' ? t('live.linkOwnersOnly') : t('live.linkMissing')}</small>
          )}
      {state === 'SCHEDULED' && <small className="muted">{t('live.reminderHint')}</small>}
    </div>
  );
}

/** Хичээлийн агуулгыг урьдчилан харах (багш, админ). */
export function LessonContentPreview({ lesson }: { lesson: LessonView }) {
  const c = lesson.content;
  if (c.type === 'TEXT') return <Markdown source={c.markdown} />;
  if (c.type === 'PDF') {
    return c.url ? (
      <a href={c.url} target="_blank" rel="noreferrer">
        {t('course.openPdf')}: {c.fileName} ({Math.round((c.size ?? 0) / 1024)} KB)
      </a>
    ) : (
      <span style={{ color: 'var(--muted)' }}>—</span>
    );
  }
  if (c.type === 'QUIZ') {
    // Багш/админд л — зөв хариулттай (answerKey)
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        <small className="muted">{t('quiz.passPercent', { percent: c.passPercent })}</small>
        {c.questions.length === 0 && <span style={{ color: 'var(--muted)' }}>—</span>}
        <ol style={{ margin: 0, display: 'grid', gap: 6 }}>
          {c.questions.map((q) => {
            const correct = c.answerKey?.[q.id] ?? [];
            return (
              <li key={q.id}>
                {q.text} <small className="muted">({q.multiple ? t('quiz.multiple') : t('quiz.single')})</small>
                <ul style={{ margin: 0 }}>
                  {q.options.map((o) => (
                    <li key={o.id} style={correct.includes(o.id) ? { color: 'var(--ok)', fontWeight: 600 } : undefined}>
                      {o.text}
                      {correct.includes(o.id) && ` ✓ ${t('quiz.previewCorrect')}`}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }
  if (c.type === 'LIVE') {
    return (
      <div style={{ display: 'grid', gap: 4 }}>
        <LiveInfo content={c} />
        {c.meetingUrl && <small style={{ wordBreak: 'break-all' }}>{c.meetingUrl}</small>}
      </div>
    );
  }
  if (c.type === 'VIDEO') {
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        <VideoStatus content={c} />
        {c.status === 'READY' && <VideoPlayer lessonId={lesson.id} />}
      </div>
    );
  }
  if (c.type === 'ASSIGNMENT') {
    return (
      <div style={{ display: 'grid', gap: 4 }}>
        <small className="muted">{c.maxScore ? t('assignment.maxScoreLabel', { max: c.maxScore }) : '—'}</small>
        {c.instructions ? <Markdown source={c.instructions} /> : <span style={{ color: 'var(--muted)' }}>—</span>}
      </div>
    );
  }
  return null;
}

/** 125.4 → "2:05", 3725 → "1:02:05" */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Видеоны боловсруулалтын төлөв (багш, админ). */
export function VideoStatus({ content }: { content: VideoLessonContent }) {
  if (!content.status) return <span className="muted">{content.fromLive ? t('live.recordingPending') : t('video.notUploaded')}</span>;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span className={`badge-status${content.status === 'READY' ? ' s-APPROVED' : content.status === 'ERRORED' ? ' s-REJECTED' : ''}`}>
        {t(`video.status${content.status}` as MessageKey)}
      </span>
      {content.durationSeconds !== null && <small className="muted">{t('video.duration', { duration: formatDuration(content.durationSeconds) })}</small>}
      {content.status === 'ERRORED' && content.error && <small style={{ color: 'var(--err)' }}>{content.error}</small>}
    </div>
  );
}
