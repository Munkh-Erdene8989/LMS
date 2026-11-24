'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import {
  REVIEW_BODY_MAX,
  REVIEW_REPLY_MAX,
  type CourseRating,
  type CourseReviewPage,
  type ReviewView,
  type ReviewViewerState,
} from '@lms/shared';
import { api, errorText } from '@/lib/client-api';
import { formatDate, formatRating } from '@/lib/format';
import { t } from '@/lib/i18n';
import { withNext } from '@/lib/next-path';
import { Button } from '../../ui/button';
import styles from './reviews.module.css';


export function Stars({ rating }: { rating: number }) {
  return (
    <span className={styles.stars} role="img" aria-label={t('review.stars', { rating })} title={t('review.stars', { rating })}>
      {'★'.repeat(rating)}
      <span className={styles.starsOff}>{'★'.repeat(5 - rating)}</span>
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
    <section id="reviews" className={styles.root} aria-labelledby="reviews-title">
      <h2 id="reviews-title" className={styles.title}>
        {t('review.title')}
      </h2>
      <Summary rating={page.rating} />
      <ViewerBox courseId={courseId} viewer={viewer} requiredPercent={page.requiredPercent} onSaved={() => void reload()} />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {page.items.length === 0 && <p className="muted">{t('review.none')}</p>}
      {page.items.map((r) => (
        <ReviewCard
          key={r.id}
          review={r}
          canReply={!!viewer && (viewer.isTeacher || viewer.review?.id === r.id)}
          onChange={replace}
        />
      ))}
      {page.nextCursor && (
        <div>
          <Button variant="secondary" onClick={() => void more()}>
            {t('review.loadMore')}
          </Button>
        </div>
      )}
    </section>
  );
}

function Summary({ rating }: { rating: CourseRating }) {
  if (rating.average === null) return null;
  return (
    <p className={styles.summary}>
      <span className={styles.summaryNumber}>{formatRating(rating.average)}</span>
      <span className={styles.stars} aria-hidden="true">
        ★
      </span>
      <span className="muted">{t('review.summary', { rating: formatRating(rating.average), count: rating.count })}</span>
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
      <p className="muted">
        {t('review.guestHint', { required: requiredPercent })}{' '}
        <Link href={withNext('/login', `/courses/${courseId}#reviews`)}>{t('review.login')}</Link>
      </p>
    );
  }
  if (viewer.isTeacher) return <p className="muted">{t('review.teacherHint')}</p>;
  if (!viewer.review && !viewer.eligible) {
    return <p className="muted">{t('review.notEligible', { required: viewer.requiredPercent, owned: viewer.ownedPercent })}</p>;
  }
  return <ReviewForm courseId={courseId} own={viewer.review} onSaved={onSaved} />;
}

function ReviewForm({ courseId, own, onSaved }: { courseId: string; own: ReviewView | null; onSaved: () => void }) {
  const bodyId = useId();
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
    <form className={`card ${styles.form}`} onSubmit={submit}>
      <strong>{own ? t('review.yours') : t('review.write')}</strong>
      {own?.hidden && <p className={styles.error}>{t('review.hiddenNotice', { reason: own.hiddenReason ?? '' })}</p>}
      <div role="radiogroup" aria-label={t('review.starsLabel')} className={styles.starPicker}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={t('review.stars', { rating: n })}
            className={`${styles.starBtn} ${n <= rating ? styles.starOn : ''}`}
            onClick={() => setRating(n)}
          >
            ★
          </button>
        ))}
      </div>
      <label className={styles.label} htmlFor={bodyId}>
        {t('courses.reviewBodyLabel')}
      </label>
      <textarea
        id={bodyId}
        className="input"
        rows={4}
        maxLength={REVIEW_BODY_MAX}
        placeholder={t('review.bodyPlaceholder')}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className={styles.actions}>
        <Button type="submit" loading={busy}>
          {own ? t('review.update') : t('review.save')}
        </Button>
        {msg && (
          <small role={msg.ok ? 'status' : 'alert'} className={msg.ok ? undefined : styles.errorText}>
            {msg.text}
          </small>
        )}
      </div>
    </form>
  );
}

function ReviewCard({ review: r, canReply, onChange }: { review: ReviewView; canReply: boolean; onChange: (r: ReviewView) => void }) {
  const replyId = useId();
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
    <article id={`review-${r.id}`} className={`card ${styles.review}`}>
      <div className={styles.reviewHead}>
        <Stars rating={r.rating} />
        <strong>{r.author.name}</strong>
        <small className="muted">
          {formatDate(r.createdAt)}
          {r.editedAt && ` · ${t('review.edited')}`}
        </small>
      </div>
      {r.body && <p className={styles.body}>{r.body}</p>}
      {r.replies.length > 0 && (
        <div className={styles.replies}>
          {r.replies.map((x) => (
            <div key={x.id}>
              <small>
                <strong>{x.author.name}</strong>
                {x.byTeacher && <span className={styles.badge}>{t('review.teacherBadge')}</span>}
                <span className="muted"> · {formatDate(x.createdAt)}</span>
              </small>
              <p className={styles.body}>{x.body}</p>
            </div>
          ))}
        </div>
      )}
      {canReply &&
        (open ? (
          <form onSubmit={send} className={styles.form}>
            <label className={styles.srOnly} htmlFor={replyId}>
              {t('review.replyPlaceholder')}
            </label>
            <textarea
              id={replyId}
              className="input"
              rows={3}
              required
              maxLength={REVIEW_REPLY_MAX}
              placeholder={t('review.replyPlaceholder')}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <div className={styles.actions}>
              <Button type="submit" size="sm" loading={busy} disabled={!body.trim()}>
                {t('review.send')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                {t('review.cancel')}
              </Button>
            </div>
            {error && (
              <small role="alert" className={styles.errorText}>
                {error}
              </small>
            )}
          </form>
        ) : (
          <div>
            <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
              {t('review.reply')}
            </Button>
          </div>
        ))}
    </article>
  );
}
