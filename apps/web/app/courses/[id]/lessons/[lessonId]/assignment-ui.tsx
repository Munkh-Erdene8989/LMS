'use client';

import { useState, type FormEvent } from 'react';
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

const MB = 1024 * 1024;

/** Илгээсэн файлыг нээх: API-аас богино хугацаатай signed URL авч шинэ цонхонд (илгээгч, багш, админ). */
export function SubmissionFileLink({ submissionId, file }: { submissionId: string; file: SubmissionFileView }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        type="button"
        className="btn btn-ghost"
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
        {t('assignment.openFile', { name: file.name, size: Math.max(1, Math.round(file.size / 1024)) })}
      </button>
      {error && (
        <small role="alert" style={{ color: 'var(--err)' }}>
          {error}
        </small>
      )}
    </span>
  );
}

/** Суралцагч: даалгавар илгээх (текст ба/эсвэл файл ≤ 50MB), дахин илгээх, үнэлгээ харах. */
export function AssignmentPanel({ lessonId, initial }: { lessonId: string; initial: AssignmentState }) {
  const [state, setState] = useState(initial);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const current = state.submissions[0] ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSent(false);
    if (!text.trim() && !file) return setError(t('assignment.emptyError'));
    if (file && file.size > ASSIGNMENT_FILE_MAX_BYTES) return setError(t('assignment.tooLarge'));
    setBusy(true);
    try {
      let uploaded: { key: string; name: string } | undefined;
      if (file) {
        const ticket = (
          await api<UploadTicket>(`/learning/lessons/${lessonId}/assignment/upload`, { method: 'POST', body: { fileName: file.name, size: file.size } })
        ).data;
        await uploadFile(ticket, file);
        uploaded = { key: ticket.key, name: file.name };
      }
      const body = { ...(text.trim() ? { text } : {}), ...(uploaded ? { file: uploaded } : {}) };
      setState((await api<AssignmentState>(`/learning/lessons/${lessonId}/assignment/submissions`, { method: 'POST', body })).data);
      setText('');
      setFile(null);
      setFormKey((k) => k + 1);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <p className="muted" style={{ margin: 0 }}>
        {t('assignment.maxScoreLabel', { max: state.maxScore })}
        {current && ` · ${current.review ? t('assignment.statusReviewed') : t('assignment.statusPending')}`}
      </p>

      {current?.review && <ReviewBox review={current.review} />}

      {state.canSubmit ? (
        <form key={formKey} onSubmit={submit} className="card" style={{ display: 'grid', gap: 8 }}>
          <strong>{current ? t('assignment.resubmitTitle') : t('assignment.submitTitle')}</strong>
          <label style={{ display: 'grid', gap: 4 }}>
            {t('assignment.textLabel')}
            <textarea className="input" rows={6} maxLength={ASSIGNMENT_TEXT_MAX} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            {t('assignment.fileLabel', { max: ASSIGNMENT_FILE_MAX_BYTES / MB })}
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {current && <small className="muted">{t('assignment.resubmitHint')}</small>}
          {error && (
            <small role="alert" style={{ color: 'var(--err)' }}>
              {error}
            </small>
          )}
          {sent && <small style={{ color: 'var(--ok)' }}>{t('assignment.sent')}</small>}
          <button className="btn" disabled={busy} style={{ justifySelf: 'start' }}>
            {busy ? t('assignment.submitting') : current ? t('assignment.resubmit') : t('assignment.submit')}
          </button>
        </form>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          {t('assignment.ownersOnly')}
        </p>
      )}

      {state.submissions.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
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
    <div className="card" style={{ display: 'grid', gap: 4 }}>
      <strong>{t('assignment.reviewScore', { score: review.score, max: review.maxScore })}</strong>
      {review.comment && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{review.comment}</p>}
      <small className="muted">{t('assignment.reviewedAt', { date: formatDate(review.reviewedAt) })}</small>
    </div>
  );
}

function SubmissionRow({ submission: s }: { submission: SubmissionView }) {
  return (
    <div className="card" style={{ display: 'grid', gap: 6 }}>
      <small className="muted">
        {t('assignment.submittedAt', { date: formatDate(s.submittedAt) })} ·{' '}
        {s.review ? t('assignment.reviewScore', { score: s.review.score, max: s.review.maxScore }) : t('assignment.statusPending')}
      </small>
      {s.text && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{s.text}</p>}
      {s.file && <SubmissionFileLink submissionId={s.id} file={s.file} />}
    </div>
  );
}
