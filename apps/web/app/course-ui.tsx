'use client';

import type { LessonView } from '@lms/shared';
import { t, type MessageKey } from '@/lib/i18n';
import { Markdown } from './markdown';

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge-status s-${status}`}>{t(`course.status${status}` as MessageKey)}</span>;
}

export function LessonStatusBadge({ status }: { status: string }) {
  return <span className={`badge-status s-${status}`}>{t(`course.lesson${status}` as MessageKey)}</span>;
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
  return null;
}
