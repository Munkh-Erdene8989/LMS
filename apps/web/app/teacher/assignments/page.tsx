'use client';

import { useCallback, useEffect, useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  ASSIGNMENT_COMMENT_MAX,
  type AssignmentInboxItem,
  type AssignmentInboxPage,
  type AssignmentInboxStatus,
} from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatDate } from '@/lib/format';
import { t } from '@/lib/i18n';
import { SubmissionFileLink } from '../../courses/[id]/lessons/[lessonId]/assignment-ui';
import { Button } from '../../ui/button';
import { EmptyState } from '../../ui/empty-state';
import { Skeleton } from '../../ui/skeleton';
import { useToast } from '../../ui/toast';
import s from '../teacher.module.css';

const STATUSES: AssignmentInboxStatus[] = ['UNREVIEWED', 'REVIEWED'];

/** Багшийн даалгавар шалгах inbox: суралцагч × даалгавар бүрийн хамгийн сүүлийн илгээлт. */
export default function AssignmentInboxPage() {
  const router = useRouter();
  const uid = useId();
  const [status, setStatus] = useState<AssignmentInboxStatus>('UNREVIEWED');
  const [items, setItems] = useState<AssignmentInboxItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [unreviewed, setUnreviewed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (before?: string) => {
      try {
        const r = await api<AssignmentInboxPage>(`/teacher/assignments?status=${status}${before ? `&before=${before}` : ''}`);
        setItems((prev) => (before && prev ? [...prev, ...r.data.items] : r.data.items));
        setCursor(r.data.nextCursor);
        setUnreviewed(r.data.unreviewedCount);
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 401) router.replace('/login?next=/teacher/assignments');
        else setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
      }
    },
    [router, status],
  );

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  function reviewed(item: AssignmentInboxItem) {
    if (status === 'UNREVIEWED') {
      setItems((prev) => prev?.filter((i) => i.id !== item.id) ?? null);
      setUnreviewed((n) => (n === null ? n : Math.max(0, n - 1)));
    } else {
      setItems((prev) => prev?.map((i) => (i.id === item.id ? item : i)) ?? null);
    }
  }

  /** Сум товчоор tab хооронд шилжих (roving tabindex). */
  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = STATUSES[(STATUSES.indexOf(status) + (e.key === 'ArrowRight' ? 1 : STATUSES.length - 1)) % STATUSES.length]!;
    setStatus(next);
    document.getElementById(`${uid}-tab-${next}`)?.focus();
  }

  return (
    <div className={s.page}>
      <h1 className={s.title}>{t('assignment.inboxTitle')}</h1>
      <div role="tablist" aria-label={t('assignment.inboxTitle')} className={s.tabs}>
        {STATUSES.map((st) => (
          <Button
            key={st}
            id={`${uid}-tab-${st}`}
            role="tab"
            aria-selected={status === st}
            aria-controls={`${uid}-panel`}
            tabIndex={status === st ? 0 : -1}
            variant={status === st ? 'primary' : 'secondary'}
            onClick={() => setStatus(st)}
            onKeyDown={onTabKey}
          >
            {st === 'UNREVIEWED' ? t('assignment.filterUnreviewed', { count: unreviewed ?? 0 }) : t('assignment.filterReviewed')}
          </Button>
        ))}
      </div>
      <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${status}`} className={s.stack}>
        {error && (
          <p role="alert" className={s.error}>
            {error}
          </p>
        )}
        {!items && !error && (
          <div className={s.stack} aria-busy="true" aria-label={t('ui.loading')}>
            <Skeleton height={160} radius={22} />
            <Skeleton height={160} radius={22} />
          </div>
        )}
        {items?.length === 0 && (
          <div className="card">
            <EmptyState title={status === 'UNREVIEWED' ? t('assignment.inboxEmpty') : t('assignment.inboxEmptyReviewed')} />
          </div>
        )}
        {items?.map((item) => <InboxCard key={item.id} item={item} onReviewed={reviewed} />)}
        {cursor && (
          <Button variant="secondary" className={s.startSelf} onClick={() => void load(cursor)}>
            {t('assignment.loadMore')}
          </Button>
        )}
      </div>
    </div>
  );
}

function InboxCard({ item, onReviewed }: { item: AssignmentInboxItem; onReviewed: (item: AssignmentInboxItem) => void }) {
  const { toast } = useToast();
  const [score, setScore] = useState(item.review ? String(item.review.score) : '');
  const [comment, setComment] = useState(item.review?.comment ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { score: Number(score), ...(comment.trim() ? { comment } : {}) };
      const r = await api<AssignmentInboxItem>(`/teacher/assignments/${item.id}/review`, { method: 'POST', body });
      toast(t('teacherUi.saved'));
      onReviewed(r.data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`card ${s.card}`}>
      <div className={s.rowBetween}>
        <strong>{item.learner.name ?? t('assignment.unnamedLearner')}</strong>
        <small className="muted">
          {t('assignment.submittedAt', { date: formatDate(item.submittedAt) })}
          {item.attempt > 1 && ` · ${t('assignment.attempt', { n: item.attempt })}`}
        </small>
      </div>
      <small className="muted">
        {item.course.title} · {item.lesson.title}
      </small>
      {item.text && <p className={s.pre}>{item.text}</p>}
      {item.file && <SubmissionFileLink submissionId={item.id} file={item.file} />}
      {item.previousReview && (
        <small className="muted">
          {t('assignment.previousReview', { score: item.previousReview.score, max: item.previousReview.maxScore })}
        </small>
      )}
      <form onSubmit={save} className={s.form}>
        <label className={s.inline}>
          {t('assignment.score')}
          <input
            className={`input ${s.scoreInput}`}
            name="score"
            type="number"
            inputMode="numeric"
            autoComplete="off"
            required
            min={0}
            max={item.lesson.maxScore}
            step={1}
            value={score}
            onChange={(e) => setScore(e.target.value)}
          />
          <span className="muted">/ {item.lesson.maxScore}</span>
        </label>
        <label className={s.field}>
          {t('assignment.comment')}
          <textarea
            className="input"
            name="comment"
            autoComplete="off"
            rows={3}
            maxLength={ASSIGNMENT_COMMENT_MAX}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </label>
        {error && (
          <small role="alert" className={s.error}>
            {error}
          </small>
        )}
        <Button type="submit" className={s.startSelf} loading={busy}>
          {item.review ? t('assignment.updateReview') : t('assignment.saveReview')}
        </Button>
      </form>
    </section>
  );
}
