'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  REVIEW_BODY_MAX,
  REVIEW_REPLY_MAX,
  type CourseRating,
  type CourseReviewPage,
  type ReviewView,
  type ReviewViewerState,
} from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatDate } from '@/lib/format';
import { t } from '@/lib/i18n';
import { withNext } from '@/lib/next-path';

const errorText = (err: unknown) => (err instanceof ApiRequestError ? err.message : t('auth.genericError'));

export function Stars({ rating }: { rating: number }) {
  return (
    <span aria-label={t('review.stars', { rating })} title={t('review.stars', { rating })} style={{ color: '#d97706', letterSpacing: 1 }}>
      {'★'.repeat(rating)}
      <span style={{ color: 'var(--border, #d1d5db)' }}>{'★'.repeat(5 - rating)}</span>
    </span>
  );
}

/**
 * Курсийн хуудасны үнэлгээ: дундаж, өөрийн үнэлгээ (бичих/засах), жагсаалт, thread хариулт.
 * Server render-ийн access cookie дууссан байж болох тул mount үед client-ээс (refresh-тэй) дахин уншина.
 */
export function CourseReviews({ courseId, initial }: { courseId: string; initial: CourseReviewPage | null }) {
  const [page, setPage] = useState<CourseReviewPage | null>(initial);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const r = await api<CourseReviewPage>(`/catalog/courses/${courseId}/reviews`);
    setPage(r.data);
  }, [courseId]);

  useEffect(() => {
    reload().catch(() => undefined);
  }, [reload]);

  async function more() {
    if (!page?.nextCursor) return;
    try {
      const r = await api<CourseReviewPage>(`/catalog/courses/${courseId}/reviews?before=${page.nextCursor}`);
      setPage({ ...r.data, items: [...page.items, ...r.data.items] });
    } catch (err) {
      setError(errorText(err));
    }
  }

  /** Хариулт/засварын дараа тухайн үнэлгээг жагсаалтад солино. */
  const replace = (r: ReviewView) =>
    setPage((p) =>
      p && {
        ...p,
        items: p.items.map((x) => (x.id === r.id ? r : x)),
        viewer: p.viewer && p.viewer.review?.id === r.id ? { ...p.viewer, review: r } : p.viewer,
      },
    );

  if (!page) return null;
  const viewer = page.viewer;

  return (
    <section id="reviews" style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0 }}>{t('review.title')}</h2>
      <Summary rating={page.rating} />
      <ViewerBox courseId={courseId} viewer={viewer} requiredPercent={page.requiredPercent} onSaved={() => void reload()} />
      {error && <p style={{ margin: 0, color: 'var(--err)' }}>{error}</p>}
      {page.items.length === 0 && <p className="muted" style={{ margin: 0 }}>{t('review.none')}</p>}
      {page.items.map((r) => (
        <ReviewCard
          key={r.id}
          review={r}
          canReply={!!viewer && (viewer.isTeacher || viewer.review?.id === r.id)}
          onChange={replace}
        />
      ))}
      {page.nextCursor && (
        <button type="button" className="btn btn-ghost" onClick={() => void more()}>
          {t('review.loadMore')}
        </button>
      )}
    </section>
  );
}

function Summary({ rating }: { rating: CourseRating }) {
  if (rating.average === null) return null;
  return (
    <p style={{ margin: 0, fontSize: 18 }}>
      <strong>{t('review.summary', { rating: rating.average.toFixed(1), count: rating.count })}</strong>
    </p>
  );
}

function ViewerBox({
  courseId,
  viewer,
  requiredPercent,
  onSaved,
}: {
  courseId: string;
  viewer: ReviewViewerState | null;
  requiredPercent: number;
  onSaved: () => void;
}) {
  if (!viewer) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        {t('review.guestHint', { required: requiredPercent })}{' '}
        <Link href={withNext('/login', `/courses/${courseId}#reviews`)}>{t('review.login')}</Link>
      </p>
    );
  }
  if (viewer.isTeacher) return <p className="muted" style={{ margin: 0 }}>{t('review.teacherHint')}</p>;
  if (!viewer.review && !viewer.eligible) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        {t('review.notEligible', { required: viewer.requiredPercent, owned: viewer.ownedPercent })}
      </p>
    );
  }
  return <ReviewForm courseId={courseId} own={viewer.review} onSaved={onSaved} />;
}

