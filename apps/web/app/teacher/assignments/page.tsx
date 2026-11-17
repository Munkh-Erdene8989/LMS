'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
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

const STATUSES: AssignmentInboxStatus[] = ['UNREVIEWED', 'REVIEWED'];

/** Багшийн даалгавар шалгах inbox: суралцагч × даалгавар бүрийн хамгийн сүүлийн илгээлт. */
export default function AssignmentInboxPage() {
  const router = useRouter();
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

  return (
    <main className="page" style={{ display: 'grid', gap: 16 }}>
      <Link href="/teacher/courses">{t('assignment.backToCourses')}</Link>
      <h1 style={{ margin: 0 }}>{t('assignment.inboxTitle')}</h1>
      <div role="tablist" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={status === s}
            className={status === s ? 'btn' : 'btn btn-ghost'}
            onClick={() => setStatus(s)}
          >
            {s === 'UNREVIEWED' ? t('assignment.filterUnreviewed', { count: unreviewed ?? 0 }) : t('assignment.filterReviewed')}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" style={{ color: 'var(--err)', margin: 0 }}>
          {error}
        </p>
      )}
      {items?.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          {status === 'UNREVIEWED' ? t('assignment.inboxEmpty') : t('assignment.inboxEmptyReviewed')}
        </p>
      )}
      <div style={{ display: 'grid', gap: 12 }}>
        {items?.map((item) => <InboxCard key={item.id} item={item} onReviewed={reviewed} />)}
      </div>
      {cursor && (
        <button type="button" className="btn btn-ghost" style={{ justifySelf: 'start' }} onClick={() => void load(cursor)}>
          {t('assignment.loadMore')}
        </button>
      )}
    </main>
  );
}

function InboxCard({ item, onReviewed }: { item: AssignmentInboxItem; onReviewed: (item: AssignmentInboxItem) => void }) {
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
      onReviewed((await api<AssignmentInboxItem>(`/teacher/assignments/${item.id}/review`, { method: 'POST', body })).data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <strong>{item.learner.name ?? t('assignment.unnamedLearner')}</strong>
        <small className="muted">
          {t('assignment.submittedAt', { date: formatDate(item.submittedAt) })}
          {item.attempt > 1 && ` · ${t('assignment.attempt', { n: item.attempt })}`}
        </small>
      </div>
      <small className="muted">
        {item.course.title} · {item.lesson.title}
      </small>
      {item.text && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{item.text}</p>}
      {item.file && <SubmissionFileLink submissionId={item.id} file={item.file} />}
      {item.previousReview && (
        <small className="muted">
          {t('assignment.previousReview', { score: item.previousReview.score, max: item.previousReview.maxScore })}
        </small>
      )}
      <form onSubmit={save} style={{ display: 'grid', gap: 8 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {t('assignment.score')}
          <input
            className="input"
            type="number"
            required
            min={0}
            max={item.lesson.maxScore}
            step={1}
            style={{ maxWidth: 110 }}
            value={score}
            onChange={(e) => setScore(e.target.value)}
          />
          <span className="muted">/ {item.lesson.maxScore}</span>
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          {t('assignment.comment')}
          <textarea className="input" rows={3} maxLength={ASSIGNMENT_COMMENT_MAX} value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>
        {error && (
          <small role="alert" style={{ color: 'var(--err)' }}>
            {error}
          </small>
        )}
        <button className="btn" disabled={busy} style={{ justifySelf: 'start' }}>
          {item.review ? t('assignment.updateReview') : t('assignment.saveReview')}
        </button>
      </form>
    </section>
  );
}
