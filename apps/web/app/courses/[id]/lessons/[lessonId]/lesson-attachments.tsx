'use client';

import { useState } from 'react';
import type { LessonAttachmentUrl, LessonAttachmentView } from '@lms/shared';
import { api, errorText } from '@/lib/client-api';
import { formatFileSize } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Button } from '../../../../ui/button';
import styles from './lesson.module.css';

/**
 * Хичээлийн татаж авах материал. Signed URL-ийг товч дарах мөчид API-аас авна (хуудас удаан нээлттэй
 * байсан ч хугацаа нь дуусахгүй); эрхийг API lesson-ы контенттой ижлээр шалгана.
 */
export function LessonAttachments({ lessonId, attachments }: { lessonId: string; attachments: LessonAttachmentView[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (attachments.length === 0) return null;

  async function download(a: LessonAttachmentView) {
    setBusy(a.id);
    setError(null);
    try {
      const r = await api<LessonAttachmentUrl>(`/catalog/lessons/${lessonId}/attachments/${a.id}/url`);
      // Storage `Content-Disposition: attachment` өгдөг тул хуудаснаас гарахгүй, файл татагдана.
      window.location.href = r.data.url;
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby={`attachments-${lessonId}`}>
      <h2 id={`attachments-${lessonId}`} className={styles.attachmentsTitle}>
        {t('catalog.attachments')}
      </h2>
      <ul className={styles.attachments}>
        {attachments.map((a) => (
          <li key={a.id} className={styles.attachment}>
            <span className={styles.attachmentName}>{a.fileName}</span>
            <small className="muted">{formatFileSize(a.size)}</small>
            <Button
              variant="secondary"
              size="sm"
              loading={busy === a.id}
              loadingLabel={t('catalog.downloadAttachment')}
              onClick={() => void download(a)}
            >
              {t('catalog.downloadAttachment')}
            </Button>
          </li>
        ))}
      </ul>
      {error && (
        <small role="alert" className={styles.error}>
          {error}
        </small>
      )}
    </section>
  );
}
