'use client';

import { formatUbDateTime, liveState, type LessonView, type LiveLessonContent } from '@lms/shared';
import { t, type MessageKey } from '@/lib/i18n';
import { Markdown } from './markdown';

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
  if (c.type === 'LIVE') {
    return (
      <div style={{ display: 'grid', gap: 4 }}>
        <LiveInfo content={c} />
        {c.meetingUrl && <small style={{ wordBreak: 'break-all' }}>{c.meetingUrl}</small>}
      </div>
    );
  }
  if (c.type === 'VIDEO') return <span className="muted">{t('live.recordingPending')}</span>;
  return null;
}
