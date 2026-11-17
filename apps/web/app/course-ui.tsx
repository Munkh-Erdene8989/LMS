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
  return null;
}
