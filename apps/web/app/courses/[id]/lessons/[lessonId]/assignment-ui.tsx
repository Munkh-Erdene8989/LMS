'use client';

import { useId, useState, type FormEvent } from 'react';
import {
  ASSIGNMENT_FILE_MAX_BYTES,
  ASSIGNMENT_TEXT_MAX,
  type AssignmentState,
  type SubmissionFileUrl,
  type SubmissionFileView,
  type SubmissionView,
  type UploadTicket,
} from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatDate } from '@/lib/format';
import { t } from '@/lib/i18n';
import { uploadFile } from '@/lib/upload';
import { Button } from '../../../../ui/button';
import { useToast } from '../../../../ui/toast';
import { LESSON_PROGRESS_EVENT } from './lesson-frame';
import styles from './lesson.module.css';

const MB = 1024 * 1024;

/** Илгээсэн файлыг нээх: API-аас богино хугацаатай signed URL авч шинэ цонхонд (илгээгч, багш, админ). */
export function SubmissionFileLink({ submissionId, file }: { submissionId: string; file: SubmissionFileView }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <span className={styles.fileLink}>
      <Button
        variant="secondary"
        size="sm"
        onClick={async () => {
          setError(null);
          // Popup blocker-оос сэргийлж цонхыг эхлээд нээнэ
          const win = window.open('', '_blank');
          try {
            const r = await api<SubmissionFileUrl>(`/learning/assignment-submissions/${submissionId}/file`);
            if (win) win.location.href = r.data.url;
            else window.location.href = r.data.url;
          } catch (err) {
            win?.close();
            setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
          }
        }}
      >
        {t('assignment.openFile', {
          name: file.name,
          size: Math.max(1, Math.round(file.size / 1024)),
        })}
      </Button>
      {error && (
        <small role="alert" className={styles.error}>
          {error}
        </small>
      )}
    </span>
  );
}

/** Суралцагч: даалгавар илгээх (текст ба/эсвэл файл ≤ 50MB), дахин илгээх, үнэлгээ харах. */
export function AssignmentPanel({ lessonId, initial }: { lessonId: string; initial: AssignmentState }) {
  const { toast } = useToast();
  const errorId = useId();
  const [state, setState] = useState(initial);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const current = state.submissions[0] ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!text.trim() && !file) return setError(t('assignment.emptyError'));
    if (file && file.size > ASSIGNMENT_FILE_MAX_BYTES) return setError(t('assignment.tooLarge'));
    setBusy(true);
    try {
      let uploaded: { key: string; name: string } | undefined;
      if (file) {
        const ticket = (
          await api<UploadTicket>(`/learning/lessons/${lessonId}/assignment/upload`, {
            method: 'POST',
            body: { fileName: file.name, size: file.size },
          })
        ).data;
        await uploadFile(ticket, file);
        uploaded = { key: ticket.key, name: file.name };
      }
      const body = {
        ...(text.trim() ? { text } : {}),
        ...(uploaded ? { file: uploaded } : {}),
      };
      setState((await api<AssignmentState>(`/learning/lessons/${lessonId}/assignment/submissions`, { method: 'POST', body })).data);
      setText('');
      setFile(null);
      setFormKey((k) => k + 1);
      toast(t('assignment.sent'));
      window.dispatchEvent(new Event(LESSON_PROGRESS_EVENT));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.quiz}>
      <p className={styles.meta}>
        {t('assignment.maxScoreLabel', { max: state.maxScore })}
        {current && ` · ${current.review ? t('assignment.statusReviewed') : t('assignment.statusPending')}`}
      </p>

      {current?.review && <ReviewBox review={current.review} />}

      {state.canSubmit ? (
        <form key={formKey} onSubmit={submit} className={styles.form} noValidate>
          <strong>{current ? t('assignment.resubmitTitle') : t('assignment.submitTitle')}</strong>
          <label className={styles.field}>
            {t('assignment.textLabel')}
            <textarea
              className="input"
              rows={6}
              maxLength={ASSIGNMENT_TEXT_MAX}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </label>
          <label className={styles.field}>
            {t('assignment.fileLabel', { max: ASSIGNMENT_FILE_MAX_BYTES / MB })}
            <input type="file" className={styles.fileInput} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {current && <p className={styles.meta}>{t('assignment.resubmitHint')}</p>}
          {error && (
            <p id={errorId} role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <div>
            <Button type="submit" loading={busy} loadingLabel={t('assignment.submitting')}>
              {current ? t('assignment.resubmit') : t('assignment.submit')}
            </Button>
          </div>
        </form>
      ) : (
        <p className={styles.meta}>{t('assignment.ownersOnly')}</p>
      )}

      {state.submissions.length > 0 && (
        <div className={styles.history}>
          <strong>{t('assignment.history')}</strong>
          {state.submissions.map((s) => (
            <SubmissionRow key={s.id} submission={s} />
          ))}
        </div>
      )}
    </section>
  );
}

function ReviewBox({ review }: { review: NonNullable<SubmissionView['review']> }) {
  return (
    <div className={styles.panel}>
      <strong>
        {t('assignment.reviewScore', {
          score: review.score,
          max: review.maxScore,
        })}
      </strong>
      {review.comment && <p className={styles.comment}>{review.comment}</p>}
      <small className={styles.meta}>{t('assignment.reviewedAt', { date: formatDate(review.reviewedAt) })}</small>
    </div>
  );
}

function SubmissionRow({ submission: s }: { submission: SubmissionView }) {
  return (
    <div className={styles.panel}>
      <small className={styles.meta}>
        {t('assignment.submittedAt', { date: formatDate(s.submittedAt) })} ·{' '}
        {s.review
          ? t('assignment.reviewScore', {
              score: s.review.score,
              max: s.review.maxScore,
            })
          : t('assignment.statusPending')}
      </small>
      {s.text && <p className={styles.comment}>{s.text}</p>}
      {s.file && <SubmissionFileLink submissionId={s.id} file={s.file} />}
    </div>
  );
}