function ReviewForm({ courseId, own, onSaved }: { courseId: string; own: ReviewView | null; onSaved: () => void }) {
  const [rating, setRating] = useState(own?.rating ?? 0);
  const [body, setBody] = useState(own?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setRating(own?.rating ?? 0);
    setBody(own?.body ?? '');
  }, [own]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) return setMsg({ ok: false, text: t('review.chooseRating') });
    setBusy(true);
    setMsg(null);
    try {
      await api<ReviewView>(`/courses/${courseId}/review`, { method: 'PUT', body: { rating, body } });
      setMsg({ ok: true, text: t('review.saved') });
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} style={{ display: 'grid', gap: 8 }}>
      <strong>{own ? t('review.yours') : t('review.write')}</strong>
      {own?.hidden && (
        <p style={{ margin: 0, color: 'var(--err)' }}>{t('review.hiddenNotice', { reason: own.hiddenReason ?? '' })}</p>
      )}
      <div role="radiogroup" aria-label={t('review.starsLabel')} style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={t('review.stars', { rating: n })}
            className="btn-icon"
            onClick={() => setRating(n)}
            style={{ fontSize: 26, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', color: n <= rating ? '#d97706' : '#d1d5db' }}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        className="input"
        rows={4}
        maxLength={REVIEW_BODY_MAX}
        placeholder={t('review.bodyPlaceholder')}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="submit" className="btn" disabled={busy}>
          {own ? t('review.update') : t('review.save')}
        </button>
        {msg && (
          <small role={msg.ok ? 'status' : 'alert'} style={{ color: msg.ok ? undefined : 'var(--err)' }}>
            {msg.text}
          </small>
        )}
      </div>
    </form>
  );
}

function ReviewCard({ review: r, canReply, onChange }: { review: ReviewView; canReply: boolean; onChange: (r: ReviewView) => void }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<ReviewView>(`/reviews/${r.id}/replies`, { method: 'POST', body: { body } });
      onChange(res.data);
      setBody('');
      setOpen(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article id={`review-${r.id}`} className="card" style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Stars rating={r.rating} />
        <strong>{r.author.name}</strong>
        <small className="muted">
          {formatDate(r.createdAt)}
          {r.editedAt && ` · ${t('review.edited')}`}
        </small>
      </div>
      {r.body && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.body}</p>}
      {r.replies.length > 0 && (
        <div style={{ display: 'grid', gap: 6, borderLeft: '3px solid var(--border, #e5e7eb)', paddingLeft: 12, marginTop: 4 }}>
          {r.replies.map((x) => (
            <div key={x.id}>
              <small>
                <strong>{x.author.name}</strong>
                {x.byTeacher && <span className="pill" style={{ marginLeft: 6 }}>{t('review.teacherBadge')}</span>}
                <span className="muted"> · {formatDate(x.createdAt)}</span>
              </small>
              <p style={{ margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>{x.body}</p>
            </div>
          ))}
        </div>
      )}
      {canReply &&
        (open ? (
          <form onSubmit={send} style={{ display: 'grid', gap: 6 }}>
            <textarea
              className="input"
              rows={3}
              required
              maxLength={REVIEW_REPLY_MAX}
              placeholder={t('review.replyPlaceholder')}
              aria-label={t('review.replyPlaceholder')}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-small" disabled={busy || !body.trim()}>
                {t('review.send')}
              </button>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setOpen(false)}>
                {t('review.cancel')}
              </button>
            </div>
            {error && <small role="alert" style={{ color: 'var(--err)' }}>{error}</small>}
          </form>
        ) : (
          <div>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setOpen(true)}>
              {t('review.reply')}
            </button>
          </div>
        ))}
    </article>
  );
}
